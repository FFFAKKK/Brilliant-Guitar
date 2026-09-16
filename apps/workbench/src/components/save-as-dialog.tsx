import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initialName: string;
  readonly onSave: (name: string) => Promise<boolean>;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
}

/** Save-as names a downloaded project copy; it never changes the score title. */
export function SaveAsDialog({ open, onOpenChange, initialName, onSave, returnFocusRef }: Props) {
  const [name, setName] = useState(initialName);
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setName(initialName); setFailure(""); } }, [open]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    if (!name.trim()) { setFailure("请输入文件名"); field.current?.focus(); return; }
    locked.current = true; setSaving(true); setFailure("");
    try {
      if (await onSave(name)) onOpenChange(false);
      else setFailure("保存失败，文件名已保留，请重试");
    } finally { locked.current = false; setSaving(false); }
  }
  return <Dialog.Root open={open} onOpenChange={(value) => { if (!locked.current) onOpenChange(value); }}>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="about-dialog save-as-dialog"
        onOpenAutoFocus={(event) => { event.preventDefault(); field.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusRef.current?.focus(); }}
        onEscapeKeyDown={(event) => { if (locked.current) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (locked.current) event.preventDefault(); }}>
        <Dialog.Title className="dialog-title">另存为</Dialog.Title>
        <Dialog.Description className="dialog-description">下载项目文件，文件名不会改变作品标题。</Dialog.Description>
        <form onSubmit={submit} aria-busy={saving}>
          <label className="save-as-label" htmlFor="save-as-name">文件名</label>
          <div className="save-as-field">
            <input ref={field} id="save-as-name" className="text-field" value={name} disabled={saving}
              autoComplete="off" onChange={(event) => { setName(event.target.value); setFailure(""); }} />
            <span aria-hidden="true">.bgp.json</span>
          </div>
          {failure && <p className="form-error" role="alert">{failure}</p>}
          <div className="dialog-actions"><Dialog.Close className="button" disabled={saving}>取消</Dialog.Close>
            <button type="submit" className="button button-primary" disabled={saving}>{saving ? "正在保存…" : "保存文件"}</button></div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
