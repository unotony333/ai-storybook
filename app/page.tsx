// app/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OutlineForm } from "./components/OutlineForm";
import { saveDraft } from "./lib/storage";
import { PromptLang, StoryPage } from "./lib/types";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(outline: string, promptLang: PromptLang) {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outline, promptLang }),
      });
      const data: { pages?: StoryPage[]; error?: string } = await res.json();
      if (!res.ok || !data.pages) {
        throw new Error(data.error ?? "生成失敗");
      }
      saveDraft({ outline, promptLang, pages: data.pages });
      router.push("/story");
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失敗");
      setIsLoading(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">AI Storybook</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            輸入一段大綱，自動生成 5 頁可編輯的繪本故事。
          </p>
        </header>
        <OutlineForm
          onSubmit={handleSubmit}
          isLoading={isLoading}
          errorMessage={error}
        />
      </div>
    </main>
  );
}
