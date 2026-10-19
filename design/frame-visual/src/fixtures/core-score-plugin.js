import { defineUiPlugin } from "../runtime/ui-plugin-contract.js";
import { definePlugin } from "../vendor/plugin-platform.js";
import { staffInteractionContribution, tablatureInteractionContribution, bindNotationInteraction } from "../vendor/score-interaction.js";
import { createDocumentCommands } from "../features/document-commands.js";
import { createCoreScoreView } from "../score/core-score-view.js";
import { createStaffProjectionPort } from "../score/staff-read-port.js";
import { createScoreSelection } from "../score/score-selection.js";
import { SCORE_SELECTION_COMMANDS as C } from "../contracts/score-selection.js";
import { createScoreNoteInput } from "../score/score-note-input.js";
import { SCORE_INPUT_KEY_COMMAND, SCORE_INPUT_CHANGE_COMMAND, SCORE_INPUT_TOOL_COMMAND, SCORE_INPUT_POINTER_COMMAND } from "../contracts/score-note-input.js";
import { SCORE_CLIPBOARD_COMMANDS as K } from "../contracts/score-clipboard.js";
import { ScoreClipboard } from "../vendor/score-interaction.js";
import { SCORE_MEASURE_COMMANDS as M } from "../contracts/score-measure.js";
import { SCORE_KEY_SIGNATURE_COMMAND } from "../contracts/score-key-signature.js";
import { SCORE_STAFF_CLEF_COMMAND } from "../contracts/score-staff-clef.js";
import { SCORE_DOCUMENT_METADATA_COMMAND } from "../contracts/score-document-metadata.js";

export function createCoreScorePlugin({ score = null, snapshot = undefined, documentActions = null, clipboardPort = undefined } = {}) {
let selection = null, input = null;
const keySignatures = typeof documentActions?.append === "function" && typeof documentActions?.setKeySignature === "function";
const staffClefs = typeof documentActions?.append === "function" && typeof documentActions?.setStaffClef === "function";
const metadata = typeof documentActions?.append === "function" && typeof documentActions?.setDocumentMetadata === "function";
const documents = createDocumentCommands(documentActions);
const selectionCommands = Object.entries(C).map(([method, id]) => ({ id,
  run: payload => selection ? selection[method](payload) : { ok: false, code: "score.selection.not-ready" },
}));
const clipboardCommands = documentActions?.append ? Object.entries(K).map(([method, id], index) => ({ id,
  label: ["复制", "剪切", "粘贴"][index], enabled: () => !!input?.canClipboard(method),
  run: payload => input ? input.clipboard(method, payload) : { ok: false, code: "score.input.not-ready" },
})) : [];
const uiDeclaration = defineUiPlugin({
  namespace: "notation.core",
  ...documents,
  menuItems: [...(documents.menuItems ?? []), ...clipboardCommands.map((command, index) => ({ menu: "edit",
    order: index + 2, command: command.id, label: command.label })), ...(documentActions?.editMeasure
      ? [[M.insertBefore, "在当前小节前插入"], [M.insertAfter, "在当前小节后插入"], [M.remove, "删除当前小节"]]
        .map(([command, label], index) => ({ menu: "edit", order: index + 8, command, label })) : [])],
  commands: [...(documents.commands ?? []), ...selectionCommands, ...clipboardCommands, { id: SCORE_INPUT_KEY_COMMAND,
    run: payload => input ? input.key(payload) : { ok: false, code: "score.input.not-ready" } },
    { id: SCORE_INPUT_CHANGE_COMMAND, run: payload => input ? input.change(payload) : { ok: false, code: "score.input.not-ready" } },
    ...(documentActions?.append ? [[SCORE_INPUT_TOOL_COMMAND, "tool"], [SCORE_INPUT_POINTER_COMMAND, "pointer"]]
      .map(([id, method]) => ({ id, run: payload => input ? input[method](payload) : { ok: false, code: "score.input.not-ready" } })) : []),
    ...(keySignatures ? [{ id: SCORE_KEY_SIGNATURE_COMMAND,
      run: payload => input ? input.keySignature(payload) : { ok: false, code: "score.input.not-ready" } }] : []),
    ...(staffClefs ? [{ id: SCORE_STAFF_CLEF_COMMAND,
      run: payload => input ? input.staffClef(payload) : { ok: false, code: "score.input.not-ready" } }] : []),
    ...(metadata ? [{ id: SCORE_DOCUMENT_METADATA_COMMAND,
      run: payload => input ? input.metadata(payload) : { ok: false, code: "score.input.not-ready" } }] : []),
    ...(documentActions?.editMeasure ? [{ id: M.edit, run: payload => input ? input.measure(payload) : { ok: false, code: "score.input.not-ready" } },
      ...[[M.insertBefore, { kind: "insert", position: "before" }], [M.insertAfter, { kind: "insert", position: "after" }], [M.remove, { kind: "remove" }]]
        .map(([id, change]) => ({ id, enabled: () => { const value = input?.read.snapshot().measure;
          return !!value && !value.disabled && (id !== M.remove || value.canRemove); },
          run: payload => { if (payload !== undefined && (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length)) return { ok: false, code: "score.input.invalid-payload" };
            const value = input?.read.snapshot().measure;
            return value ? input.measure({ measureId: value.measureId, sourceRevision: value.sourceRevision,
              selectionRevision: value.selectionRevision, change }) : { ok: false, code: "score.input.not-ready" }; } }))] : [])],
  ui: [{
    id: "notation.core.view",
    kind: "view",
    title: "谱面",
    slots: ["stage"],
    order: -100,
    permissions: { commands: [...Object.values(C), ...clipboardCommands.map(command => command.id), SCORE_INPUT_KEY_COMMAND, SCORE_INPUT_CHANGE_COMMAND,
      ...(documentActions?.append ? [SCORE_INPUT_TOOL_COMMAND, SCORE_INPUT_POINTER_COMMAND] : []),
      ...(documentActions?.editMeasure ? Object.values(M) : []), ...(keySignatures ? [SCORE_KEY_SIGNATURE_COMMAND] : []),
      ...(staffClefs ? [SCORE_STAFF_CLEF_COMMAND] : []), ...(metadata ? [SCORE_DOCUMENT_METADATA_COMMAND] : [])] },
    mount(element, ctx) {
      if (selection) throw new Error("核心谱面声明已有活跃实例；每个工作区需要独立工厂声明");
      if (!ctx.notationInteractions) throw new Error("核心谱面需要正式登记的记谱策略目录");
      const interaction = bindNotationInteraction(ctx.notationInteractions, "staff");
      const projection = score ? null : createStaffProjectionPort({ snapshot: snapshot ?? null });
      const source = score ?? projection.read;
      const owner = createScoreSelection({ score: source, interaction }); selection = owner;
      ctx.onDispose(() => { if (selection === owner) selection = null; try { owner.dispose(); } finally { projection?.dispose(); } });
      if (typeof documentActions?.append === "function") {
        const controller = createScoreNoteInput({ score: source, selection: owner, actions: documentActions, interaction,
          clipboard: new ScoreClipboard(clipboardPort) }); input = controller;
        ctx.onDispose(() => { if (input === controller) input = null; controller.dispose(); });
      }
      const view = createCoreScoreView({ score: source, selection: owner.read, execute: ctx.execute, input: input?.read,
        properties: typeof documentActions?.append === "function", measures: typeof documentActions?.editMeasure === "function", keySignatures, staffClefs, metadata });
      ctx.onDispose(() => view.dispose());
      const mounted = view.mount(element);
      const controller = input;
      return { ...mounted, setVisible(value) { controller?.setVisible(value); mounted.setVisible(value); } };
    },
  }],
});
return definePlugin({
  id: "notation.core", name: "核心谱面", version: "0.1.0", apiVersion: "4.0", tier: "product", activation: "always",
  interactions: [staffInteractionContribution, tablatureInteractionContribution],
  ui: { contractVersion: 1, components: uiDeclaration.components, commands: uiDeclaration.commands ?? [],
    menuItems: (uiDeclaration.menuItems ?? []).map((item, index) => ({ id: `notation.core.menu-${index}`, ...item })),
    shortcuts: uiDeclaration.shortcuts ?? [] },
});

}
