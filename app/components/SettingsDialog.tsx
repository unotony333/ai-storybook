// app/components/SettingsDialog.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import OpenAI from "openai";
import { friendlyAIError } from "@/app/lib/ai-call";
import {
  PRESETS,
  ProviderSettings,
  StructuredOutputMode,
  emptyCustomSettings,
  presetToSettings,
} from "@/app/lib/provider";

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok" }
  | { status: "error"; message: string };

export interface SettingsDialogProps {
  open: boolean;
  initial: ProviderSettings | null;
  onClose: () => void;
  onSave: (settings: ProviderSettings) => void;
  onClear: () => void;
}

export function SettingsDialog({
  open,
  initial,
  onClose,
  onSave,
  onClear,
}: SettingsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [s, setS] = useState<ProviderSettings>(initial ?? emptyCustomSettings());
  const [showKey, setShowKey] = useState(false);
  const [headersText, setHeadersText] = useState<string>(
    initial?.headers ? JSON.stringify(initial.headers, null, 2) : "",
  );
  const [headersError, setHeadersError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setS(initial ?? emptyCustomSettings());
      setHeadersText(initial?.headers ? JSON.stringify(initial.headers, null, 2) : "");
      setHeadersError(null);
      setShowKey(false);
      setAdvancedOpen(false);
      setTest({ status: "idle" });
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open, initial]);

  function buildSettingsForCall(): ProviderSettings | null {
    let headers: Record<string, string> | undefined;
    if (headersText.trim()) {
      try {
        const parsed = JSON.parse(headersText);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("not an object");
        }
        headers = parsed as Record<string, string>;
      } catch {
        setHeadersError("Headers 必須是合法 JSON 物件，例如 {\"X-Foo\": \"bar\"}");
        return null;
      }
    }
    setHeadersError(null);
    return { ...s, headers };
  }

  async function handleTest() {
    const settings = buildSettingsForCall();
    if (!settings) return;
    setTest({ status: "testing" });
    try {
      if (settings.isLocal) {
        const client = new OpenAI({
          baseURL: settings.baseURL,
          apiKey: settings.apiKey || "no-key",
          defaultHeaders: settings.headers,
          dangerouslyAllowBrowser: true,
        });
        await client.models.list();
      } else {
        const res = await fetch("/api/test-provider", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: settings }),
        });
        const data: { ok?: boolean; error?: string } = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error ?? "連線失敗");
      }
      setTest({ status: "ok" });
    } catch (e) {
      const status = (e as { status?: number })?.status;
      const msg = status
        ? friendlyAIError(e)
        : e instanceof Error
          ? e.message
          : "連線失敗";
      setTest({ status: "error", message: msg });
    }
  }

  function applyPreset(presetId: string) {
    if (presetId === "custom") {
      const c = emptyCustomSettings();
      setS((prev) => ({ ...c, apiKey: prev.apiKey }));
      return;
    }
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setS((prev) => ({
      ...presetToSettings(preset),
      apiKey: prev.apiKey,
    }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const settings = buildSettingsForCall();
    if (!settings) return;
    onSave(settings);
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="rounded-xl p-0 backdrop:bg-black/40 max-w-xl w-[95vw]"
    >
      <form
        onSubmit={handleSave}
        className="flex flex-col gap-4 p-6 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">AI 設定</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            aria-label="關閉"
          >
            ✕
          </button>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">快速選擇</legend>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`text-xs rounded-full border px-3 py-1 ${
                  s.id === p.id
                    ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {p.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => applyPreset("custom")}
              className={`text-xs rounded-full border px-3 py-1 ${
                s.id === "custom"
                  ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              自訂
            </button>
          </div>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">名稱</span>
          <input
            type="text"
            value={s.name}
            onChange={(e) => setS({ ...s, name: e.target.value })}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Base URL</span>
          <input
            type="text"
            value={s.baseURL}
            onChange={(e) => setS({ ...s, baseURL: e.target.value })}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 font-mono text-sm"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium flex items-center justify-between">
            API Key
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="text-xs text-zinc-500"
            >
              {showKey ? "隱藏" : "顯示"}
            </button>
          </span>
          <input
            type={showKey ? "text" : "password"}
            value={s.apiKey}
            onChange={(e) => setS({ ...s, apiKey: e.target.value })}
            placeholder={s.isLocal ? "本地通常不需要" : "sk-..."}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 font-mono text-sm"
          />
          {!s.isLocal && !s.apiKey && (
            <span className="text-xs text-amber-600">尚未填入 API Key</span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">模型</span>
          <input
            type="text"
            value={s.model}
            onChange={(e) => setS({ ...s, model: e.target.value })}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 font-mono text-sm"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">結構化輸出</legend>
          {(["json_schema", "json_object", "none"] as StructuredOutputMode[]).map(
            (m) => (
              <label key={m} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="structuredOutput"
                  checked={s.structuredOutput === m}
                  onChange={() => setS({ ...s, structuredOutput: m })}
                />
                <span className="font-mono text-sm">{m}</span>
              </label>
            ),
          )}
        </fieldset>

        <details
          open={advancedOpen}
          onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="text-sm font-medium cursor-pointer">進階</summary>
          <div className="flex flex-col gap-3 pt-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.isLocal}
                onChange={(e) => setS({ ...s, isLocal: e.target.checked })}
              />
              <span className="text-sm">本地模型（從瀏覽器直接呼叫）</span>
            </label>
            {s.isLocal && (
              <p className="text-xs text-amber-600">
                本地模式：API Key 會出現在 browser network 面板，且 baseURL 必須允許跨網域 (CORS)。
              </p>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-sm">自訂 headers (JSON)</span>
              <textarea
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                rows={3}
                placeholder='{"X-Custom-Header": "value"}'
                className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 font-mono text-xs"
              />
              {headersError && (
                <span className="text-xs text-red-600">{headersError}</span>
              )}
            </label>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3 pt-2 text-sm">
          <button
            type="button"
            onClick={handleTest}
            disabled={test.status === "testing"}
            className="px-4 py-2 rounded-full border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
          >
            {test.status === "testing" ? "測試中…" : "測試連線"}
          </button>
          {test.status === "ok" && (
            <span className="text-green-600 dark:text-green-400">✓ 連線成功</span>
          )}
          {test.status === "error" && (
            <span className="text-red-600 dark:text-red-400">✗ {test.message}</span>
          )}
        </div>

        <div className="flex gap-3 justify-between pt-2">
          <button
            type="button"
            onClick={onClear}
            className="px-4 py-2 rounded-full border border-zinc-300 dark:border-zinc-700 text-sm"
          >
            還原預設
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full border border-zinc-300 dark:border-zinc-700 text-sm"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-full bg-black text-white dark:bg-white dark:text-black text-sm"
            >
              儲存
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
