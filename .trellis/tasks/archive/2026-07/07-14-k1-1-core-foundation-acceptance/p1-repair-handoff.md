# K1-1 三项 P1 修复实施计划

> **执行状态（2026-07-15）：已完成。** 四个独立修复提交为 `ed3605f`、`0bc11e6`、`511e243`、`30894e2`；最终基线 49/49 tests 通过，三个 P1 均已关闭。本文件保留为历史执行记录，不再表示活动阻断。

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` in inline mode to implement this plan task-by-task. Do not dispatch implementation/check subagents.

**Goal:** 以最小改动消除 K1A-FIND-001～003，使新的固定提交能够重新进入 K1-1 正式验收。

**Architecture:** 只在通用 `decodeArray` 增加结构数组 hole 判定；依赖边界使用测试侧 TypeScript AST 扫描器约束；稳定诊断闭集使用精确、确定性的表驱动负例补齐。除 `decode-score-document.ts` 外，不预设任何生产代码修改。

**Tech Stack:** TypeScript 5.8、Node.js `node:test`、`node:assert/strict`、TypeScript Compiler API、Trellis 活动 Core Kernel 规范。

## Global Constraints

- 固定起点是已验收提交 `046f0461c60b5b350d17f5c04f8234f3f426ada4`；开始前必须确认 `src/core-kernel/**` 和 `test/core-kernel/**` 没有未知工作区变更。
- 现有 `.trellis/` 规划变更属于用户文档，禁止 reset、checkout 覆盖或夹带进代码提交。
- 只允许修改一个生产文件：`src/core-kernel/codec/decode-score-document.ts`。如果其他生产文件必须修改，立即停止并返回规划者。
- 不修改 `ScoreDocument`、Fraction、NoteValue、Pitch、Feature Profile、ExtensionBlock schema 或公开导出。
- 不修改活动 `.trellis/spec/` 来迁就实现；现有 sparse-array、closed diagnostic code 和 pure-kernel boundary 合同已经足够明确。
- 不实现 Guitar Domain、K1-2、UI、渲染、音频、文件 IO、registry 或 plugin runtime。
- 每个行为变更先观察 RED，再做最小 GREEN；补证测试如果直接 GREEN，不制造虚假生产缺陷。
- 三个修复块分别提交，完成后固定新 HEAD 交回规划者重验；不合并主分支。

---

## 文件地图

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/core-kernel/codec/decode-score-document.ts` | 修改 | 在统一结构数组解码入口识别 hole，并返回 `decode.json-value`。 |
| `test/core-kernel/score-document-codec.test.ts` | 修改 | 覆盖结构数组 hole 和 4 个缺失 decode code。 |
| `test/core-kernel/forbidden-dependency-boundary.test.ts` | 新建 | 用 AST 同时验证扫描器自身和真实 Core 依赖边界。 |
| `test/core-kernel/score-semantics.test.ts` | 修改 | 覆盖 15 个尚未显式断言的 semantic code。 |
| `.trellis/spec/**` | 不修改 | 活动合同保持不变。 |

## Task 0：隔离规划文档与实现工作区

**Files:** 无代码修改。

- [ ] **Step 1：核对当前状态**

运行：

```powershell
git status --short
git diff --name-only 046f0461c60b5b350d17f5c04f8234f3f426ada4 -- src/core-kernel test/core-kernel
```

预期：第二条命令无输出。若有源码或测试差异，停止；不得覆盖这些差异。

- [ ] **Step 2：隔离文档变更**

如果操作者在当前工作区执行，先把现有 `.trellis/` 文档作为独立治理变更处理；如果没有文档提交权限，则使用独立干净 worktree 执行代码修复。任何情况下都不要把验收文档与下面三个代码/测试提交混在一起。

---

## Task 1：修复结构型稀疏数组诊断

**Files:**

- Modify: `test/core-kernel/score-document-codec.test.ts`
- Modify: `src/core-kernel/codec/decode-score-document.ts:132-156`

**Interfaces:**

- Consumes: `decodeScoreDocument(value: unknown): DecodeScoreDocumentResult`
- Produces: 所有经 `decodeArray` 解码的结构数组 hole 均返回 `decode.json-value` 和精确索引 path。

- [ ] **Step 1：增加结构数组 RED 测试**

在 `score-document-codec.test.ts` 末尾追加：

```typescript
test("codec reports structural sparse-array holes as invalid JSON values", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  const decode = api.decodeScoreDocument as (value: unknown) => DecodeResult;

  const topLevel = cloneCoreScoreFixture() as unknown as { parts: unknown[] };
  topLevel.parts = new Array<unknown>(1);
  assert.deepEqual(decode(topLevel), {
    ok: false,
    diagnostics: [
      {
        code: "decode.json-value",
        messageKey: "core.decode.json-value",
        path: ["parts", 0],
      },
    ],
  });

  const nested = cloneCoreScoreFixture() as unknown as {
    parts: Array<{
      measureContents: Array<{
        voices: Array<{ sequence: { events: unknown[] } }>;
      }>;
    }>;
  };
  nested.parts[0]!.measureContents[0]!.voices[0]!.sequence.events =
    new Array<unknown>(1);
  assert.deepEqual(decode(nested), {
    ok: false,
    diagnostics: [
      {
        code: "decode.json-value",
        messageKey: "core.decode.json-value",
        path: [
          "parts",
          0,
          "measureContents",
          0,
          "voices",
          0,
          "sequence",
          "events",
          0,
        ],
      },
    ],
  });
});
```

- [ ] **Step 2：运行测试并确认正确 RED**

运行：

```powershell
npm run build
node --test dist/test/core-kernel/score-document-codec.test.js
```

预期：新测试失败；actual 为 `decode.type`，expected 为 `decode.json-value`。如果失败原因是编译错误，先修正测试类型，编译错误不算 RED。

- [ ] **Step 3：对 `decodeArray` 做最小修正**

只把原循环改为：

```typescript
  const output: T[] = [];
  let valid = true;
  for (let index = 0; index < input.length; index += 1) {
    const itemPath = [...path, index];
    if (!Object.prototype.hasOwnProperty.call(input, index)) {
      context.add("decode.json-value", itemPath);
      valid = false;
      continue;
    }
    const decoded = decodeItem(input[index], itemPath, context);
    if (decoded === undefined) {
      valid = false;
    } else {
      output.push(decoded);
    }
  }
  return valid ? output : undefined;
```

不要修改 `DecodeContext.array`，否则会丢失精确 hole 索引；不要修改 `decodeJsonValue`，它已有 payload sparse-array 测试和正确 code。

- [ ] **Step 4：运行目标回归**

```powershell
npm run build
node --test dist/test/core-kernel/score-document-codec.test.js
```

预期：目标文件全部通过，原 ExtensionBlock sparse-array 测试继续返回 `decode.json-value`。

- [ ] **Step 5：形成独立提交**

只提交上述两个文件，建议提交信息：

```text
fix(core): classify structural sparse arrays as invalid json
```

---

## Task 2：建立真实 forbidden-dependency 回归边界

**Files:**

- Create: `test/core-kernel/forbidden-dependency-boundary.test.ts`

**Interfaces:**

- Consumes: `src/core-kernel/**/*.ts` 源文件。
- Produces: 对 external module、Node builtin、dynamic import、`require()` 和逃逸出 Core 根目录的相对 import 的可失败测试。

- [ ] **Step 1：先写扫描器的失败契约**

新文件先放入 imports、`BoundaryViolation` 类型、两个测试和临时 `scanSource`：

```typescript
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

function scanSource(
  _fileName: string,
  _sourceText: string,
  _coreRoot: string,
): readonly BoundaryViolation[] {
  return [];
}

test("dependency scanner detects external, builtin, dynamic, require, and escaping imports", () => {
  const coreRoot = resolve("virtual", "src", "core-kernel");
  const fileName = resolve(coreRoot, "codec", "sample.ts");
  const sourceText = [
    'import React from "react";',
    'export * from "../../guitar-domain/index";',
    'const fs = require("node:fs");',
    'void import("vexflow");',
    'import type { Fraction } from "../domain/fraction";',
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
```

运行 `npm run typecheck`。预期类型检查通过。再运行 `npm run build` 和目标测试；第一个测试必须 RED，因为临时扫描器返回空数组。

- [ ] **Step 2：用 TypeScript AST 完成扫描器**

用下面实现替换临时 `scanSource`，并在它前面加入 `readModuleSpecifier` 与 `escapesRoot`：

```typescript
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
  if (ts.isCallExpression(node) && node.arguments.length === 1) {
    const argument = node.arguments[0];
    const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
    const commonJsRequire =
      ts.isIdentifier(node.expression) && node.expression.text === "require";
    if (
      argument !== undefined &&
      (dynamicImport || commonJsRequire) &&
      ts.isStringLiteralLike(argument)
    ) {
      return argument.text;
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
```

这个边界有意禁止 Core 的所有非相对生产依赖，包括 `node:*`；测试文件自身使用 Node 和 TypeScript Compiler API 不属于生产边界。

- [ ] **Step 3：运行目标测试**

```powershell
npm run typecheck
npm run build
node --test dist/test/core-kernel/forbidden-dependency-boundary.test.js
```

预期：合成恶意 source 被正确识别，真实 `src/core-kernel` 返回空 violation。

- [ ] **Step 4：形成 test-only 提交**

建议提交信息：

```text
test(core): enforce pure kernel dependency boundary
```

---

## Task 3：补齐稳定诊断闭集的显式断言

**Files:**

- Modify: `test/core-kernel/score-document-codec.test.ts`
- Modify: `test/core-kernel/score-semantics.test.ts`

**Interfaces:**

- Consumes: `decodeScoreDocument`、`parseScoreDocumentJson`、`encodeScoreDocumentJson`、`validateScoreDocumentSemantics`。
- Produces: decode 10/10、semantic 31/31、unsupported 11/11 的完整 code 字符串断言，并固定 messageKey、path、必要 details 和确定性。

### Task 3A：四个 decode code

- [ ] **Step 1：扩展测试侧 Diagnostic 类型**

在 `score-document-codec.test.ts` 的 `Diagnostic` 中加入：

```typescript
  readonly details?: Readonly<Record<string, unknown>>;
```

- [ ] **Step 2：追加 required/type/non-finite 负例**

```typescript
test("codec covers required, type, and finite-number diagnostic contracts", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  const decode = api.decodeScoreDocument as (value: unknown) => DecodeResult;

  const missingId = cloneCoreScoreFixture() as unknown as Record<string, unknown>;
  delete missingId.id;
  assert.deepEqual(decode(missingId), {
    ok: false,
    diagnostics: [
      {
        code: "decode.required-field",
        messageKey: "core.decode.required-field",
        path: ["id"],
        details: { field: "id" },
      },
    ],
  });

  const wrongId = cloneCoreScoreFixture() as unknown as Record<string, unknown>;
  wrongId.id = 42;
  assert.deepEqual(decode(wrongId), {
    ok: false,
    diagnostics: [
      {
        code: "decode.type",
        messageKey: "core.decode.type",
        path: ["id"],
        details: { expected: "string" },
      },
    ],
  });

  const nonFinite = cloneCoreScoreFixture() as unknown as {
    metadata: { tempo: { bpm: number } };
  };
  nonFinite.metadata.tempo.bpm = Number.NaN;
  assert.deepEqual(decode(nonFinite), {
    ok: false,
    diagnostics: [
      {
        code: "decode.non-finite-number",
        messageKey: "core.decode.non-finite-number",
        path: ["metadata", "tempo", "bpm"],
      },
    ],
  });
});
```

- [ ] **Step 3：追加 encode-failed 负例并保证全局恢复**

```typescript
test("encoder converts JSON stringify failure into a stable diagnostic", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  const encode = api.encodeScoreDocumentJson as (value: unknown) => EncodeResult;
  const descriptor = Object.getOwnPropertyDescriptor(JSON, "stringify");
  assert.ok(descriptor);

  Object.defineProperty(JSON, "stringify", {
    ...descriptor,
    value: (): never => {
      throw new Error("synthetic stringify failure");
    },
  });
  try {
    assert.deepEqual(encode(createCoreScoreFixture()), {
      ok: false,
      diagnostics: [
        {
          code: "decode.encode-failed",
          messageKey: "core.decode.encode-failed",
          path: [],
        },
      ],
    });
  } finally {
    Object.defineProperty(JSON, "stringify", descriptor);
  }
});
```

不得删除 `finally`；不得把原始异常文本放入 diagnostic details。

### Task 3B：十五个 semantic code

- [ ] **Step 4：扩展 Diagnostic 并增加统一精确断言 helper**

在 `score-semantics.test.ts` 的 `Diagnostic` 中加入 `details`，随后在 `getValidator` 后加入：

```typescript
type ExpectedDiagnostic = {
  readonly code: string;
  readonly messageKey: string;
  readonly path: readonly (string | number)[];
  readonly details?: Readonly<Record<string, unknown>>;
};

function expectDiagnostics(
  document: unknown,
  expected: readonly ExpectedDiagnostic[],
): void {
  const validate = getValidator();
  const first = validate(document);
  assert.equal(first.ok, false);
  assert.deepEqual(first.diagnostics, expected);
  assert.deepEqual(validate(document), first);
}
```

- [ ] **Step 5：追加 ID、Fraction 与 meter 合同测试**

```typescript
test("semantic diagnostics cover empty ids, fraction signs, and invalid meters", () => {
  const emptyId = cloneCoreScoreFixture() as unknown as { id: string };
  emptyId.id = "";
  expectDiagnostics(emptyId, [
    { code: "semantic.id-empty", messageKey: "core.semantic.id-empty", path: ["id"] },
  ]);

  const negativeStart = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ measureContents: Array<{ voices: Array<{
      sequence: { start: { numerator: number; denominator: number } };
    }> }> }>;
  };
  negativeStart.parts[0]!.measureContents[0]!.voices[0]!.sequence.start = {
    numerator: -1,
    denominator: 1,
  };
  expectDiagnostics(negativeStart, [
    {
      code: "semantic.fraction-sign-invalid",
      messageKey: "core.semantic.fraction-sign-invalid",
      path: ["parts", 0, "measureContents", 0, "voices", 0, "sequence", "start"],
    },
  ]);

  const numerator = cloneCoreScoreFixture() as unknown as {
    measureDefinitions: Array<{ meter: { numerator: number } }>;
  };
  numerator.measureDefinitions[0]!.meter.numerator = 0;
  expectDiagnostics(numerator, [
    {
      code: "semantic.meter-numerator-invalid",
      messageKey: "core.semantic.meter-numerator-invalid",
      path: ["measureDefinitions", 0, "meter", "numerator"],
    },
    {
      code: "semantic.measure-duration-invalid",
      messageKey: "core.semantic.measure-duration-invalid",
      path: ["parts", 0, "measureContents", 0, "voices", 0, "sequence", "start"],
      details: { reason: "meter-numerator-invalid" },
    },
  ]);

  const denominator = cloneCoreScoreFixture() as unknown as {
    measureDefinitions: Array<{ meter: { denominator: number } }>;
  };
  denominator.measureDefinitions[0]!.meter.denominator = 3;
  expectDiagnostics(denominator, [
    {
      code: "semantic.meter-denominator-invalid",
      messageKey: "core.semantic.meter-denominator-invalid",
      path: ["measureDefinitions", 0, "meter", "denominator"],
    },
    {
      code: "semantic.measure-duration-invalid",
      messageKey: "core.semantic.measure-duration-invalid",
      path: ["parts", 0, "measureContents", 0, "voices", 0, "sequence", "start"],
      details: { reason: "meter-denominator-invalid" },
    },
  ]);
});
```

- [ ] **Step 6：追加 NoteValue、overflow、pickup 与 sequence-start 测试**

```typescript
test("semantic diagnostics cover note values and time boundaries", () => {
  const invalidNoteValue = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ measureContents: Array<{ voices: Array<{
      sequence: { events: Array<{ duration: { base: number; dots: number } }> };
    }> }> }>;
  };
  invalidNoteValue.parts[0]!.measureContents[0]!.voices[0]!.sequence
    .events[0]!.duration = { base: 3, dots: 0 };
  expectDiagnostics(invalidNoteValue, [
    {
      code: "semantic.note-value-invalid",
      messageKey: "core.semantic.note-value-invalid",
      path: ["parts", 0, "measureContents", 0, "voices", 0, "sequence", "events", 0, "duration"],
      details: { reason: "note-value-base-invalid" },
    },
  ]);

  const overflow = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ measureContents: Array<{ voices: Array<{
      sequence: { events: Array<{ duration: {
        base: number;
        dots: number;
        timeModification?: { actualNotes: number; normalNotes: number };
      } }> };
    }> }> }>;
  };
  overflow.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!.duration = {
    base: 4,
    dots: 3,
    timeModification: { actualNotes: 1, normalNotes: Number.MAX_SAFE_INTEGER },
  };
  expectDiagnostics(overflow, [
    {
      code: "semantic.time-arithmetic-overflow",
      messageKey: "core.semantic.time-arithmetic-overflow",
      path: ["parts", 0, "measureContents", 0, "voices", 0, "sequence", "events", 0, "duration"],
      details: { reason: "fraction-overflow" },
    },
  ]);

  const pickup = cloneCoreScoreFixture() as unknown as {
    measureDefinitions: Array<{
      pickupDuration?: { numerator: number; denominator: number };
    }>;
  };
  pickup.measureDefinitions[0]!.pickupDuration = { numerator: 5, denominator: 4 };
  expectDiagnostics(pickup, [
    {
      code: "semantic.pickup-exceeds-measure",
      messageKey: "core.semantic.pickup-exceeds-measure",
      path: ["measureDefinitions", 0, "pickupDuration"],
    },
  ]);

  const start = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ measureContents: Array<{ voices: Array<{
      sequence: {
        start: { numerator: number; denominator: number };
        events: unknown[];
      };
    }> }> }>;
  };
  const sequence = start.parts[0]!.measureContents[0]!.voices[0]!.sequence;
  sequence.start = { numerator: 5, denominator: 4 };
  sequence.events = [];
  expectDiagnostics(start, [
    {
      code: "semantic.sequence-start-out-of-bounds",
      messageKey: "core.semantic.sequence-start-out-of-bounds",
      path: ["parts", 0, "measureContents", 0, "voices", 0, "sequence", "start"],
    },
  ]);
});
```

- [ ] **Step 7：追加引用和 required collection 测试**

```typescript
test("semantic diagnostics cover measure references and required staff and voice collections", () => {
  const missingMeasure = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ measureContents: Array<{ measureId: string }> }>;
  };
  missingMeasure.parts[0]!.measureContents[0]!.measureId = "missing-measure";
  expectDiagnostics(missingMeasure, [
    {
      code: "semantic.measure-reference-missing",
      messageKey: "core.semantic.measure-reference-missing",
      path: ["parts", 0, "measureContents", 0, "measureId"],
    },
    {
      code: "semantic.measure-coverage-missing",
      messageKey: "core.semantic.measure-coverage-missing",
      path: ["parts", 0, "measureContents"],
      details: { measureId: "measure-1" },
    },
  ]);

  const noStaff = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ staves: unknown[] }>;
  };
  noStaff.parts[0]!.staves = [];
  expectDiagnostics(noStaff, [
    {
      code: "semantic.staff-required",
      messageKey: "core.semantic.staff-required",
      path: ["parts", 0, "staves"],
    },
    {
      code: "semantic.staff-reference-missing",
      messageKey: "core.semantic.staff-reference-missing",
      path: ["parts", 0, "measureContents", 0, "voices", 0, "defaultStaffId"],
    },
  ]);

  const noVoice = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ measureContents: Array<{ voices: unknown[] }> }>;
  };
  noVoice.parts[0]!.measureContents[0]!.voices = [];
  expectDiagnostics(noVoice, [
    {
      code: "semantic.voice-required",
      messageKey: "core.semantic.voice-required",
      path: ["parts", 0, "measureContents", 0, "voices"],
    },
  ]);
});
```

- [ ] **Step 8：追加 pitch 与 staff line 测试**

```typescript
test("semantic diagnostics cover written, sounding, and staff-line pitch boundaries", () => {
  const written = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ measureContents: Array<{ voices: Array<{
      sequence: { events: Array<{ content: {
        kind: string;
        notes: Array<{ writtenPitch: { step: string } }>;
      } }> };
    }> }> }>;
  };
  written.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!
    .content.notes[0]!.writtenPitch.step = "H";
  expectDiagnostics(written, [
    {
      code: "semantic.written-pitch-invalid",
      messageKey: "core.semantic.written-pitch-invalid",
      path: ["parts", 0, "measureContents", 0, "voices", 0, "sequence", "events", 0, "content", "notes", 0, "writtenPitch"],
    },
  ]);

  const sounding = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ instrument: {
      writtenToSounding: { chromaticSemitones: number };
    } }>;
  };
  sounding.parts[0]!.instrument.writtenToSounding.chromaticSemitones = 100;
  expectDiagnostics(sounding, [
    {
      code: "semantic.sounding-pitch-invalid",
      messageKey: "core.semantic.sounding-pitch-invalid",
      path: ["parts", 0, "measureContents", 0, "voices", 0, "sequence", "events", 0, "content", "notes", 0, "writtenPitch"],
      details: { reason: "derived-pitch-alter-out-of-range" },
    },
  ]);

  const staffLines = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ staves: Array<{ lineCount: number }> }>;
  };
  staffLines.parts[0]!.staves[0]!.lineCount = 0;
  expectDiagnostics(staffLines, [
    {
      code: "semantic.staff-line-count-invalid",
      messageKey: "core.semantic.staff-line-count-invalid",
      path: ["parts", 0, "staves", 0, "lineCount"],
    },
  ]);
});
```

如果 TypeScript 因 `content.kind` 的测试侧窄化报错，只调整测试侧 `as unknown as` 结构，不得使用 `any`、`@ts-ignore` 或修改生产类型。

- [ ] **Step 9：运行诊断目标测试**

```powershell
npm run typecheck
npm run build
node --test dist/test/core-kernel/score-document-codec.test.js
node --test dist/test/core-kernel/score-semantics.test.js
```

预期：这些补证测试大多会直接 GREEN，因为当前分支能够产生相应 code。若实际 code、path、details 或顺序不同，先确认测试输入是否引入了额外无效状态；确认是生产行为偏差后，把它记录为新的 P1，再做单独最小修复，不得先改弱断言。

- [ ] **Step 10：确认闭集字符串覆盖归零**

运行下面 PowerShell 核对；三个 `missing` 都必须为 0：

```powershell
$diag = Get-Content -LiteralPath 'src/core-kernel/validation/diagnostics.ts' -Raw -Encoding utf8
$tests = (Get-ChildItem -LiteralPath 'test/core-kernel' -Recurse -Filter '*.test.ts' -File | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw -Encoding utf8 }) -join "`n"
foreach ($prefix in @('decode','semantic','unsupported')) {
  $defined = [regex]::Matches($diag, '"(' + $prefix + '\.[a-z0-9-]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
  $asserted = $defined | Where-Object { $tests.Contains('"' + $_ + '"') -or $tests.Contains("'" + $_ + "'") }
  $missing = $defined | Where-Object { $_ -notin $asserted }
  Write-Output ($prefix + ': defined=' + $defined.Count + ' asserted=' + $asserted.Count + ' missing=' + $missing.Count)
  $missing
}
```

字符串覆盖为 0 只是辅助检查；完整对象断言和确定性复跑才是合同证据。

- [ ] **Step 11：形成 test-only 提交**

建议提交信息：

```text
test(core): cover stable diagnostic codes
```

---

## Task 4：完整验证与重验交接

**Files:** 不新增功能文件。

- [ ] **Step 1：运行全部质量命令**

```powershell
npm run typecheck
npm run build
npm test
git diff --check
```

预期：全部退出码 0；完整测试总数大于原 40，失败数为 0。沙箱若再次出现 `spawn EPERM`，按环境权限在获批上下文重跑，不能把环境失败写成产品失败或测试通过。

- [ ] **Step 2：核对生产改动范围**

```powershell
git diff --name-only 046f0461c60b5b350d17f5c04f8234f3f426ada4 -- src/core-kernel
```

预期唯一生产文件：

```text
src/core-kernel/codec/decode-score-document.ts
```

若出现其他生产文件，停止并解释其必要性；不得带着未批准扩大范围进入重验。

- [ ] **Step 3：人工复核三个 Gate**

- 结构型 `parts` 和嵌套 `events` hole 都返回 `decode.json-value` 与精确索引 path。
- AST 扫描器对合成违禁依赖能够失败，对真实 Core 返回空列表。
- decode/semantic/unsupported 闭集显式字符串覆盖分别达到 10/10、31/31、11/11，且每个新增负例断言完整 diagnostic 对象和重复运行确定性。

- [ ] **Step 4：固定新提交并交回规划者**

向规划者提供：

1. 新 HEAD 完整 hash；
2. 三个修复提交的 hash 与文件列表；
3. typecheck/build/test/diff-check 的退出码和测试摘要；
4. 是否出现计划外生产修改或新的 P1；
5. `git status --short` 输出。

规划者将在新 hash 上重新执行只读验收。重验通过前，禁止合入、Guitar Domain 和 K1-2。

## 操作者停止条件

- 需要修改 `decode-score-document.ts` 之外的生产文件。
- 新测试证明稳定规范与现有公开模型存在新的直接冲突。
- 无法让某个 closed diagnostic code 通过公共 API 可达，或只能靠 `any`、`@ts-ignore`、改弱断言才能通过。
- 依赖扫描器对当前合法相对 import 产生误报，且无法通过路径解析规则修正。
- 当前工作区出现不属于本修复的源码/测试变更。

满足任一条件时，操作者应停止并把精确输入、实际输出、文件 diff 和命令结果交回规划者，不自行扩大任务。
