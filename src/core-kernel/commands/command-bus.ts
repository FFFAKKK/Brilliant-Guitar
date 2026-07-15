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
import {
  createReadSessionState,
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
    this.#commandState = transition.state;
    return transition.result;
  }

  undo(): CommandResult {
    const transition = undoCommand(this.#commandState);
    this.#commandState = transition.state;
    return transition.result;
  }

  redo(): CommandResult {
    const transition = redoCommand(this.#commandState);
    this.#commandState = transition.state;
    return transition.result;
  }

  read(): ReadResult<KernelReadState> {
    const transition = readKernelState(this.#commandState, this.#readState);
    this.#readState = transition.state;
    return transition.result;
  }
}
