import type { ScoreDocument } from "../domain/score-document";
import type {
  EventSubscriptionResult,
  KernelEvent,
  KernelEventHandler,
} from "../events/contracts";
import type {
  CommandBusCreationFailure,
  CommandResult,
} from "./contracts";
import {
  createCommandRuntime,
  type CommandRuntimeState,
} from "./runtime";
import type { KernelReadState, ReadResult } from "../read/contracts";
import type { MarkPersistedResult } from "../read/contracts";
import {
  contentStateIdentity,
} from "../read/session-state";
import {
  createKernelSessionState,
  markKernelSessionPersisted,
  readKernelSession,
  redoKernelSession,
  submitKernelSession,
  undoKernelSession,
  type KernelCommandSessionTransition,
  type KernelSessionState,
} from "../session/runtime";

export type CommandBusCreationResult =
  | { readonly ok: true; readonly value: CommandBus }
  | { readonly ok: false; readonly failure: CommandBusCreationFailure };

const COMMAND_BUS_CONSTRUCTION_TOKEN = Symbol("CommandBusConstructionToken");

interface SubscriberRecord {
  readonly handler: KernelEventHandler;
}

export class CommandBus {
  #sessionState: KernelSessionState;
  #subscribers: SubscriberRecord[] = [];
  #dispatching = false;

  private constructor(
    token: typeof COMMAND_BUS_CONSTRUCTION_TOKEN,
    state: CommandRuntimeState,
  ) {
    if (token !== COMMAND_BUS_CONSTRUCTION_TOKEN) {
      throw new TypeError("CommandBus must be created with CommandBus.create");
    }
    this.#sessionState = createKernelSessionState(state);
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
    if (this.#dispatching) {
      return this.#reentrantCommandResult();
    }
    return this.#adoptAndDispatch(
      submitKernelSession(this.#sessionState, input),
    );
  }

  undo(): CommandResult {
    if (this.#dispatching) {
      return this.#reentrantCommandResult();
    }
    return this.#adoptAndDispatch(undoKernelSession(this.#sessionState));
  }

  redo(): CommandResult {
    if (this.#dispatching) {
      return this.#reentrantCommandResult();
    }
    return this.#adoptAndDispatch(redoKernelSession(this.#sessionState));
  }

  markPersisted(input: unknown): MarkPersistedResult {
    if (this.#dispatching) {
      return {
        status: "rejected",
        documentVersion: this.#sessionState.commandState.documentVersion,
        dirty:
          contentStateIdentity(this.#sessionState.commandState) !==
          this.#sessionState.readState.cleanStateIdentity,
        failure: { code: "event.reentrant-write" },
      };
    }
    const transition = markKernelSessionPersisted(this.#sessionState, input);
    this.#sessionState = transition.state;
    this.#dispatch(transition.events);
    return transition.result;
  }

  read(): ReadResult<KernelReadState> {
    const transition = readKernelSession(this.#sessionState);
    this.#sessionState = transition.state;
    return transition.result;
  }

  subscribe(handler: unknown): EventSubscriptionResult {
    if (typeof handler !== "function") {
      return {
        status: "rejected",
        failure: { code: "event.invalid-handler" },
      };
    }
    const record: SubscriberRecord = {
      handler: handler as KernelEventHandler,
    };
    this.#subscribers.push(record);
    let active = true;
    return {
      status: "subscribed",
      unsubscribe: () => {
        if (!active) {
          return;
        }
        active = false;
        const index = this.#subscribers.indexOf(record);
        if (index >= 0) {
          this.#subscribers.splice(index, 1);
        }
      },
    };
  }

  #reentrantCommandResult(): CommandResult {
    return {
      status: "rejected",
      documentVersion: this.#sessionState.commandState.documentVersion,
      undoDepth: this.#sessionState.commandState.undoStack.length,
      redoDepth: this.#sessionState.commandState.redoStack.length,
      failure: { code: "event.reentrant-write" },
    };
  }

  #adoptAndDispatch(
    transition: KernelCommandSessionTransition,
  ): CommandResult {
    this.#sessionState = transition.state;
    this.#dispatch(transition.events);
    return transition.result;
  }

  #dispatch(events: readonly KernelEvent[]): void {
    if (events.length === 0) {
      return;
    }
    this.#dispatching = true;
    try {
      for (const event of events) {
        const handlers = this.#subscribers.map(({ handler }) => handler);
        for (const handler of handlers) {
          try {
            handler(event);
          } catch {
            // Subscriber exceptions are isolated from committed session state.
          }
        }
      }
    } finally {
      this.#dispatching = false;
    }
  }
}
