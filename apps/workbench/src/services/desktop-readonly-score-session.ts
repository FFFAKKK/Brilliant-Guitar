import { WorkbenchClient } from "./workbench-client.ts";
import { TauriWorkbenchHostBridge } from "./workbench-host-bridge.ts";
import { createReadonlyScoreDocumentSession } from "./readonly-score-document-session.ts";
import type { ReadonlyDocumentInitialization } from "./readonly-score-document-session.ts";

/** Trusted composition root: existing identity, IPC and host validation are reused. */
export function createDesktopReadonlyScoreSession({ initialization = "ensure-document" }: {
  initialization?: ReadonlyDocumentInitialization;
} = {}) {
  return createReadonlyScoreDocumentSession({ client: new WorkbenchClient(new TauriWorkbenchHostBridge()), initialization });
}
