// app/components/OutlineForm.tsx
"use client";

import { useState } from "react";
import { MAX_OUTLINE_LENGTH, PromptLang } from "@/app/lib/types";

export interface OutlineFormProps {
  onSubmit: (outline: string, promptLang: PromptLang) => void;
  isLoading: boolean;
  errorMessage?: string | null;
  initialOutline?: string;
  initialLang?: PromptLang;
}

export function OutlineForm({
  onSubmit,
  isLoading,
  errorMessage,
  initialOutline = "",
  initialLang = "zh",
}: OutlineFormProps) {
  const [outline, setOutline] = useState(initialOutline);
  const [lang, setLang] = useState<PromptLang>(initialLang);

  const trimmed = outline.trim();
  const tooLong = trimmed.length > MAX_OUTLINE_LENGTH;
  const canSubmit = trimmed.length > 0 && !tooLong && !isLoading;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(trimmed, lang);
      }}
      className="flex flex-col gap-4 w-full max-w-2xl"
    >
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">繪本大綱 / 想法</span>
        <textarea
          value={outline}
          onChange={(e) => setOutline(e.target.value)}
          rows={6}
          placeholder="例如：一隻小兔子第一次學會自己綁鞋帶，遇到了哪些事？"
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-base"
          disabled={isLoading}
        />
        <span
          className={`text-xs ${
            tooLong ? "text-red-600" : "text-zinc-500"
          }`}
        >
          {outline.length} / {MAX_OUTLINE_LENGTH}
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">圖片提示詞語言</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="promptLang"
              value="zh"
              checked={lang === "zh"}
              onChange={() => setLang("zh")}
              disabled={isLoading}
            />
            <span>中文</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="promptLang"
              value="en"
              checked={lang === "en"}
              onChange={() => setLang("en")}
              disabled={isLoading}
            />
            <span>English</span>
          </label>
        </div>
      </fieldset>

      {errorMessage && (
        <p className="text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="self-start rounded-full bg-black text-white dark:bg-white dark:text-black px-6 py-3 text-base font-medium disabled:opacity-50"
      >
        {isLoading ? "生成中…" : "生成繪本"}
      </button>
    </form>
  );
}
