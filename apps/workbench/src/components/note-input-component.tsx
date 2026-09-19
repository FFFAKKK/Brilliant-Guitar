import { NoteInputPanel } from "./note-input-panel";
import { useHostedUiComponent } from "./ui-component-host";
import type { NoteControlProjection } from "../ui/first-party-plugin-projections.ts";
import { controlChangeSignal } from "../input/input-signal.ts";
import type { UiResolvedComponentExtension } from "../ui/view-contribution.ts";
import { NoteInputPreferenceFields } from "./note-input-preference-fields.tsx";

/** The dock owns placement; the note feature supplies only its recognizable mark. */
export function NoteControlDockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M16 4v12.5" /><path d="M16 4h3" />
    <ellipse cx="11.5" cy="17.7" rx="4.5" ry="2.6" transform="rotate(-20 11.5 17.7)" fill="currentColor" stroke="none" />
  </svg>;
}

/** This feature owns its interface and conditional feedback, without a persistent help row. */
export function NoteInputComponent({ projection, extensions = [] }: {
  readonly projection: NoteControlProjection;
  readonly extensions?: readonly UiResolvedComponentExtension[];
}) {
  const { slot } = useHostedUiComponent();
  const { viewModel, actions } = projection;
  const extensionControls = extensions.flatMap((extension) => {
    const content = extension.render();
    return content === null || content === undefined || content === false ? [] : [
      <div className="note-control-extension" data-extension-id={extension.id} key={extension.id}>{content}</div>,
    ];
  });
  return <div className="note-input-dock" data-slot={slot}>
    <div className="note-control-surface">
    <NoteInputPanel {...viewModel.value} position={viewModel.position} disabled={viewModel.disabled} pending={viewModel.pending} feedback={viewModel.message}
      onDurationChange={(value) => actions.input(controlChangeSignal({ kind: "duration", value }))}
      onAccidentalChange={(value, completionFocus) => actions.input(controlChangeSignal({ kind: "accidental", value }), completionFocus)}
      onPitchChange={(value, completionFocus) => actions.input(controlChangeSignal({ kind: "pitch", value }), completionFocus)}
      onRestChange={(value) => actions.input(controlChangeSignal({ kind: "rest", value }))}
      onExitFieldEditing={actions.focusScore} />
    <details className="note-control-preferences">
      <summary aria-label="输入偏好" title="输入偏好">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
        </svg>
      </summary>
      <div className="note-control-preferences-popover">
        <NoteInputPreferenceFields value={viewModel.preferences} compact disabled={!viewModel.preferencesReady}
          onRetentionChange={actions.setRetention} onDefaultDurationChange={actions.setDefaultDuration} />
        <button type="button" className="note-control-more-settings" aria-label="在应用设置中打开谱面输入设置"
          onClick={actions.openApplicationSettings}>更多输入设置…</button>
      </div>
    </details>
    </div>
    {extensionControls.length > 0 && <div className="note-control-extensions" aria-label="音符扩展控制">
      {extensionControls}
    </div>}
    {viewModel.message && <span className="note-entry-live" role="alert">{viewModel.message}</span>}
  </div>;
}
