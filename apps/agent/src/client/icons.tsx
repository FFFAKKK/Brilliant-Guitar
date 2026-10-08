import type { ReactNode } from "react";

export function Icon({ name }: { name: "send" | "settings" | "plus" | "close" | "agent" | "sidebar" | "file" | "activity" }) {
  const paths: Record<typeof name, ReactNode> = {
    send: <><path d="m5 12 14-7-5 14-2-6-7-1Z"/><path d="m12 13 7-8"/></>,
    settings: <><path d="M9.7 4.8 10.4 3h3.2l.7 1.8 1.5.9 2-.3 1.6 2.8-1.3 1.5v1.7l1.3 1.5-1.6 2.8-2-.3-1.5.9-.7 1.8h-3.2l-.7-1.8-1.5-.9-2 .3-1.6-2.8 1.3-1.5V9.7L4.6 8.2l1.6-2.8 2 .3Z"/><circle cx="12" cy="10.6" r="2.8"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    agent: <><path d="m4 15 4-7 4 7 4-7 4 7"/><path d="M4 19h16"/></>,
    sidebar: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>,
    file: <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z"/><path d="M14 3v5h5M8 12h8M8 16h6"/></>,
    activity: <><path d="M3 12h4l3-7 4 14 3-7h4"/></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
