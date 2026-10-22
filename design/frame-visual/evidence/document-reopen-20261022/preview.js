// Independent browser regression sample. Only dialog/IO results are mocked;
// owner, composition, router, paired validation and drawing use production code.
import { createReadonlyScoreDocumentSession } from "../../src/vendor/desktop-plugin-settings.js";
import { createBackupUiRuntime } from "../../src/host/backup-ui-runtime.js";
import { STAFF_FIXTURE } from "../../src/fixtures/staff-snapshot.js";
import { TABLATURE_FIXTURE } from "../../src/fixtures/tablature-snapshot.js";

const legacy = new URLSearchParams(location.search).get("legacy") === "1";
const proof = document.getElementById("reopen-proof");
let current = null, opens = 0, writes = 0;
const calls = [];
function sample(version, label, tempoBpm) {
  const notation = { ...structuredClone(STAFF_FIXTURE), title: `重开样本 ${label}`, tempoBpm };
  const tablature = { ...structuredClone(TABLATURE_FIXTURE), tempoBpm };
  if (label === "B") {
    notation.measures[0].events[0].content.pitch.step = "D";
    tablature.measures[0].events[0].content.position.fret = 5;
  }
  return { documentId: "browser-same-document", documentVersion: version,
    title: `同作品重开样本 ${label}`, measureCount: notation.measures.length, undoDepth: 0, redoDepth: 0,
    notation, tablature,
    ...(!legacy ? { persistence: { sessionId: `sample-${label}`, savedVersion: version, dirty: false } } : {}),
    playbackSource: { kind: "unsupported", projectionVersion: 1, documentId: "browser-same-document",
      documentVersion: version, code: "playback.browser-fixture", message: "独立浏览器回归样本" } };
}
const owner = createReadonlyScoreDocumentSession({ initialization: "read-existing", client: {
  usesNativeFiles: () => true,
  async read() { calls.push("read"); return current; },
  async openNativeDocumentGuarded(expected) {
    const accepted = current ? { kind: "document", documentId: current.documentId, documentVersion: current.documentVersion } : { kind: "empty" };
    if (JSON.stringify(expected) !== JSON.stringify(accepted)) throw new Error("样本IO预条件不匹配");
    calls.push("open");
    current = opens++ === 0 ? sample(7, "A", 96) : sample(0, "B", 132);
    return { session: current, name: "independent-browser-sample", savedVersion: current.documentVersion };
  },
  async edit() { writes++; throw new Error("只读Tab不应派发写入"); },
} });
const runtime = createBackupUiRuntime({ root: document.getElementById("app"), documentSession: owner, documentActions: owner });
function update() {
  const state = owner.snapshot(), projected = runtime.document.snapshot();
  const staff = runtime.score.snapshot(), tab = runtime.score.notation("tablature");
  const receipt = { host: legacy ? "legacy-no-persistence" : "with-persistence",
    ownerVersion: state.documentVersion, projectionVersion: projected.documentVersion,
    ownerTempo: state.tempoBpm, staffTempo: staff?.tempoBpm ?? null, tabTempo: tab?.tempoBpm ?? null,
    firstPitch: staff?.measures[0].events[0].content.pitch?.step ?? null,
    firstFret: tab?.measures?.[0].events[0].content.position?.fret ?? null,
    status: projected.status, opens, writes, calls: [...calls] };
  proof.dataset.receipt = JSON.stringify(receipt);
  proof.textContent = `模拟IO · ${legacy ? "旧宿主无persistence" : "有persistence"} · 首次打开A，再次打开B（同ID 7→0）\n文档 v${state.documentVersion ?? "—"} / 谱面 v${projected.documentVersion ?? "—"} · staff ${staff?.tempoBpm ?? "—"} / Tab ${tab?.tempoBpm ?? "—"} BPM · 写入 ${writes}`;
}
runtime.document.subscribe(update);
owner.subscribeState(update);
update();
window.addEventListener("pagehide", () => { runtime.dispose(); owner.dispose(); }, { once: true });
