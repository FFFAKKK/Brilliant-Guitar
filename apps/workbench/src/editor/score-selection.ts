import type { ScoreSessionRead } from "../contracts/score-session";

/** Resolve a selected ID against the current immutable score projection. */
export function resolveScoreSelection(session: ScoreSessionRead | null, id: string | null) {
  const measures = session?.notation.kind === "staff" ? session.notation.measures : [];
  const measure = measures.find((item) => item.events.some((event) => event.id === id));
  const event = measure?.events.find((item) => item.id === id);
  const canDelete = !!event;
  return { id: event ? id : null, event, measure, measureIndex: measures.findIndex((item) => item.id === measure?.id),
    canDelete };
}
