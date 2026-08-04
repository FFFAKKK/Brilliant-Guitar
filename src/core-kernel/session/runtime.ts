import type {
  CommandFailure,
  CommandResult,
} from "../commands/contracts";
import {
  redoCommand,
  submitCommand,
  undoCommand,
  type CommandRuntimeState,
  type CommandTransition,
} from "../commands/runtime";
import {
  buildCheckpointEvents,
  buildCommittedEvents,
  type EventCandidateResult,
} from "../events/runtime";
import type { KernelEvent } from "../events/contracts";
import type {
  KernelReadState,
  MarkPersistedResult,
  ReadResult,
} from "../read/contracts";
import {
  contentStateIdentity,
  createReadSessionState,
  markPersistedCheckpoint,
  recordCommittedVersion,
  type ReadSessionState,
} from "../read/session-state";
import { readKernelState } from "../read/snapshot";

export interface KernelSessionState {
  readonly commandState: CommandRuntimeState;
  readonly readState: ReadSessionState;
  readonly lastEventSequence: number;
}

export interface KernelCommandSessionTransition {
  readonly state: KernelSessionState;
  readonly result: CommandResult;
  readonly events: readonly KernelEvent[];
}

export interface KernelCheckpointSessionTransition {
  readonly state: KernelSessionState;
  readonly result: MarkPersistedResult;
  readonly events: readonly KernelEvent[];
}

export interface KernelSessionReadTransition {
  readonly state: KernelSessionState;
  readonly result: ReadResult<KernelReadState>;
}

const EMPTY_EVENTS = Object.freeze([]) as readonly KernelEvent[];

export function createKernelSessionState(
  commandState: CommandRuntimeState,
): KernelSessionState {
  return {
    commandState,
    readState: createReadSessionState(),
    lastEventSequence: 0,
  };
}

function isDirty(
  commandState: CommandRuntimeState,
  readState: ReadSessionState,
): boolean {
  return contentStateIdentity(commandState) !== readState.cleanStateIdentity;
}

function rejectedCommand(
  state: KernelSessionState,
  failure: CommandFailure,
): KernelCommandSessionTransition {
  return {
    state,
    result: {
      status: "rejected",
      documentVersion: state.commandState.documentVersion,
      undoDepth: state.commandState.undoStack.length,
      redoDepth: state.commandState.redoStack.length,
      failure,
    },
    events: EMPTY_EVENTS,
  };
}

function eventFailureForCommand(
  state: KernelSessionState,
  eventCandidate: Extract<EventCandidateResult, { readonly ok: false }>,
  integrationFailure: "command.internal-error" | "history.invariant-violation",
): KernelCommandSessionTransition {
  return rejectedCommand(state, {
    code:
      eventCandidate.reason === "overflow"
        ? "event.sequence-overflow"
        : integrationFailure,
  });
}

function integrateCommand(
  state: KernelSessionState,
  transition: CommandTransition,
  integrationFailure: "command.internal-error" | "history.invariant-violation",
): KernelCommandSessionTransition {
  if (transition.result.status !== "committed") {
    return { state, result: transition.result, events: EMPTY_EVENTS };
  }
  if (transition.committed === undefined) {
    return rejectedCommand(state, { code: integrationFailure });
  }
  const readCandidate = recordCommittedVersion(
    transition.state,
    state.readState,
  );
  if (!readCandidate.ok) {
    return rejectedCommand(state, { code: integrationFailure });
  }
  const eventCandidate = buildCommittedEvents({
    lastEventSequence: state.lastEventSequence,
    operation: transition.committed,
    documentId: transition.state.document.id,
    documentVersion: transition.state.documentVersion,
    dirtyBefore: isDirty(state.commandState, state.readState),
    dirtyAfter: isDirty(transition.state, readCandidate.state),
  });
  if (!eventCandidate.ok) {
    return eventFailureForCommand(
      state,
      eventCandidate,
      integrationFailure,
    );
  }
  return {
    state: {
      commandState: transition.state,
      readState: readCandidate.state,
      lastEventSequence: eventCandidate.lastEventSequence,
    },
    result: transition.result,
    events: eventCandidate.events,
  };
}

export function submitKernelSession(
  state: KernelSessionState,
  input: unknown,
): KernelCommandSessionTransition {
  try {
    return integrateCommand(
      state,
      submitCommand(state.commandState, input),
      "command.internal-error",
    );
  } catch {
    return rejectedCommand(state, { code: "command.internal-error" });
  }
}

export function undoKernelSession(
  state: KernelSessionState,
): KernelCommandSessionTransition {
  try {
    return integrateCommand(
      state,
      undoCommand(state.commandState),
      "history.invariant-violation",
    );
  } catch {
    return rejectedCommand(state, { code: "history.invariant-violation" });
  }
}

export function redoKernelSession(
  state: KernelSessionState,
): KernelCommandSessionTransition {
  try {
    return integrateCommand(
      state,
      redoCommand(state.commandState),
      "history.invariant-violation",
    );
  } catch {
    return rejectedCommand(state, { code: "history.invariant-violation" });
  }
}

function rejectedCheckpoint(
  state: KernelSessionState,
  code: "checkpoint.invariant-violation" | "event.sequence-overflow",
): KernelCheckpointSessionTransition {
  return {
    state,
    result: {
      status: "rejected",
      documentVersion: state.commandState.documentVersion,
      dirty: isDirty(state.commandState, state.readState),
      failure: { code },
    },
    events: EMPTY_EVENTS,
  };
}

export function markKernelSessionPersisted(
  state: KernelSessionState,
  input: unknown,
): KernelCheckpointSessionTransition {
  try {
    const transition = markPersistedCheckpoint(
      state.commandState,
      state.readState,
      input,
    );
    if (transition.result.status !== "updated") {
      return { state, result: transition.result, events: EMPTY_EVENTS };
    }
    const eventCandidate = buildCheckpointEvents({
      lastEventSequence: state.lastEventSequence,
      documentId: state.commandState.document.id,
      documentVersion: state.commandState.documentVersion,
      dirtyBefore: isDirty(state.commandState, state.readState),
      dirtyAfter: isDirty(state.commandState, transition.state),
    });
    if (!eventCandidate.ok) {
      return rejectedCheckpoint(
        state,
        eventCandidate.reason === "overflow"
          ? "event.sequence-overflow"
          : "checkpoint.invariant-violation",
      );
    }
    return {
      state: {
        commandState: state.commandState,
        readState: transition.state,
        lastEventSequence: eventCandidate.lastEventSequence,
      },
      result: transition.result,
      events: eventCandidate.events,
    };
  } catch {
    try {
      return rejectedCheckpoint(state, "checkpoint.invariant-violation");
    } catch {
      return {
        state,
        result: {
          status: "rejected",
          documentVersion: 0,
          dirty: true,
          failure: { code: "checkpoint.invariant-violation" },
        },
        events: EMPTY_EVENTS,
      };
    }
  }
}

export function readKernelSession(
  state: KernelSessionState,
): KernelSessionReadTransition {
  const transition = readKernelState(state.commandState, state.readState);
  return {
    state:
      transition.state === state.readState
        ? state
        : { ...state, readState: transition.state },
    result: transition.result,
  };
}
