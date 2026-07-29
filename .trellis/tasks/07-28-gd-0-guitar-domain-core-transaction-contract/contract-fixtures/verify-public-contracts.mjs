import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(fixtureDirectory, "../../../..");

const documentPaths = [
  ".trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/design.md",
  ".trellis/spec/core-kernel/backend/domain-transaction-integration.md",
];

const [prelude, assertions] = await Promise.all([
  readFile(join(fixtureDirectory, "accepted-core-prelude.d.ts"), "utf8"),
  readFile(join(fixtureDirectory, "public-contract-assertions.ts"), "utf8"),
]);

const fencePattern = /```typescript public-contract\r?\n([\s\S]*?)\r?\n```/gu;
const temporaryDirectory = await mkdtemp(join(tmpdir(), "gd0-public-contract-"));

function formatDiagnostics(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => repositoryRoot,
    getNewLine: () => "\n",
  });
}

try {
  for (const relativeDocumentPath of documentPaths) {
    const markdown = await readFile(
      join(repositoryRoot, relativeDocumentPath),
      "utf8",
    );
    const snippets = [...markdown.matchAll(fencePattern)].map((match) => match[1]);

    if (snippets.length === 0) {
      throw new Error(`${relativeDocumentPath}: no public-contract fences found`);
    }

    const sourceText = [prelude, ...snippets, assertions].join("\n\n");
    const sourceName = relativeDocumentPath.includes("/design.md")
      ? "design-contract.ts"
      : "active-spec-contract.ts";
    const sourcePath = join(temporaryDirectory, sourceName);

    const parsed = ts.createSourceFile(
      sourcePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    if (parsed.parseDiagnostics.length > 0) {
      throw new Error(formatDiagnostics(parsed.parseDiagnostics));
    }

    await writeFile(sourcePath, sourceText, "utf8");

    const program = ts.createProgram([sourcePath], {
      exactOptionalPropertyTypes: true,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);

    if (diagnostics.length > 0) {
      throw new Error(formatDiagnostics(diagnostics));
    }

    console.log(
      `[contract] ${relativeDocumentPath}: ${snippets.length} fence(s), 0 diagnostics`,
    );
  }
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
