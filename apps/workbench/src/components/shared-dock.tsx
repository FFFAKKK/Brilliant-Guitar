import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { activeDockItem, pairedDockItems } from "../ui/shared-dock-selection";
import type { SharedDockSlot } from "../ui/shared-dock-selection";
import type { InlineDockZone } from "../ui/shared-dock-selection";

export interface SharedDockItem {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly content: ReactNode;
  readonly inlineZone?: InlineDockZone;
}

interface Props {
  readonly slot: SharedDockSlot;
  readonly items: readonly SharedDockItem[];
  readonly preferredId: string | null;
  readonly onSelect: (id: string, availableIds: readonly string[]) => void;
  readonly motionEnabled: boolean;
}

const SLOT_LABELS: Record<SharedDockSlot, string> = {
  top: "上方停靠区", left: "左侧停靠区", right: "右侧停靠区", bottom: "下方停靠区",
};

/** Dock geometry and switching belong here; each item's visuals stay in its own module. */
export function SharedDock({ slot, items, preferredId, onSelect, motionEnabled }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const outsideRef = useRef(false);
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const ids = items.map((item) => item.id);
  const activeId = activeDockItem(ids, preferredId);
  const active = items.find((item) => item.id === activeId);
  const isSide = slot === "left" || slot === "right";
  const rail = space.width > 0 && (isSide ? space.width < 80 || space.height < 196 : space.width < 480 || space.height < 52);
  const pairedItems = pairedDockItems(slot, items);
  const inlineItems = !rail && space.width >= 480 && space.height >= 52 ? pairedItems : null;
  const compactCenter = rail && (slot === "top" || slot === "bottom")
    ? pairedItems?.find((item) => item.inlineZone === "center") : null;
  const compactLeading = compactCenter ? pairedItems?.find((item) => item.inlineZone === "leading") : null;
  const compactTrailing = compactCenter ? pairedItems?.find((item) => item.inlineZone === "trailing") : null;
  const railItems = compactCenter ? [compactLeading, compactTrailing].filter((item): item is SharedDockItem => Boolean(item))
    : pairedItems ?? items;
  const flyoutOpen = rail && open && !!active;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = (width: number, height: number) => setSpace((previous) =>
      previous.width === width && previous.height === height ? previous : { width, height });
    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height));
    });
    observer.observe(root);
    const bounds = root.getBoundingClientRect();
    update(Math.round(bounds.width), Math.round(bounds.height));
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (!rail || !active) setOpen(false); }, [rail, activeId]);

  function updatePosition(button: HTMLButtonElement | null) {
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(208, Math.max(0, window.innerWidth - 24));
    const height = Math.min(194, Math.max(0, window.innerHeight - 24));
    const x = slot === "left" ? rect.right + 8 : slot === "right" ? rect.left - width - 8 : rect.left;
    const y = slot === "top" ? rect.bottom + 8 : slot === "bottom" ? rect.top - height - 8 : rect.top;
    setPosition({ left: Math.max(12, Math.min(x, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(y, window.innerHeight - height - 12)) });
  }
  useEffect(() => {
    if (!flyoutOpen) return;
    const update = () => updatePosition(buttonRefs.current[activeId ?? ""] ?? null);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [flyoutOpen, activeId, slot]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number, vertical: boolean,
    sequence: readonly SharedDockItem[] = items) {
    const step = vertical
      ? event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : null
      : event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : null;
    const next = step === null ? event.key === "Home" ? 0 : event.key === "End" ? sequence.length - 1 : null
      : (index + step + sequence.length) % sequence.length;
    if (next === null || !sequence[next]) return;
    event.preventDefault();
    onSelect(sequence[next].id, ids);
    buttonRefs.current[sequence[next].id]?.focus();
  }

  return <div className="shared-dock" data-slot={slot} data-rail={rail}
    data-inline={Boolean(inlineItems)} data-has-tabs={!rail && !inlineItems && items.length > 1} ref={rootRef}>
    {compactCenter ? <div className="shared-dock-compact" role="toolbar" aria-label={`${SLOT_LABELS[slot]}的组件`}>
      {railItems.map((item, index) => <button key={item.id} type="button" className="shared-dock-icon"
        data-zone={item.inlineZone} ref={(node) => { buttonRefs.current[item.id] = node; }}
        aria-label={`${flyoutOpen && item.id === activeId ? "关闭" : "打开"}${item.label}`} title={item.label}
        aria-expanded={flyoutOpen && item.id === activeId} aria-controls={`shared-dock-${slot}-flyout`}
        aria-pressed={flyoutOpen && item.id === activeId} onKeyDown={(event) => navigate(event, index, false, railItems)}
        onClick={(event) => {
          outsideRef.current = false; updatePosition(event.currentTarget);
          if (item.id !== activeId) { onSelect(item.id, ids); setOpen(true); } else setOpen((previous) => !previous);
        }}>{item.icon}</button>)}
      <div className="shared-dock-compact-primary">{compactCenter.content}</div>
    </div> : rail ? <div className="shared-dock-icons" role="toolbar" aria-label={`${SLOT_LABELS[slot]}的组件`}>
      {railItems.map((item, index) => <button key={item.id} type="button" className="shared-dock-icon"
        ref={(node) => { buttonRefs.current[item.id] = node; }}
        aria-label={`${flyoutOpen && item.id === activeId ? "关闭" : "打开"}${item.label}`}
        title={item.label} aria-expanded={flyoutOpen && item.id === activeId} aria-controls={`shared-dock-${slot}-flyout`}
        aria-pressed={item.id === activeId} onKeyDown={(event) => navigate(event, index, true, railItems)}
        onClick={(event) => {
          outsideRef.current = false;
          updatePosition(event.currentTarget);
          if (item.id !== activeId) { onSelect(item.id, ids); setOpen(true); }
          else setOpen((previous) => !previous);
        }}>{item.icon}</button>)}
    </div> : inlineItems ? <div className="shared-dock-inline">
      {inlineItems.map((item) => <div key={item.id} className="shared-dock-inline-body"
        data-zone={item.inlineZone}>{item.content}</div>)}
    </div> : <>
      {items.length > 1 && <div className="shared-dock-tabs" role="tablist" aria-label={`${SLOT_LABELS[slot]}的组件`}>
        {items.map((item, index) => <button key={item.id} type="button" className="shared-dock-icon"
          ref={(node) => { buttonRefs.current[item.id] = node; }}
          id={`shared-dock-${slot}-tab-${item.id}`} role="tab" aria-selected={item.id === activeId}
          aria-controls={`shared-dock-${slot}-panel-${item.id}`} tabIndex={item.id === activeId ? 0 : -1}
          aria-label={item.label} title={item.label} onClick={() => onSelect(item.id, ids)}
          onKeyDown={(event) => navigate(event, index, false)}>{item.icon}</button>)}
      </div>}
      {items.map((item) => <div key={item.id} className="shared-dock-body" hidden={item.id !== activeId}
        {...(items.length > 1 ? { id: `shared-dock-${slot}-panel-${item.id}`, role: "tabpanel",
          "aria-labelledby": `shared-dock-${slot}-tab-${item.id}` } : {})}>
        {item.content}
      </div>)}
    </>}
    <Dialog.Root modal={false} open={flyoutOpen} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Content className="shared-dock-flyout" id={`shared-dock-${slot}-flyout`}
          data-motion={motionEnabled ? "on" : "off"} style={position as CSSProperties}
          onFocusOutside={(event) => { event.preventDefault(); }}
          onPointerDownOutside={() => { outsideRef.current = true; }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!outsideRef.current) buttonRefs.current[activeId ?? ""]?.focus();
            outsideRef.current = false;
          }}>
          <Dialog.Title className="visually-hidden">{active?.label ?? "组件"}</Dialog.Title>
          <div className="shared-dock-flyout-body">{active?.content}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}
