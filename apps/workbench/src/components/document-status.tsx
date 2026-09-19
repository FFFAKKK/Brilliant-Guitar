import { documentStatusModel } from "./document-status-model.ts";
import type { DocumentSaveState } from "./document-status-model.ts";

interface Props {
  readonly title?: string | undefined;
  readonly state?: DocumentSaveState | undefined;
}

export function DocumentStatus({ title, state = "unsaved" }: Props) {
  const model = documentStatusModel(title, state);
  if (!model) return null;
  return (
    <div className="document-status" title={model.title} aria-label={model.ariaLabel} role="status" aria-live="polite">
      <span className="document-title">{model.title}</span>
      <span className={model.stateClassName}>{model.label}</span>
    </div>
  );
}
