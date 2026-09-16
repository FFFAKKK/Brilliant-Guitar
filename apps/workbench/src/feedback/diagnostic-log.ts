import type { WorkbenchIssue } from "../contracts/workbench-issue.ts";

export interface WorkbenchDiagnosticEntry {
  readonly sequence: number;
  readonly occurredAt: number;
  readonly issue: WorkbenchIssue;
}

/** Small in-memory ring buffer. It never persists score data or user files. */
export class WorkbenchDiagnosticLog {
  readonly #limit: number;
  #entries: WorkbenchDiagnosticEntry[] = [];

  constructor(limit = 100) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Diagnostic limit must be a positive integer");
    this.#limit = limit;
  }

  append(entry: WorkbenchDiagnosticEntry): void {
    this.#entries = [...this.#entries, entry].slice(-this.#limit);
  }

  list(): readonly WorkbenchDiagnosticEntry[] {
    return [...this.#entries];
  }

  clear(): void {
    this.#entries = [];
  }
}
