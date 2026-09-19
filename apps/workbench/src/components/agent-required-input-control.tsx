import type { ReactElement } from "react";

import type { AgentRequiredUserInput } from "../agent/agent-contracts.ts";

export interface AgentRequiredInputControlProps {
  readonly input: AgentRequiredUserInput;
  readonly disabled: boolean;
  readonly selectionAvailable: boolean;
  readonly onSubmit: (requestId: string) => void;
}

type AgentRequiredInputControlContext = Omit<AgentRequiredInputControlProps, "input">;

type AgentRequiredInputRendererMap = {
  readonly [Kind in AgentRequiredUserInput["kind"]]: (
    input: Extract<AgentRequiredUserInput, { readonly kind: Kind }>,
    context: AgentRequiredInputControlContext,
  ) => ReactElement;
};

const REQUIRED_INPUT_RENDERERS = {
  "measure-selection": (input, { disabled, selectionAvailable, onSubmit }) => <button
    type="button"
    className="agent-recovery-action"
    disabled={disabled || !selectionAvailable}
    onClick={() => onSubmit(input.requestId)}
  >
    {selectionAvailable ? "继续任务" : "请先选择小节"}
  </button>,
} satisfies AgentRequiredInputRendererMap;

export function AgentRequiredInputControl({
  input,
  disabled,
  selectionAvailable,
  onSubmit,
}: Readonly<AgentRequiredInputControlProps>): ReactElement {
  const renderer = REQUIRED_INPUT_RENDERERS[input.kind] as (
    value: AgentRequiredUserInput,
    context: AgentRequiredInputControlContext,
  ) => ReactElement;
  return renderer(input, { disabled, selectionAvailable, onSubmit });
}
