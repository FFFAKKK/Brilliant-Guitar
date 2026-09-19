import * as Menubar from "@radix-ui/react-menubar";
import { useRef } from "react";
import type { ReactNode, Ref } from "react";
import { DocumentStatus } from "./document-status";

export interface NavigationAction {
  readonly id: string;
  readonly label: string;
  readonly shortcut?: string;
  // An absent handler means unavailable. The shell never simulates document actions.
  readonly onSelect?: () => void;
  readonly movesFocus?: boolean;
}

export interface NavigationGroup {
  readonly id: string;
  readonly label: string;
  readonly actions: readonly NavigationAction[];
  readonly description?: string;
}

interface NavigationBarProps {
  readonly groups: readonly NavigationGroup[];
  readonly triggerRefs?: Readonly<Record<string, Ref<HTMLButtonElement>>>;
  readonly documentTitle?: string;
  readonly documentState?: "unsaved" | "saved" | "saving" | "error";
  readonly tools?: ReactNode;
}

export function NavigationBar({ groups, triggerRefs, documentTitle, documentState, tools }: NavigationBarProps) {
  const selectedAction = useRef<NavigationAction | null>(null);
  return (
    <header className="navigation-bar">
      <nav aria-label="主导航">
        <Menubar.Root className="navigation-menus" aria-label="应用菜单" loop>
          {groups.map((group) => (
            <Menubar.Menu key={group.id}>
              <Menubar.Trigger
                className="navigation-trigger"
                ref={triggerRefs?.[group.id]}
              >
                {group.label}
              </Menubar.Trigger>
              <Menubar.Portal>
                <Menubar.Content
                  className="navigation-menu"
                  align="start"
                  sideOffset={8}
                  collisionPadding={12}
                  aria-describedby={group.description ? `${group.id}-description` : undefined}
                  onCloseAutoFocus={(event) => {
                    const action = selectedAction.current;
                    selectedAction.current = null;
                    if (action?.movesFocus) event.preventDefault();
                    // Run after menu teardown so Radix cannot overwrite a command's focus.
                    action?.onSelect?.();
                  }}
                >
                  {group.actions.map((action) => (
                    <Menubar.Item
                      className="navigation-item"
                      key={action.id}
                      disabled={!action.onSelect}
                      onSelect={() => { selectedAction.current = action; }}
                    >
                      <span className="navigation-item-label">{action.label}</span>
                      {action.shortcut && <kbd className="navigation-shortcut" aria-hidden="true">{action.shortcut}</kbd>}
                    </Menubar.Item>
                  ))}
                  {group.description && (
                    <>
                      <Menubar.Separator className="menu-separator" />
                      <p className="menu-description" id={`${group.id}-description`}>
                        {group.description}
                      </p>
                    </>
                  )}
                </Menubar.Content>
              </Menubar.Portal>
            </Menubar.Menu>
          ))}
        </Menubar.Root>
      </nav>
      <div className="navigation-trailing">
        <DocumentStatus title={documentTitle} state={documentState} />
        {tools}
      </div>
    </header>
  );
}

export function NavigationSettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm8 4.9v-2.2l-2.2-.7a7.2 7.2 0 0 0-.6-1.4l1.1-2-1.6-1.6-2 1.1a7.2 7.2 0 0 0-1.4-.6L12.6 3h-2.2l-.7 2.7a7.2 7.2 0 0 0-1.4.6l-2-1.1-1.6 1.6 1.1 2a7.2 7.2 0 0 0-.6 1.4l-2.2.7v2.2l2.2.7c.2.5.4 1 .6 1.4l-1.1 2 1.6 1.6 2-1.1c.4.3.9.5 1.4.6l.7 2.7h2.2l.7-2.7c.5-.2 1-.4 1.4-.6l2 1.1 1.6-1.6-1.1-2c.3-.4.5-.9.6-1.4l2.2-.7Z"
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
