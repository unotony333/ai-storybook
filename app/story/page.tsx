// app/story/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StoryPageCard } from "@/app/components/StoryPageCard";
import { RegenerateDialog } from "@/app/components/RegenerateDialog";
import { SettingsButton } from "@/app/components/SettingsButton";
import { regeneratePage } from "@/app/lib/openai";
import { friendlyAIError } from "@/app/lib/ai-call";
import { loadProvider } from "@/app/lib/provider-storage";
import {
  clearDraft,
  loadDraft,
  saveDraft,
} from "@/app/lib/storage";
import { Storybook, type StoryPage } from "@/app/lib/types";

export default function StoryPage() {
  const router = useRouter();
  const [book, setBook] = useState<Storybook | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [regenTarget, setRegenTarget] = useState<number | null>(null);
  const [regenLoading, setRegenLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const draft = loadDraft();
    if (!draft) {
      router.replace("/");
      return;
    }
    setBook(draft);
    setHydrated(true);
  }, [router]);

  if (!hydrated || !book) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">載入中…</p>
      </main>
    );
  }

  function updatePage(next: StoryPage) {
    setBook((prev) => {
      if (!prev) return prev;
      const pages = prev.pages.map((p) =>
        p.pageNumber === next.pageNumber ? next : p,
      );
      const updated = { ...prev, pages };
      saveDraft(updated);
      return updated;
    });
  }

  async function handleRegenerate(hint: string | undefined) {
    if (regenTarget == null || !book) return;
    const target = regenTarget;
    setRegenTarget(null);
    setRegenLoading(target);
    setError(null);

    const otherPages = book.pages.filter((p) => p.pageNumber !== target);
    const provider = loadProvider();

    try {
      let page: StoryPage;
      if (provider?.isLocal) {
        page = await regeneratePage({
          provider,
          outline: book.outline,
          lang: book.promptLang,
          pageNumber: target,
          otherPages,
          userHint: hint,
        });
      } else {
        const res = await fetch("/api/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outline: book.outline,
            promptLang: book.promptLang,
            pageNumber: target,
            otherPages,
            userHint: hint,
            provider: provider ?? undefined,
          }),
        });
        const data: { page?: StoryPage; error?: string } = await res.json();
        if (!res.ok || !data.page) {
          throw new Error(data.error ?? "重新生成失敗");
        }
        page = data.page;
      }
      updatePage(page);
    } catch (e) {
      setError(formatError(e, provider?.isLocal ?? false));
    } finally {
      setRegenLoading(null);
    }
  }

  function handleRestart() {
    if (!confirm("確定要清除目前的繪本，重新開始嗎？")) return;
    clearDraft();
    router.push("/");
  }

  return (
    <>
      <SettingsButton />
      <main className="flex flex-1 flex-col items-center px-6 py-12">
        <div className="w-full max-w-3xl flex flex-col gap-6">
          <header className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">你的繪本</h1>
              <p className="text-sm text-zinc-500 mt-1">大綱：{book.outline}</p>
            </div>
            <button
              type="button"
              onClick={handleRestart}
              className="shrink-0 rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm"
            >
              重新開始
            </button>
          </header>

          {error && (
            <p
              className="rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 px-4 py-3 text-sm"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="flex flex-col gap-6">
            {book.pages.map((p) => (
              <StoryPageCard
                key={p.pageNumber}
                page={p}
                isRegenerating={regenLoading === p.pageNumber}
                onChange={updatePage}
                onRegenerateClick={() => setRegenTarget(p.pageNumber)}
              />
            ))}
          </div>
        </div>

        <RegenerateDialog
          open={regenTarget != null}
          pageNumber={regenTarget ?? 0}
          onCancel={() => setRegenTarget(null)}
          onConfirm={handleRegenerate}
        />
      </main>
    </>
  );
}

function formatError(e: unknown, isLocal: boolean): string {
  const status = (e as { status?: number })?.status;
  if (status) return friendlyAIError(e);
  const msg = e instanceof Error ? e.message : "重新生成失敗";
  if (isLocal && /fetch|network|cors/i.test(msg)) {
    return `無法連線到本地模型：${msg}。請確認服務已啟動且允許跨網域。`;
  }
  return msg;
}
