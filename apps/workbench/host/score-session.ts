import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { validateNewScoreInput } from "../src/contracts/new-score.ts";
import type { NewScoreInput } from "../src/contracts/new-score.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import { projectNotation } from "./notation-projection.ts";
import { prepareEventProperties } from "./event-properties-command.ts";
import { decodeScoreDocument, encodeScoreDocumentJson } from "../.kernel/src/core-kernel/index.js";
import type { CreateScoreDocumentInputV1, InsertMeasureCommand, IntegratedCommandBus, ScoreDocument, Voice } from "../.kernel/src/core-kernel/index.js";
import { readNativeRuleWarningPageV1 } from "../.kernel/src/core-kernel/native/integrated-command-bus.js";
import type { IntegratedNativeAddonV2, KernelRuleWarningV1 } from "../.kernel/src/core-kernel/native/integrated-command-bus.js";

import { durationUnits, isScoreEditRequest } from "../src/contracts/note-input.ts";
import type { ScoreEditRequest } from "../src/contracts/note-input.ts";
import type { BatchCommand, RemoveEventCommand, InsertNotesEventCommand, InsertRestEventCommand } from "../.kernel/src/core-kernel/index.js";
import type { WorkbenchIssue, WorkbenchIssueTarget } from "../src/contracts/workbench-issue.ts";
import { restDurations } from "./rest-durations.ts";
const require = createRequire(import.meta.url);

export class WorkbenchHostError extends Error {
  readonly status: number;
  readonly issue: WorkbenchIssue | undefined;
  constructor(message: string, status = 400, cause?: unknown, issue?: WorkbenchIssue) {
    super(message, { cause }); this.status = status; this.issue = issue;
  }
}

function issue(code: string, message: string, target: WorkbenchIssueTarget,
  source: WorkbenchIssue["source"] = "editor", retryable?: boolean): WorkbenchIssue {
  return { code, message, severity: "error", source, target, ...(retryable === undefined ? {} : { retryable }) };
}

function actionTarget(current: ScoreSessionRead, action: ScoreEditRequest["action"]): WorkbenchIssueTarget {
  if (action.kind === "append") return { scope: "measure", measureId: action.measureId };
  if (action.kind === "delete-event" || action.kind === "set-event-properties") {
    if (current.notation.kind === "staff") {
      const measure = current.notation.measures.find((item) => item.events.some((event) => event.id === action.eventId));
      if (measure) return { scope: "event", measureId: measure.id, eventId: action.eventId };
    }
  }
  return { scope: "workbench" };
}

function failureCode(failure: unknown): string {
  if (typeof failure !== "object" || failure === null) return "core.command-rejected";
  const value = failure as { readonly code?: unknown; readonly failure?: unknown };
  if (value.code === "command.batch-child-rejected" && value.failure) return failureCode(value.failure);
  return typeof value.code === "string" && value.code ? `core.${value.code}` : "core.command-rejected";
}

function readRuleWarnings(bus: IntegratedCommandBus, documentId: string, documentVersion: number): readonly KernelRuleWarningV1[] {
  const warnings: KernelRuleWarningV1[] = [];
  let offset = 0;
  for (;;) {
    const page = readNativeRuleWarningPageV1(bus, documentId, documentVersion, offset, 4_096);
    if (!page.ok) throw new WorkbenchHostError("无法读取当前谱面规则状态", 503, page.failure);
    if (page.value.documentId !== documentId || page.value.documentVersion !== documentVersion
      || page.value.offset !== offset) throw new WorkbenchHostError("谱面规则状态与当前版本不一致", 503);
    warnings.push(...page.value.warnings);
    if (page.value.nextOffset === null) return warnings;
    if (page.value.nextOffset <= offset) throw new WorkbenchHostError("谱面规则分页状态无效", 503);
    offset = page.value.nextOffset;
  }
}

/** Only public Core/SDK exports and the documented Native opt-in host adapter. */
export function createScoreSession(input: NewScoreInput, nativeAddon?: IntegratedNativeAddonV2): IntegratedCommandBus {
  if (Object.keys(validateNewScoreInput(input)).length) throw new WorkbenchHostError("请检查标题和小节数");
  const { createScoreDocument, CommandBus, CORE_KERNEL_STARTUP_MANIFEST } = require("../.kernel/src/core-kernel/index.js") as typeof import("../.kernel/src/core-kernel/index.js");
  const { compileOfficialModuleCatalogV1 } = require("../.kernel/src/core-kernel/module-sdk/index.js") as typeof import("../.kernel/src/core-kernel/module-sdk/index.js");
  const { installNativeIntegratedBackendV2 } = require("../.kernel/src/core-kernel/native/integrated-command-bus.js") as typeof import("../.kernel/src/core-kernel/native/integrated-command-bus.js");
  const addon = nativeAddon ?? require(fileURLToPath(new URL("../../../target/integrated-v2/brilliant_kernel_node.node", import.meta.url))) as IntegratedNativeAddonV2;
  const catalog = compileOfficialModuleCatalogV1(CORE_KERNEL_STARTUP_MANIFEST, []);
  if (!catalog.ok) throw new WorkbenchHostError("暂时无法初始化乐谱编辑环境", 503);
  const documentId = randomUUID();
  const voice = (index: number): Voice => ({ id: `voice-${index}`, defaultStaffId: "staff-1", sequence: {
    start: { numerator: 0, denominator: 1 }, events: [],
  } });
  const created = createScoreDocument({ factoryVersion: 1, documentId,
    metadata: { title: input.title.trim() || "未命名乐谱", authors: [], tempo: { bpm: 96 } },
    initialMeasure: { id: "measure-1", meter: { numerator: 4, denominator: 4 } },
    initialParts: [{ id: "part-1", name: "高音谱表", instrument: { name: "通用", writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 } },
      staves: [{ id: "staff-1", lineCount: 5, defaultClef: { sign: "G", line: 2 } }], voices: [voice(1)],
    }], extensions: [],
  } satisfies CreateScoreDocumentInputV1);
  if (created.status !== "created") throw new WorkbenchHostError("无法创建该格式的乐谱", 422);
  const open = (document: ScoreDocument) => {
    const restore = installNativeIntegratedBackendV2(addon);
    try {
      const result = CommandBus.createIntegrated(document, catalog.catalog);
      if (!result.ok) throw new WorkbenchHostError("无法建立乐谱编辑会话", 503);
      return result.value;
    } finally { restore(); }
  };
  const seed = open(created.document);
  if (input.measureCount === 1) return seed;
  const commands = Array.from({ length: input.measureCount - 1 }, (_, offset): InsertMeasureCommand => {
      const index = offset + 2;
      return { commandVersion: 1, commandId: "core.measure.insert", target: { kind: "document", documentId }, payload: {
        anchor: { kind: "after-measure", measureId: `measure-${index - 1}` },
        definition: { id: `measure-${index}`, meter: { numerator: 4, denominator: 4 } },
        contents: [{ partId: "part-1", voices: [voice(index)] }],
      } };
    });
  // Private initialization batches stay below Core's 100-child limit. Nothing is
  // published until all batches succeed and a fresh zero-history session opens.
  for (let offset = 0; offset < commands.length; offset += 64) {
    const result = seed.submit({ commandVersion: 1, commandId: "core.transaction.batch", target: { kind: "document", documentId },
      payload: { commands: commands.slice(offset, offset + 64) } });
    if (result.status !== "committed") throw new WorkbenchHostError("无法创建指定数量的小节", 422, result);
  }
  const read = seed.read();
  if (!read.ok) throw new WorkbenchHostError("无法读取刚创建的乐谱", 503);
  // Initialization is the new session's baseline, never a user undo step or a save checkpoint.
  return open(read.value.snapshot.document);
}

function openScoreDocument(document: ScoreDocument, nativeAddon?: IntegratedNativeAddonV2): IntegratedCommandBus {
  const { CommandBus, CORE_KERNEL_STARTUP_MANIFEST } = require("../.kernel/src/core-kernel/index.js") as typeof import("../.kernel/src/core-kernel/index.js");
  const { compileOfficialModuleCatalogV1 } = require("../.kernel/src/core-kernel/module-sdk/index.js") as typeof import("../.kernel/src/core-kernel/module-sdk/index.js");
  const { installNativeIntegratedBackendV2 } = require("../.kernel/src/core-kernel/native/integrated-command-bus.js") as typeof import("../.kernel/src/core-kernel/native/integrated-command-bus.js");
  const addon = nativeAddon ?? require(fileURLToPath(new URL("../../../target/integrated-v2/brilliant_kernel_node.node", import.meta.url))) as IntegratedNativeAddonV2;
  const catalog = compileOfficialModuleCatalogV1(CORE_KERNEL_STARTUP_MANIFEST, []);
  if (!catalog.ok) throw new WorkbenchHostError("暂时无法初始化乐谱编辑环境", 503);
  const restore = installNativeIntegratedBackendV2(addon);
  try {
    const result = CommandBus.createIntegrated(document, catalog.catalog);
    if (!result.ok) throw new WorkbenchHostError("无法建立乐谱编辑会话", 422);
    return result.value;
  } finally { restore(); }
}

interface SessionEntry {
  readonly bus: IntegratedCommandBus;
  readonly requestId: string;
  readonly inputKey: string;
  readonly edits: Map<string, { key: string; version: number }>;
}

export class ScoreSessionService {
  private readonly sessions = new Map<string, SessionEntry>();

  read(workspaceId: string): ScoreSessionRead | null {
    const entry = this.sessions.get(workspaceId);
    if (!entry) return null;
    const read = entry.bus.read();
    if (!read.ok) throw new WorkbenchHostError("无法读取当前乐谱", 503);
    const document = read.value.snapshot.document;
    const documentVersion = read.value.snapshot.documentVersion;
    const warnings = readRuleWarnings(entry.bus, document.id, documentVersion);
    return { documentId: document.id, title: document.metadata.title, measureCount: document.measureDefinitions.length,
      documentVersion, undoDepth: read.value.history.undoDepth, redoDepth: read.value.history.redoDepth,
      notation: projectNotation(document, warnings) };
  }

  exportDocument(workspaceId: string): string {
    const entry = this.sessions.get(workspaceId);
    if (!entry) throw new WorkbenchHostError("当前没有可保存的乐谱", 404);
    const read = entry.bus.read();
    if (!read.ok) throw new WorkbenchHostError("无法读取当前乐谱", 503);
    const encoded = encodeScoreDocumentJson(read.value.snapshot.document);
    if (!encoded.ok) throw new WorkbenchHostError("无法编码当前乐谱", 422);
    return encoded.value;
  }

  importDocument(workspaceId: string, value: unknown): ScoreSessionRead {
    const decoded = decodeScoreDocument(value);
    if (!decoded.ok) throw new WorkbenchHostError("文件不是可识别的项目乐谱", 422);
    const bus = openScoreDocument(decoded.value);
    this.sessions.set(workspaceId, { bus, requestId: crypto.randomUUID(), inputKey: "import", edits: new Map() });
    return this.read(workspaceId)!;
  }

  edit(workspaceId: string, request: ScoreEditRequest): ScoreSessionRead {
    if (!isScoreEditRequest(request)) throw new WorkbenchHostError("输入参数不正确");
    const entry = this.sessions.get(workspaceId), current = this.read(workspaceId);
    if (!entry || !current || current.documentId !== request.documentId) {
      const message = "当前乐谱已改变，请重新定位";
      throw new WorkbenchHostError(message, 409, undefined,
        issue("editor.document-stale", message, { scope: "workbench" }));
    }
    const key = JSON.stringify(request), repeated = entry.edits.get(request.requestId);
    if (repeated) {
      if (key !== repeated.key || current.documentVersion !== repeated.version) throw new WorkbenchHostError("该请求已处理，乐谱状态已变化，请重新定位", 409);
      return current;
    }
    if (current.documentVersion !== request.expectedVersion) {
      const message = "乐谱版本已更新，请重新定位后输入";
      throw new WorkbenchHostError(message, 409, undefined,
        issue("editor.version-conflict", message, actionTarget(current, request.action)));
    }
    if (current.notation.kind !== "staff") throw new WorkbenchHostError("当前乐谱格式尚不支持编辑", 422);
    const action = request.action;
    let result;
    if (action.kind === "undo") result = entry.bus.undo();
    else if (action.kind === "redo") result = entry.bus.redo();
    else if (action.kind === "set-event-properties" || action.kind === "set-title") {
      const read = entry.bus.read();
      if (!read.ok) throw new WorkbenchHostError("暂时无法读取乐谱", 503);
      const document = read.value.snapshot.document;
      if (action.kind === "set-title") {
        result = entry.bus.submit({ commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: document.id },
          payload: { metadata: { ...document.metadata, title: action.title.trim() || "未命名乐谱" } } });
      } else {
        const prepared = prepareEventProperties(document, action.eventId, action.properties);
        if (!prepared.ok) throw new WorkbenchHostError(prepared.message, prepared.status, undefined, prepared.issue);
        result = entry.bus.submit(prepared.command);
      }
    }
    else if (action.kind === "delete-event") {
      const read = entry.bus.read();
      if (!read.ok) throw new WorkbenchHostError("暂时无法读取乐谱", 503);
      const doc = read.value.snapshot.document;
      const voice = doc.parts[0]!.measureContents.flatMap((content) => content.voices)
        .find((item) => item.sequence.events.some((event) => event.id === action.eventId));
      const index = voice?.sequence.events.findIndex((event) => event.id === action.eventId) ?? -1;
      const event = voice?.sequence.events[index];
      if (!voice || !event) {
        const message = "选中内容已不存在，请重新选择";
        throw new WorkbenchHostError(message, 409, undefined,
          issue("editor.selection-stale", message, actionTarget(current, action)));
      }
      const remove: RemoveEventCommand = { commandVersion: 1, commandId: "core.event.remove", target: { kind: "event", eventId: event.id }, payload: {} };
      if (event.content.kind === "rest" || action.timePolicy === "collapse") {
        result = entry.bus.submit(remove);
      } else {
        const previous = voice.sequence.events[index - 1];
        const insert: InsertRestEventCommand = { commandVersion: 1, commandId: "core.voice.insert-rest-event",
          target: { kind: "voice", voiceId: voice.id }, payload: {
            anchor: previous ? { kind: "after-event", eventId: previous.id } : { kind: "start" },
            event: { id: event.id, duration: event.duration, content: { kind: "rest" } },
          } };
        // Preserve rhythmic position with one atomic history entry, through public commands only.
        result = entry.bus.submit({ commandVersion: 1, commandId: "core.transaction.batch",
          target: { kind: "document", documentId: doc.id }, payload: { commands: [remove, insert] } } satisfies BatchCommand);
      }
    }
    else {
      const read = entry.bus.read();
      if (!read.ok) throw new WorkbenchHostError("暂时无法读取乐谱", 503);
      const doc = read.value.snapshot.document, part = doc.parts[0]!;
      const measure = doc.measureDefinitions.find((item) => item.id === action.measureId);
      const voice = part.measureContents.find((item) => item.measureId === action.measureId)?.voices[0];
      const projected = current.notation.measures.find((item) => item.id === action.measureId);
      if (!measure || !voice || !projected) {
        const message = "输入位置不存在，请重新选择小节";
        throw new WorkbenchHostError(message, 422, undefined,
          issue("editor.position-missing", message, { scope: "measure", measureId: action.measureId }));
      }
      const used = projected.events.reduce((sum, event) => sum + durationUnits(event.duration), 0);
      const anchorEventId = action.anchor.kind === "after-event" ? action.anchor.eventId : null;
      const anchorIndex = anchorEventId === null ? -1
        : voice.sequence.events.findIndex((event) => event.id === anchorEventId);
      if (action.anchor.kind === "after-event" && anchorIndex < 0) {
        const message = "输入位置已改变，请重新定位";
        throw new WorkbenchHostError(message, 409, undefined,
          issue("editor.position-stale", message, { scope: "measure", measureId: action.measureId }));
      }
      const anchorOffset = voice.sequence.events.slice(0, anchorIndex + 1)
        .reduce((sum, event) => sum + durationUnits(event.duration), 0);
      const requestedOffset = action.offsetUnits ?? anchorOffset;
      const capacity = 64 * measure.meter.numerator / measure.meter.denominator;
      const gap = requestedOffset - anchorOffset;
      if (requestedOffset < anchorOffset || (gap > 0 && anchorOffset !== used)) {
        const message = "输入位置不再可用，请重新选择节拍位置";
        throw new WorkbenchHostError(message, 409, undefined,
          issue("editor.position-stale", message, { scope: "measure", measureId: action.measureId }));
      }
      const projectedUsed = used + gap + durationUnits(action.duration);
      const commands: (InsertNotesEventCommand | InsertRestEventCommand | InsertMeasureCommand)[] = [];
      let insertionAnchor = action.anchor;
      for (const duration of restDurations(gap)) {
        const restId = randomUUID();
        commands.push({ commandVersion: 1, commandId: "core.voice.insert-rest-event", target: { kind: "voice", voiceId: voice.id },
          payload: { anchor: insertionAnchor, event: { id: restId, duration, content: { kind: "rest" } } } });
        insertionAnchor = { kind: "after-event", eventId: restId };
      }
      const event = { id: randomUUID(), duration: action.duration };
      const insertEvent: InsertNotesEventCommand | InsertRestEventCommand = action.content.kind === "rest"
        ? { commandVersion: 1, commandId: "core.voice.insert-rest-event", target: { kind: "voice", voiceId: voice.id }, payload: { anchor: insertionAnchor, event: { ...event, content: { kind: "rest" } } } }
        : { commandVersion: 1, commandId: "core.voice.insert-notes-event", target: { kind: "voice", voiceId: voice.id }, payload: { anchor: insertionAnchor, event: { ...event, content: { kind: "notes", notes: [{ id: randomUUID(), writtenPitch: action.content.pitch }] } } } };
      commands.push(insertEvent);
      const isLastMeasure = doc.measureDefinitions.at(-1)?.id === measure.id;
      const fillsLastMeasure = isLastMeasure && projectedUsed === capacity;
      if (fillsLastMeasure) {
        const nextMeasureId = randomUUID();
        const insertMeasure: InsertMeasureCommand = { commandVersion: 1, commandId: "core.measure.insert", target: { kind: "document", documentId: doc.id }, payload: {
          anchor: { kind: "after-measure", measureId: measure.id }, definition: { id: nextMeasureId, meter: measure.meter },
          contents: [{ partId: part.id, voices: [{ id: randomUUID(), defaultStaffId: voice.defaultStaffId,
            sequence: { start: { numerator: 0, denominator: 1 }, events: [] } }] }],
        } };
        commands.push(insertMeasure);
      }
      result = commands.length === 1 ? entry.bus.submit(insertEvent)
        : entry.bus.submit({ commandVersion: 1, commandId: "core.transaction.batch", target: { kind: "document", documentId: doc.id },
          payload: { commands: commands as [InsertNotesEventCommand | InsertRestEventCommand, ...(InsertNotesEventCommand | InsertRestEventCommand | InsertMeasureCommand)[]] } } satisfies BatchCommand);
    }
    if (result.status === "rejected") {
      const message = "内核拒绝了这次修改，乐谱保持原状";
      throw new WorkbenchHostError(message, 422, result,
        issue(failureCode(result.failure), message, actionTarget(current, action), "core"));
    }
    entry.edits.set(request.requestId, { key, version: result.documentVersion });
    if (entry.edits.size > 64) entry.edits.delete(entry.edits.keys().next().value!);
    return this.read(workspaceId)!;
  }

  create(workspaceId: string, requestId: string, expectedDocumentId: string | null, input: NewScoreInput): ScoreSessionRead {
    const current = this.sessions.get(workspaceId);
    const inputKey = JSON.stringify(input);
    if (current?.requestId === requestId) {
      if (current.inputKey !== inputKey) throw new WorkbenchHostError("创建参数已改变，请重新打开新建窗口", 409);
      return this.read(workspaceId)!;
    }
    if (this.read(workspaceId)?.documentId !== (expectedDocumentId ?? undefined)) throw new WorkbenchHostError("当前作品已改变，请重新打开新建窗口后重试", 409);
    if (!current && this.sessions.size >= 32) throw new WorkbenchHostError("工作区数量已达本轮上限，暂时无法创建新工作区", 503);
    const bus = createScoreSession(input);
    // Adopt only after full creation succeeds; any failure leaves the previous session untouched.
    this.sessions.set(workspaceId, { bus, requestId, inputKey, edits: new Map() });
    return this.read(workspaceId)!;
  }
}
