// app/components/SettingsButton.tsx
"use client";

import { useEffect, useState } from "react";
import { ProviderSettings } from "@/app/lib/provider";
import {
  clearProvider,
  loadProvider,
  saveProvider,
} from "@/app/lib/provider-storage";
import { SettingsDialog } from "./SettingsDialog";

export interface SettingsButtonProps {
  onChange?: (provider: ProviderSettings | null) => void;
}

export function SettingsButton({ onChange }: SettingsButtonProps) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderSettings | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProvider(loadProvider());
    setHydrated(true);
  }, []);

  function handleSave(next: ProviderSettings) {
    saveProvider(next);
    setProvider(next);
    onChange?.(next);
    setOpen(false);
  }

  function handleClear() {
    clearProvider();
    setProvider(null);
    onChange?.(null);
    setOpen(false);
  }

  const label = hydrated ? (provider?.name ?? "預設") : "…";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-4 right-4 z-40 flex items-center gap-2 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
        aria-label="AI 設定"
      >
        <span aria-hidden>⚙️</span>
        <span className="max-w-[140px] truncate">{label}</span>
      </button>
      <SettingsDialog
        open={open}
        initial={provider}
        onClose={() => setOpen(false)}
        onSave={handleSave}
        onClear={handleClear}
      />
    </>
  );
}
