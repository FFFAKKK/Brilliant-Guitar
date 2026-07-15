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

export type CommandBusCreationResult =
  | { readonly ok: true; readonly value: CommandBus }
  | { readonly ok: false; readonly failure: CommandBusCreationFailure };

const COMMAND_BUS_CONSTRUCTION_TOKEN = Symbol("CommandBusConstructionToken");

export class CommandBus {
  #state: CommandRuntimeState;

  private constructor(
    token: typeof COMMAND_BUS_CONSTRUCTION_TOKEN,
    state: CommandRuntimeState,
  ) {
    if (token !== COMMAND_BUS_CONSTRUCTION_TOKEN) {
      throw new TypeError("CommandBus must be created with CommandBus.create");
    }
    this.#state = state;
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
    const transition = submitCommand(this.#state, input);
    this.#state = transition.state;
    return transition.result;
  }

  undo(): CommandResult {
    const transition = undoCommand(this.#state);
    this.#state = transition.state;
    return transition.result;
  }

  redo(): CommandResult {
    const transition = redoCommand(this.#state);
    this.#state = transition.state;
    return transition.result;
  }
}
