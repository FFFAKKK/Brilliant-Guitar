import { useEffect, useState } from "react";
import type { ScoreSessionRead } from "../contracts/score-session";

/** Selection owns UI identity only; never a mutable copy of an event. */
export function useScoreSelection(session: ScoreSessionRead | null, loadEpoch = 0) {
  const [id, setId] = useState<string | null>(null);
  const measures = session?.notation.kind === "staff" ? session.notation.measures : [];
  const measure = measures.find((item) => item.events.some((event) => event.id === id));
  const event = measure?.events.find((item) => item.id === id);
  const canDelete = !!event && (event.content.kind === "note" || measure?.events.at(-1)?.id === id);
  useEffect(() => { setId(null); }, [session?.documentId, loadEpoch]);
  // Keep the stable identity through an asynchronous document replacement. A
  // temporary projection gap must not turn an event edit back into input mode.
  function move(direction: -1 | 1) {
    const events = measures.flatMap((item) => item.events);
    const index = events.findIndex((item) => item.id === id);
    const next = events[index + direction];
    if (next) setId(next.id);
  }
  return { id: event ? id : null, event, measure, measureIndex: measures.findIndex((item) => item.id === measure?.id),
    canDelete, select: setId, clear: () => setId(null), move };
}
