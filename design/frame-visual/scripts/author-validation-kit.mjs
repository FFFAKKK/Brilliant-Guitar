import { build } from "esbuild";
import ts from "typescript";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const frameRoot = fileURLToPath(new URL("../", import.meta.url));
export const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const authorFiles = Object.freeze(["panel-plugin.js", "command-plugin.js", "readonly-view-plugin.js"]);
export const hash = bytes => createHash("sha256").update(bytes).digest("hex");
export function isWithin(parent, path) {
  const tail = relative(parent, path);
  return tail === "" || (!isAbsolute(tail) && tail !== ".." && !tail.startsWith("..\\") && !tail.startsWith("../"));
}

/** Distribution only: compile the existing SDK, never a second platform implementation. */
export async function createAuthorKitFiles() {
  const entry = 'export { definePlugin } from "./src/plugins/plugin-sdk.ts";';
  const sdk = await build({
    absWorkingDir: projectRoot,
    stdin: { contents: entry,
      resolveDir: join(projectRoot, "apps", "workbench"), sourcefile: "public-author-sdk.ts" },
    bundle: true, format: "esm", target: "es2022", write: false, metafile: true,
    legalComments: "inline", sourcemap: false,
    banner: { js: "// Generated from the existing public SDK; exports definePlugin only." },
  });
  const sources = [];
  for (const path of Object.keys(sdk.metafile.inputs).sort()) {
    const absolute = resolve(projectRoot, path);
    if (absolute === join(projectRoot, "apps", "workbench", "public-author-sdk.ts")) {
      sources.push({ path: "virtual:public-author-sdk.ts", sha256: hash(entry) });
      continue;
    }
    if (!isWithin(projectRoot, absolute) || /[\\/]src[\\/]host[\\/]|[\\/]plugin-platform\.ts$/.test(absolute)) {
      throw new Error("Author SDK must not include host/platform implementation");
    }
    sources.push({ path: relative(projectRoot, absolute).replaceAll("\\", "/"), sha256: hash(await readFile(absolute)) });
  }
  const files = new Map([
    ["sdk.mjs", sdk.outputFiles[0].contents],
    ["package.json", Buffer.from('{"private":true,"type":"module"}\n')],
    ["README.md", await readFile(join(frameRoot, "author-validation-guide-v4.md"))],
  ]);
  for (const name of authorFiles) {
    const path = join(frameRoot, "examples", "foundation", name);
    const source = await readFile(path, "utf8");
    const old = '"../../src/vendor/plugin-platform.js"';
    if (source.split(old).length !== 2) throw new Error(`Review public SDK import in ${name}`);
    files.set(name, Buffer.from(source.replace(old, '"./sdk.mjs"')));
    sources.push({ path: relative(projectRoot, path).replaceAll("\\", "/"), sha256: hash(source) });
  }
  sources.push({ path: "design/frame-visual/author-validation-guide-v4.md", sha256: hash(files.get("README.md")) });
  files.set("kit-manifest.json", Buffer.from(JSON.stringify({ format: 1, apiVersion: "4.0", uiContractVersion: 1,
    qualification: "reference-self-check-only", sources,
    files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes) })),
  }, null, 2) + "\n"));
  return files;
}

function checkStaticModule(path, source) {
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function visit(node) {
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
      throw new Error("Author trial accepts static ESM imports only");
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}

/** Dependency discipline for qualification; this is not an execution sandbox. */
export async function validateAuthorDirectory(directory, expectedFiles = null) {
  const root = await realpath(resolve(directory));
  const repository = await realpath(projectRoot);
  if (!isWithin(repository, root)) throw new Error("Author submission must be in the project workspace");
  const expected = expectedFiles ?? await createAuthorKitFiles();
  const sdkPath = await realpath(join(root, "sdk.mjs"));
  if (!isWithin(root, sdkPath) || !(await readFile(sdkPath)).equals(expected.get("sdk.mjs"))) {
    throw new Error("Submission SDK does not match the current public SDK");
  }
  const metadataPath = await realpath(join(root, "package.json"));
  if (!isWithin(root, metadataPath)) throw new Error("Author metadata escapes the submission directory");
  const metadataBytes = await readFile(metadataPath);
  const metadata = JSON.parse(metadataBytes.toString("utf8"));
  if (metadata.type !== "module") throw new Error("Author submission package.json must select type=module");
  const seen = new Map();
  const graph = await build({ entryPoints: authorFiles.map(name => join(root, name)),
    bundle: true, format: "esm", outdir: "author-check-only", write: false, metafile: true, logLevel: "silent",
    plugins: [{ name: "public-author-imports", setup(builder) {
      builder.onResolve({ filter: /.*/ }, async args => {
        if (args.importer && !args.path.startsWith("./") && !args.path.startsWith("../")) {
          throw new Error("Author trial imports must be relative modules or ./sdk.mjs");
        }
        const path = await realpath(args.importer ? resolve(dirname(args.importer), args.path) : args.path);
        if (!isWithin(root, path)) throw new Error("Author import escapes the submission directory");
        if (path === sdkPath) return { path, external: true };
        if (!/\.(?:js|mjs)$/.test(path)) throw new Error("Author trial modules must use .js or .mjs");
        return { path };
      });
      builder.onLoad({ filter: /\.(?:js|mjs)$/ }, async ({ path }) => {
        const bytes = await readFile(path);
        checkStaticModule(path, bytes.toString("utf8"));
        seen.set(relative(root, path).replaceAll("\\", "/"), { bytes: bytes.length, sha256: hash(bytes) });
        return { contents: bytes, loader: "js" };
      });
    } }],
  });
  if (graph.warnings.length) throw new Error("Author module graph has unresolved build warnings");
  return { directory: root, sdkSha256: hash(await readFile(sdkPath)), metadataSha256: hash(metadataBytes),
    files: [...seen].sort(([a], [b]) => a.localeCompare(b)).map(([path, details]) => ({ path, ...details })) };
}
