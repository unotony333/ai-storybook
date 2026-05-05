// app/components/RegenerateDialog.tsx
"use client";

import { useEffect, useRef, useState } from "react";

export interface RegenerateDialogProps {
  open: boolean;
  pageNumber: number;
  onCancel: () => void;
  onConfirm: (hint: string | undefined) => void;
}

export function RegenerateDialog({
  open,
  pageNumber,
  onCancel,
  onConfirm,
}: RegenerateDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [hint, setHint] = useState("");

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setHint("");
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      className="rounded-xl p-0 backdrop:bg-black/40 max-w-md w-[90vw]"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(hint.trim() || undefined);
        }}
        className="flex flex-col gap-4 p-6 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50"
      >
        <h2 className="text-lg font-semibold">
          重新生成第 {pageNumber} 頁
        </h2>
        <label className="flex flex-col gap-2">
          <span className="text-sm">修改提示（選填）</span>
          <textarea
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            rows={3}
            placeholder="例如：讓主角變成貓 / 場景改到夜晚 / 加入一隻鳥"
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2"
          />
        </label>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-full border border-zinc-300 dark:border-zinc-700"
          >
            取消
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-full bg-black text-white dark:bg-white dark:text-black"
          >
            重新生成
          </button>
        </div>
      </form>
    </dialog>
  );
}
