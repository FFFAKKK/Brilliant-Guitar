import type { ReactNode } from "react";
import { HistoryControlComponent, HistoryDockIcon } from "../components/history-control-component.tsx";
import { NoteControlDockIcon } from "../components/note-input-component.tsx";
import { PaperZoomControl, PaperZoomDockIcon } from "../components/paper-zoom-control.tsx";
import { useHostedUiComponent } from "../components/ui-component-host.tsx";
import type { UiComponentViewContribution } from "./view-contribution.ts";

interface HistoryProjection {
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly blocked: boolean;
  readonly activity: Readonly<{ kind: "undo" | "redo"; sequence: number }> | undefined;
}

interface PaperZoomProjection {
  readonly zoom: number;
  readonly enabled: boolean;
}

function HistoryContributionView(props: HistoryProjection) {
  const component = useHostedUiComponent();
  return <HistoryControlComponent {...props} onHistory={(kind) => {
    component.executeCommand(kind === "undo" ? "edit.undo" : "edit.redo");
  }} />;
}

function PaperZoomContributionView({ zoom, enabled }: PaperZoomProjection) {
  const component = useHostedUiComponent();
  return <div className="paper-zoom-dock"><PaperZoomControl zoom={zoom} enabled={enabled}
    onZoomIn={() => { component.executeCommand("view.paper-zoom-in"); }}
    onZoomOut={() => { component.executeCommand("view.paper-zoom-out"); }}
    onFit={() => { component.executeCommand("view.paper-fit"); }} /></div>;
}

export function builtInViewContributions(content: Readonly<{
  staff: ReactNode;
  noteControl: ReactNode;
  history: HistoryProjection;
  paperZoom: PaperZoomProjection;
}>): readonly UiComponentViewContribution[] {
  return [
    { componentId: "notation.staff-view", label: "五线谱", render: () => content.staff },
    { componentId: "notation.note-input", label: "音符控制", icon: <NoteControlDockIcon />, render: () => content.noteControl },
    { componentId: "notation.history-control", label: "编辑历史", icon: <HistoryDockIcon />,
      inlineZone: "leading", render: () => <HistoryContributionView {...content.history} /> },
    { componentId: "notation.paper-zoom", label: "谱面缩放", icon: <PaperZoomDockIcon />,
      inlineZone: "trailing", render: () => <PaperZoomContributionView {...content.paperZoom} /> },
  ];
}
