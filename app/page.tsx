// app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OutlineForm } from "./components/OutlineForm";
import { SettingsButton } from "./components/SettingsButton";
import { generateStory } from "./lib/openai";
import { friendlyAIError } from "./lib/ai-call";
import { loadProvider } from "./lib/provider-storage";
import { loadDraft, saveDraft } from "./lib/storage";
import { PromptLang, StoryPage } from "./lib/types";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [initialOutline, setInitialOutline] = useState("");
  const [initialLang, setInitialLang] = useState<PromptLang>("zh");

  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setInitialOutline(draft.outline);
      setInitialLang(draft.promptLang);
    }
    setHydrated(true);
  }, []);

  async function handleSubmit(outline: string, promptLang: PromptLang) {
    setIsLoading(true);
    setError(null);
    try {
      const provider = loadProvider();
      let pages: StoryPage[];

      if (provider?.isLocal) {
        pages = await generateStory(provider, outline, promptLang);
      } else {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outline, promptLang, provider: provider ?? undefined }),
        });
        const data: { pages?: StoryPage[]; error?: string } = await res.json();
        if (!res.ok || !data.pages) {
          throw new Error(data.error ?? "生成失敗");
        }
        pages = data.pages;
      }

      saveDraft({ outline, promptLang, pages });
      router.push("/story");
    } catch (e) {
      setError(formatError(e, loadProvider()?.isLocal ?? false));
      setIsLoading(false);
    }
  }

  return (
    <>
      <SettingsButton />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl flex flex-col gap-8">
          <header className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">AI Storybook</h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              輸入一段大綱，自動生成 5 頁可編輯的繪本故事。
            </p>
          </header>
          {hydrated && (
            <OutlineForm
              onSubmit={handleSubmit}
              isLoading={isLoading}
              errorMessage={error}
              initialOutline={initialOutline}
              initialLang={initialLang}
            />
          )}
          {isLoading && <GenerateSkeleton />}
        </div>
      </main>
    </>
  );
}

function GenerateSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <p className="text-sm text-zinc-500">正在生成 5 頁繪本，這通常需要 5–15 秒…</p>
      {[1, 2, 3, 4, 5].map((n) => (
        <div
          key={n}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 animate-pulse"
        >
          <div className="h-4 w-20 rounded bg-zinc-200 dark:bg-zinc-800 mb-4" />
          <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-800 mb-2" />
          <div className="h-3 w-5/6 rounded bg-zinc-200 dark:bg-zinc-800 mb-4" />
          <div className="h-3 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

function formatError(e: unknown, isLocal: boolean): string {
  const status = (e as { status?: number })?.status;
  if (status) return friendlyAIError(e);
  const msg = e instanceof Error ? e.message : "生成失敗";
  if (isLocal && /fetch|network|cors/i.test(msg)) {
    return `無法連線到本地模型：${msg}。請確認服務已啟動且允許跨網域。`;
  }
  return msg;
}
