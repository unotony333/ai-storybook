// app/components/StoryPageCard.tsx
"use client";

import { useState } from "react";
import { StoryPage } from "@/app/lib/types";

export interface StoryPageCardProps {
  page: StoryPage;
  isRegenerating: boolean;
  onChange: (next: StoryPage) => void;
  onRegenerateClick: () => void;
}

export function StoryPageCard({
  page,
  isRegenerating,
  onChange,
  onRegenerateClick,
}: StoryPageCardProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(page.imagePrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <article
      className={`flex flex-col gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 ${
        isRegenerating ? "opacity-60" : ""
      }`}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">第 {page.pageNumber} 頁</h2>
        <button
          type="button"
          onClick={onRegenerateClick}
          disabled={isRegenerating}
          className="text-sm rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1 disabled:opacity-50"
        >
          {isRegenerating ? "重新生成中…" : "重新生成"}
        </button>
      </header>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">故事文字</span>
        <textarea
          value={page.text}
          onChange={(e) => onChange({ ...page, text: e.target.value })}
          rows={3}
          disabled={isRegenerating}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 text-base"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium flex items-center justify-between">
          圖片提示詞
          <button
            type="button"
            onClick={handleCopy}
            disabled={isRegenerating}
            className="text-xs rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 disabled:opacity-50"
          >
            {copied ? "已複製 ✓" : "複製"}
          </button>
        </span>
        <textarea
          value={page.imagePrompt}
          onChange={(e) =>
            onChange({ ...page, imagePrompt: e.target.value })
          }
          rows={3}
          disabled={isRegenerating}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 font-mono text-sm"
        />
      </label>
    </article>
  );
}
