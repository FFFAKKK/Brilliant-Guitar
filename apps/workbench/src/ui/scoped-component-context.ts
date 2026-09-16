import type { WorkbenchIssue } from "../contracts/workbench-issue.ts";
import type { UiCommand, UiComponentContext, UiComponentDefinition } from "./plugin-contract.ts";

export class UiComponentPermissionError extends Error {
  readonly componentId: string;
  readonly command: string;
  constructor(componentId: string, command: string) {
    super(`Component ${componentId} cannot execute ${command}`);
    this.componentId = componentId; this.command = command;
  }
}

export function authorizeUiComponentCommand(definition: UiComponentDefinition, command: string,
  onIssue?: (issue: WorkbenchIssue) => void): boolean {
  if (definition.permissions.commands.includes(command)) return true;
  const message = `组件 ${definition.id} 没有执行 ${command} 的权限`;
  onIssue?.({ code: "component.command-permission-denied", message, severity: "error", source: "host",
    target: { scope: "component", componentId: definition.id } });
  return false;
}

export function createScopedUiComponentContext(definition: UiComponentDefinition, context: UiComponentContext,
  onIssue?: (issue: WorkbenchIssue) => void): UiComponentContext {
  const reads = new Set(definition.permissions.reads);
  const dispatch = async (command: UiCommand) => {
    if (!authorizeUiComponentCommand(definition, command.type, onIssue))
      throw new UiComponentPermissionError(definition.id, command.type);
    await context.commands.dispatch(command);
  };
  return {
    ...context,
    session: reads.has("score.document") ? context.session : null,
    selection: reads.has("score.selection") ? context.selection : { count: 0 },
    input: reads.has("input.state") ? context.input : { enabled: false, durationBase: 4, durationDots: 0 },
    commands: { dispatch },
  };
}
