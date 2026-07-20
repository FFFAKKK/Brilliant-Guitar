import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import assert = require("node:assert/strict");
import ts = require("typescript");

type BoundaryViolation = {
  readonly file: string;
  readonly specifier: string;
  readonly kind: "external-module" | "escapes-core";
};

const NON_LITERAL_SPECIFIER = "<non-literal>";

function readModuleSpecifier(node: ts.Node): string | undefined {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression !== undefined &&
    ts.isStringLiteralLike(node.moduleReference.expression)
  ) {
    return node.moduleReference.expression.text;
  }
  if (ts.isImportTypeNode(node)) {
    return ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
      ? node.argument.literal.text
      : NON_LITERAL_SPECIFIER;
  }
  if (ts.isCallExpression(node)) {
    const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
    const commonJsRequire =
      ts.isIdentifier(node.expression) && node.expression.text === "require";
    if (dynamicImport || commonJsRequire) {
      const argument = node.arguments[0];
      return argument !== undefined && ts.isStringLiteralLike(argument)
        ? argument.text
        : NON_LITERAL_SPECIFIER;
    }
  }
  return undefined;
}

function escapesRoot(coreRoot: string, target: string): boolean {
  const pathFromRoot = relative(coreRoot, target);
  return (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  );
}

function scanSource(
  fileName: string,
  sourceText: string,
  coreRoot: string,
): readonly BoundaryViolation[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  const violations: BoundaryViolation[] = [];

  function visit(node: ts.Node): void {
    const specifier = readModuleSpecifier(node);
    if (specifier !== undefined) {
      if (!specifier.startsWith(".")) {
        violations.push({ file: fileName, specifier, kind: "external-module" });
      } else if (escapesRoot(coreRoot, resolve(dirname(fileName), specifier))) {
        violations.push({ file: fileName, specifier, kind: "escapes-core" });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

test("dependency scanner fails closed for every forbidden module reference form", () => {
  const coreRoot = resolve("virtual", "src", "core-kernel");
  const fileName = resolve(coreRoot, "codec", "sample.ts");
  const sourceText = [
    'import React from "react";',
    'export * from "../../guitar-domain/index";',
    'const fs = require("node:fs");',
    'void import("vexflow");',
    'const moduleName = "react";',
    'void import(moduleName, { with: { type: "json" } });',
    'const builtin = "node:fs";',
    'require(builtin);',
    'type ReactType = import("react").ComponentType<unknown>;',
    'import type { Fraction } from "../domain/fraction";',
    'type FractionType = import("../domain/fraction").Fraction;',
  ].join("\n");

  assert.deepEqual(
    scanSource(fileName, sourceText, coreRoot).map(({ kind, specifier }) => ({
      kind,
      specifier,
    })),
    [
      { kind: "external-module", specifier: "react" },
      { kind: "escapes-core", specifier: "../../guitar-domain/index" },
      { kind: "external-module", specifier: "node:fs" },
      { kind: "external-module", specifier: "vexflow" },
      { kind: "external-module", specifier: "<non-literal>" },
      { kind: "external-module", specifier: "<non-literal>" },
      { kind: "external-module", specifier: "react" },
    ],
  );
});

test("Core production sources have no forbidden dependencies", () => {
  const coreRoot = resolve(process.cwd(), "src", "core-kernel");
  const violations = listTypeScriptFiles(coreRoot).flatMap((fileName) =>
    scanSource(fileName, readFileSync(fileName, "utf8"), coreRoot),
  );
  assert.deepEqual(violations, []);
});

test("migration compatibility entry has no session registry or physical IO dependency", () => {
  const entry = readFileSync(
    resolve(
      process.cwd(),
      "src",
      "core-kernel",
      "migration",
      "migrate-score-document.ts",
    ),
    "utf8",
  );
  for (const forbidden of [
    "../commands/",
    "../session/",
    "../events/",
    "../registry/runtime",
    '"node:fs"',
    '"node:path"',
  ]) {
    assert.equal(entry.includes(forbidden), false);
  }
});

function listTypeScriptFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(root, entry.name);
      if (entry.isDirectory()) {
        return listTypeScriptFiles(path);
      }
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    })
    .sort();
}
