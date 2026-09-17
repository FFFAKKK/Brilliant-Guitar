import { useCallback, useRef, useState } from "react";
import { initialEditorState, transitionEditor } from "./editor-machine.ts";
import type { EditorEvent, EditorState } from "./editor-machine.ts";

export function useEditorMachine<Point, Draft>() {
  const [state, setState] = useState<EditorState<Point, Draft>>(() => initialEditorState<Point, Draft>(null));
  const current = useRef(state);
  const send = useCallback((event: EditorEvent<Point, Draft>) => {
    const next = transitionEditor(current.current, event);
    current.current = next;
    setState(next);
    return next;
  }, []);
  return { state, current, send };
}
