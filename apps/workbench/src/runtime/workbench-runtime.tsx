import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { WorkbenchCommandRouter } from "../commands/workbench-command.ts";
import { useWorkbenchFeedback } from "../feedback/use-workbench-feedback.ts";
import type { WorkbenchFeedbackCoordinator } from "../feedback/use-workbench-feedback.ts";
import { UiComponentRuntime } from "../ui/component-runtime.ts";
import { useWorkbenchFocus } from "../workbench/use-workbench-focus.ts";
import type { WorkbenchFocusController } from "../workbench/use-workbench-focus.ts";
import { useWorkbenchOperations } from "../workbench/operation-state.ts";
import type { WorkbenchOperationController } from "../workbench/operation-state.ts";

/** Headless application services shared by the shell and every UI contribution. */
export interface WorkbenchRuntime {
  readonly commands: WorkbenchCommandRouter;
  readonly operations: WorkbenchOperationController;
  readonly feedback: WorkbenchFeedbackCoordinator;
  readonly focus: WorkbenchFocusController;
  readonly components: UiComponentRuntime;
}

export type WorkbenchTaskRuntime = Pick<WorkbenchRuntime, "feedback" | "operations">;

const RuntimeContext = createContext<WorkbenchRuntime | null>(null);

export function WorkbenchRuntimeProvider({ focusFallback, children }: {
  readonly focusFallback: RefObject<HTMLElement | null>;
  readonly children: ReactNode;
}) {
  const feedback = useWorkbenchFeedback();
  const operations = useWorkbenchOperations();
  const focus = useWorkbenchFocus(focusFallback);
  const [commands] = useState(() => new WorkbenchCommandRouter());
  const [components] = useState(() => new UiComponentRuntime(feedback.report));
  useEffect(() => () => components.dispose(), [components]);
  const runtime = useMemo<WorkbenchRuntime>(() => ({ commands, operations, feedback, focus, components }),
    [commands, components, feedback, focus, operations]);
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

export function useWorkbenchRuntime(): WorkbenchRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("useWorkbenchRuntime must be used inside WorkbenchRuntimeProvider");
  return runtime;
}
