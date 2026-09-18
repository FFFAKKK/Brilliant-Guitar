import { NoteInputPanel } from "./note-input-panel";
import { useHostedUiComponent } from "./ui-component-host";
import type { NoteControlProjection } from "../ui/first-party-plugin-projections.ts";

/** The dock owns placement; the note feature supplies only its recognizable mark. */
export function NoteControlDockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M16 4v12.5" /><path d="M16 4h3" />
    <ellipse cx="11.5" cy="17.7" rx="4.5" ry="2.6" transform="rotate(-20 11.5 17.7)" fill="currentColor" stroke="none" />
  </svg>;
}

/** This feature owns its interface and conditional feedback, without a persistent help row. */
export function NoteInputComponent({ projection }: { readonly projection: NoteControlProjection }) {
  const { slot } = useHostedUiComponent();
  const { viewModel, actions } = projection;
  return <div className="note-input-dock" data-slot={slot}>
    <NoteInputPanel {...viewModel.value} position={viewModel.position} disabled={viewModel.disabled} pending={viewModel.pending} feedback={viewModel.message}
      onDurationChange={(value) => actions.change({ kind: "duration", value })}
      onAccidentalChange={(value, completionFocus) => actions.change({ kind: "accidental", value }, completionFocus)}
      onPitchChange={(value, completionFocus) => actions.change({ kind: "pitch", value }, completionFocus)}
      onRestChange={(value) => actions.change({ kind: "rest", value })}
      onExitFieldEditing={actions.focusScore} />
    {viewModel.message && <span className="note-entry-live" role="alert">{viewModel.message}</span>}
  </div>;
}
