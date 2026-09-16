import type { ReactNode, Ref } from "react";

interface WorkspaceSurfaceProps {
  readonly children?: ReactNode;
  readonly surfaceRef?: Ref<HTMLElement>;
}

/** Hosts content without importing a score renderer or owning music data. */
export function WorkspaceSurface({ children, surfaceRef }: WorkspaceSurfaceProps) {
  return (
    <main id="workspace" className="workspace-surface" aria-label="工作区" tabIndex={-1} ref={surfaceRef}>
      {children}
    </main>
  );
}
