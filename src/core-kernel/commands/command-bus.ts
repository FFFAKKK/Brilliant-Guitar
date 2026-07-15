import type { ScoreDocument } from "../domain/score-document";
import type {
  CommandBusCreationFailure,
  CommandResult,
} from "./contracts";
import {
  createCommandRuntime,
  redoCommand,
  submitCommand,
  undoCommand,
  type CommandRuntimeState,
} from "./runtime";
import type { KernelReadState, ReadResult } from "../read/contracts";
import type { MarkPersistedResult } from "../read/contracts";
import {
  createReadSessionState,
  markPersistedCheckpoint,
  recordCommittedVersion,
  type ReadSessionState,
} from "../read/session-state";
import { readKernelState } from "../read/snapshot";

export type CommandBusCreationResult =
  | { readonly ok: true; readonly value: CommandBus }
  | { readonly ok: false; readonly failure: CommandBusCreationFailure };

const COMMAND_BUS_CONSTRUCTION_TOKEN = Symbol("CommandBusConstructionToken");

export class CommandBus {
  #commandState: CommandRuntimeState;
  #readState: ReadSessionState;

  private constructor(
    token: typeof COMMAND_BUS_CONSTRUCTION_TOKEN,
    state: CommandRuntimeState,
  ) {
    if (token !== COMMAND_BUS_CONSTRUCTION_TOKEN) {
      throw new TypeError("CommandBus must be created with CommandBus.create");
    }
    this.#commandState = state;
    this.#readState = createReadSessionState();
  }

  static create(initialDocument: ScoreDocument): CommandBusCreationResult {
    const created = createCommandRuntime(initialDocument);
    return created.ok
      ? {
          ok: true,
          value: new CommandBus(COMMAND_BUS_CONSTRUCTION_TOKEN, created.state),
        }
      : { ok: false, failure: created.failure };
  }

  submit(input: unknown): CommandResult {
    const transition = submitCommand(this.#commandState, input);
    return this.#adoptCommandTransition(
      transition,
      "command.internal-error",
    );
  }

  undo(): CommandResult {
    const transition = undoCommand(this.#commandState);
    return this.#adoptCommandTransition(
      transition,
      "history.invariant-violation",
    );
  }

  redo(): CommandResult {
    const transition = redoCommand(this.#commandState);
    return this.#adoptCommandTransition(
      transition,
      "history.invariant-violation",
    );
  }

  markPersisted(input: unknown): MarkPersistedResult {
    const transition = markPersistedCheckpoint(
      this.#commandState,
      this.#readState,
      input,
    );
    this.#readState = transition.state;
    return transition.result;
  }

  read(): ReadResult<KernelReadState> {
    const transition = readKernelState(this.#commandState, this.#readState);
    this.#readState = transition.state;
    return transition.result;
  }

  #adoptCommandTransition(
    transition: ReturnType<
      typeof submitCommand | typeof undoCommand | typeof redoCommand
    >,
    integrationFailure: "command.internal-error" | "history.invariant-violation",
  ): CommandResult {
    if (transition.result.status !== "committed") {
      this.#commandState = transition.state;
      return transition.result;
    }
    const recorded = recordCommittedVersion(transition.state, this.#readState);
    if (!recorded.ok) {
      return {
        status: "rejected",
        documentVersion: this.#commandState.documentVersion,
        undoDepth: this.#commandState.undoStack.length,
        redoDepth: this.#commandState.redoStack.length,
        failure: { code: integrationFailure },
      };
    }
    this.#commandState = transition.state;
    this.#readState = recorded.state;
    return transition.result;
  }
}
