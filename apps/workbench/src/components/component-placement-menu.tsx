import { useEffect, useRef, useState } from "react";
import type { UiSlot } from "../ui/plugin-contract.ts";
import { useHostedUiComponent } from "./ui-component-host.tsx";

const LOCATIONS: readonly Readonly<{ slot: Extract<UiSlot, "top" | "bottom" | "left" | "right">; label: string }>[] = [
  { slot: "top", label: "上方" }, { slot: "bottom", label: "下方" },
  { slot: "left", label: "左侧" }, { slot: "right", label: "右侧" },
];

function LayoutIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5"
    fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M5 9h14M9 9v10" fill="none"
    stroke="currentColor" strokeWidth="1.4" /></svg>;
}

export function ComponentPlacementMenu({ label }: { readonly label: string }) {
  const component = useHostedUiComponent();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return <div className="component-placement" ref={rootRef}>
    <button type="button" className="component-placement-trigger" aria-label={`调整${label}位置`} title="组件位置"
      aria-expanded={open} onClick={() => setOpen((value) => !value)}><LayoutIcon /></button>
    {open && <div className="component-placement-menu" role="menu" aria-label={`${label}位置`}>
      {LOCATIONS.map(({ slot, label: locationLabel }) => <button key={slot} type="button" role="menuitemradio"
        aria-checked={component.slot === slot} disabled={component.slot === slot}
        onClick={() => { setOpen(false); component.moveTo(slot); }}>{locationLabel}</button>)}
    </div>}
  </div>;
}
