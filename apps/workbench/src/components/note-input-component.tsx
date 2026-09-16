import type { useNoteOverview } from "../editor/use-note-overview";
import { NoteInputPanel } from "./note-input-panel";
import { useHostedUiComponent } from "./ui-component-host";

interface Props { readonly controller: ReturnType<typeof useNoteOverview> }

/** The dock owns placement; the note feature supplies only its recognizable mark. */
export function NoteControlDockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M16 4v12.5" /><path d="M16 4h3" />
    <ellipse cx="11.5" cy="17.7" rx="4.5" ry="2.6" transform="rotate(-20 11.5 17.7)" fill="currentColor" stroke="none" />
  </svg>;
}

/** This feature owns its interface and conditional feedback, without a persistent help row. */
export function NoteInputComponent({ controller }: Props) {
  const { slot } = useHostedUiComponent();
  return <div className="note-input-dock" data-slot={slot}>
    <NoteInputPanel {...controller.value} position={controller.position} disabled={controller.disabled} pending={controller.pending > 0} feedback={controller.message ?? ""}
      onDurationChange={(value) => controller.change({ kind: "duration", value })}
      onAccidentalChange={(value, completionFocus) => controller.change({ kind: "accidental", value }, completionFocus)}
      onPitchChange={(value, completionFocus) => controller.change({ kind: "pitch", value }, completionFocus)}
      onRestChange={(value) => controller.change({ kind: "rest", value })} />
    {controller.message && <span className="note-entry-live" role="alert">{controller.message}</span>}
  </div>;
}
