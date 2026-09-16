import { useLayoutEffect } from "react";
import type { WorkbenchCommand } from "../commands/workbench-command.ts";
import { useWorkbenchRuntime } from "./workbench-runtime.tsx";

/** Registers command contributions without giving components ownership of global keyboard listeners. */
export function useWorkbenchCommands(commands: readonly WorkbenchCommand[]): void {
  const runtime = useWorkbenchRuntime();
  useLayoutEffect(() => {
    const dispose = commands.map((command) => runtime.commands.register(command));
    return () => { for (const unregister of dispose.reverse()) unregister(); };
  }, [commands, runtime.commands]);
}
