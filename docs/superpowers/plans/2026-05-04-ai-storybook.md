# AI Storybook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js app that turns a user-supplied outline into a 5-page editable storybook using OpenAI Structured Outputs, with per-page regeneration and localStorage persistence.

**Architecture:** Next.js 16 App Router. Two client routes (`/` outline form, `/story` editor) plus two Route Handlers (`/api/generate`, `/api/regenerate`) calling OpenAI `gpt-4o-mini` with strict JSON schema. Drafts live in `localStorage` only — no DB.

**Tech Stack:** Next.js 16.2.4, React 19, TypeScript, Tailwind v4, `openai` npm SDK.

**Spec:** [`docs/superpowers/specs/2026-05-04-ai-storybook-design.md`](../specs/2026-05-04-ai-storybook-design.md)

**Test policy:** The spec explicitly excludes automated tests for this demo project. Verification is **manual** against the spec's acceptance criteria (see Task 13). Each task ends with a commit.

---

## File Structure

```
app/
├── layout.tsx                 [modify] title metadata
├── page.tsx                   [modify] outline form page
├── story/page.tsx             [create] editor page
├── api/generate/route.ts      [create] POST handler
├── api/regenerate/route.ts    [create] POST handler
├── lib/types.ts               [create] shared types
├── lib/openai-schema.ts       [create] JSON schemas
├── lib/openai.ts              [create] OpenAI calls
├── lib/storage.ts             [create] localStorage helpers
└── components/
    ├── OutlineForm.tsx        [create]
    ├── StoryPageCard.tsx      [create]
    └── RegenerateDialog.tsx   [create]
.env.local                     [create] OPENAI_API_KEY
.env.example                   [create]
```

---

### Task 1: Install OpenAI SDK and set up environment files

**Files:**
- Modify: `package.json` (via npm install)
- Create: `.env.example`
- Create: `.env.local` (manual, gitignored)

- [ ] **Step 1: Install the OpenAI SDK**

Run from `/Users/tony/ai-storybook`:
```bash
npm install openai@^4.77.0
```
Expected: `package.json` and `package-lock.json` updated, `node_modules/openai` exists.

- [ ] **Step 2: Create `.env.example`**

File: `.env.example`
```
OPENAI_API_KEY=sk-your-key-here
```

- [ ] **Step 3: Verify `.env.local` exists with a real key**

`.env*` is already in `.gitignore`. Ask the user to populate `.env.local` with their real key:
```
OPENAI_API_KEY=sk-...
```

If `.env.local` is missing, create an empty placeholder file and tell the user to fill it in before running the app.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "Install openai SDK and add env template"
```

---

### Task 2: Shared types

**Files:**
- Create: `app/lib/types.ts`

- [ ] **Step 1: Write the file**

```ts
// app/lib/types.ts
export type PromptLang = "zh" | "en";

export interface StoryPage {
  pageNumber: number;
  text: string;
  imagePrompt: string;
}

export interface Storybook {
  outline: string;
  promptLang: PromptLang;
  pages: StoryPage[];
}

export const PAGE_COUNT = 5;
export const MAX_OUTLINE_LENGTH = 1000;
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/types.ts
git commit -m "Add shared Storybook types"
```

---

### Task 3: OpenAI JSON schemas

**Files:**
- Create: `app/lib/openai-schema.ts`

Two schemas: one for the full 5-page generation, one for a single page. Both used with `response_format: { type: "json_schema", strict: true }`.

- [ ] **Step 1: Write the schemas**

```ts
// app/lib/openai-schema.ts
export const pageSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    pageNumber: { type: "integer", minimum: 1, maximum: 5 },
    text: { type: "string" },
    imagePrompt: { type: "string" },
  },
  required: ["pageNumber", "text", "imagePrompt"],
} as const;

export const storySchema = {
  name: "storybook",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      pages: {
        type: "array",
        items: pageSchema,
        minItems: 5,
        maxItems: 5,
      },
    },
    required: ["pages"],
  },
} as const;

export const singlePageSchema = {
  name: "storybook_page",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      page: pageSchema,
    },
    required: ["page"],
  },
} as const;
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/openai-schema.ts
git commit -m "Add OpenAI structured-output JSON schemas"
```

---

### Task 4: OpenAI client wrapper

**Files:**
- Create: `app/lib/openai.ts`

Two functions: `generateStory` and `regeneratePage`. Both throw on failure; route handlers catch.

- [ ] **Step 1: Write the file**

```ts
// app/lib/openai.ts
import OpenAI from "openai";
import { PromptLang, StoryPage } from "./types";
import { storySchema, singlePageSchema } from "./openai-schema";

const MODEL = "gpt-4o-mini";

function client() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 未設定");
  }
  return new OpenAI({ apiKey });
}

function langLabel(lang: PromptLang): string {
  return lang === "zh" ? "繁體中文" : "English";
}

const SYSTEM_BASE = (lang: PromptLang) => `你是兒童繪本創作助手。根據使用者的大綱，產出**正好 5 頁**的故事。每頁要有：
- pageNumber（1–5）
- text：繁體中文，2–4 句，口語、適合朗讀給孩子聽
- imagePrompt：用於 AI 圖片生成的描述，語言為 ${langLabel(lang)}，描述場景視覺（角色、動作、環境、氛圍、畫風），不要含對白

整體風格：溫暖、富想像力，5 頁構成完整的「起承轉合 + 收尾」。`;

export async function generateStory(
  outline: string,
  lang: PromptLang,
): Promise<StoryPage[]> {
  const openai = client();
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_BASE(lang) },
      { role: "user", content: outline },
    ],
    response_format: { type: "json_schema", json_schema: storySchema },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI 回傳空內容");
  const parsed = JSON.parse(raw) as { pages: StoryPage[] };
  return parsed.pages;
}

export interface RegenerateArgs {
  outline: string;
  lang: PromptLang;
  pageNumber: number;
  otherPages: StoryPage[];
  userHint?: string;
}

export async function regeneratePage(args: RegenerateArgs): Promise<StoryPage> {
  const { outline, lang, pageNumber, otherPages, userHint } = args;
  const openai = client();

  const system = `${SYSTEM_BASE(lang)}

現在的任務是**只重新生成第 ${pageNumber} 頁**。要與其他 4 頁（已附上）保持劇情連貫，不要重複它們的內容。${
    userHint ? "若使用者額外提供修改提示，**優先遵循該提示**。" : ""
  }
回傳 JSON 形如 { "page": { ... } }，page.pageNumber 必須等於 ${pageNumber}。`;

  const userMessage = JSON.stringify({
    outline,
    targetPageNumber: pageNumber,
    otherPages,
    userHint: userHint ?? null,
  });

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_schema", json_schema: singlePageSchema },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI 回傳空內容");
  const parsed = JSON.parse(raw) as { page: StoryPage };
  if (parsed.page.pageNumber !== pageNumber) {
    parsed.page.pageNumber = pageNumber;
  }
  return parsed.page;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/openai.ts
git commit -m "Add OpenAI generateStory and regeneratePage helpers"
```

---

### Task 5: `POST /api/generate` route handler

**Files:**
- Create: `app/api/generate/route.ts`

- [ ] **Step 1: Write the handler**

```ts
// app/api/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateStory } from "@/app/lib/openai";
import { MAX_OUTLINE_LENGTH, PromptLang } from "@/app/lib/types";

export async function POST(req: NextRequest) {
  let body: { outline?: string; promptLang?: PromptLang };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const outline = body.outline?.trim();
  const promptLang = body.promptLang;

  if (!outline) {
    return NextResponse.json({ error: "請輸入大綱" }, { status: 400 });
  }
  if (outline.length > MAX_OUTLINE_LENGTH) {
    return NextResponse.json(
      { error: `大綱長度不可超過 ${MAX_OUTLINE_LENGTH} 字` },
      { status: 400 },
    );
  }
  if (promptLang !== "zh" && promptLang !== "en") {
    return NextResponse.json({ error: "promptLang 不正確" }, { status: 400 });
  }

  try {
    const pages = await generateStory(outline, promptLang);
    return NextResponse.json({ pages });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知錯誤";
    console.error("[/api/generate]", message);
    return NextResponse.json(
      { error: `AI 服務暫時無法使用：${message}` },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify `tsconfig.json` `@/*` path alias works**

Read `tsconfig.json`. If `paths` is configured (default in `create-next-app` is `"@/*": ["./*"]`), use `@/app/lib/...`. If not, use relative imports `../../lib/...` instead. Adjust the imports if needed before continuing.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/generate/route.ts
git commit -m "Add /api/generate route handler"
```

---

### Task 6: `POST /api/regenerate` route handler

**Files:**
- Create: `app/api/regenerate/route.ts`

- [ ] **Step 1: Write the handler**

```ts
// app/api/regenerate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { regeneratePage } from "@/app/lib/openai";
import {
  MAX_OUTLINE_LENGTH,
  PAGE_COUNT,
  PromptLang,
  StoryPage,
} from "@/app/lib/types";

interface Body {
  outline?: string;
  promptLang?: PromptLang;
  pageNumber?: number;
  otherPages?: StoryPage[];
  userHint?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const outline = body.outline?.trim();
  const { promptLang, pageNumber, otherPages, userHint } = body;

  if (!outline) {
    return NextResponse.json({ error: "缺少 outline" }, { status: 400 });
  }
  if (outline.length > MAX_OUTLINE_LENGTH) {
    return NextResponse.json(
      { error: `大綱長度不可超過 ${MAX_OUTLINE_LENGTH} 字` },
      { status: 400 },
    );
  }
  if (promptLang !== "zh" && promptLang !== "en") {
    return NextResponse.json({ error: "promptLang 不正確" }, { status: 400 });
  }
  if (
    typeof pageNumber !== "number" ||
    pageNumber < 1 ||
    pageNumber > PAGE_COUNT
  ) {
    return NextResponse.json({ error: "pageNumber 不正確" }, { status: 400 });
  }
  if (
    !Array.isArray(otherPages) ||
    otherPages.length !== PAGE_COUNT - 1
  ) {
    return NextResponse.json(
      { error: `otherPages 必須有 ${PAGE_COUNT - 1} 筆` },
      { status: 400 },
    );
  }

  try {
    const page = await regeneratePage({
      outline,
      lang: promptLang,
      pageNumber,
      otherPages,
      userHint: userHint?.trim() || undefined,
    });
    return NextResponse.json({ page });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知錯誤";
    console.error("[/api/regenerate]", message);
    return NextResponse.json(
      { error: `AI 服務暫時無法使用：${message}` },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/regenerate/route.ts
git commit -m "Add /api/regenerate route handler"
```

---

### Task 7: localStorage helpers

**Files:**
- Create: `app/lib/storage.ts`

SSR-safe (Next.js renders client components on server too — check `typeof window`).

- [ ] **Step 1: Write the file**

```ts
// app/lib/storage.ts
import { Storybook } from "./types";

const KEY = "ai-storybook:draft";

export function loadDraft(): Storybook | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Storybook;
  } catch {
    return null;
  }
}

export function saveDraft(book: Storybook): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    // Quota or serialization errors — ignore for a demo.
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/storage.ts
git commit -m "Add localStorage draft helpers"
```

---

### Task 8: `OutlineForm` component

**Files:**
- Create: `app/components/OutlineForm.tsx`

Pure presentational + state component. Parent decides what to do on submit.

- [ ] **Step 1: Write the component**

```tsx
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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/OutlineForm.tsx
git commit -m "Add OutlineForm component"
```

---

### Task 9: Outline page (`/`)

**Files:**
- Modify: `app/page.tsx` (full rewrite)
- Modify: `app/layout.tsx` (metadata + body classes)

- [ ] **Step 1: Update `app/layout.tsx` metadata and clean up body classes**

Read the current `app/layout.tsx`. Replace it with:

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Storybook",
  description: "用一段話生成 5 頁繪本故事",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-50">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Rewrite `app/page.tsx`**

```tsx
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
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/page.tsx
git commit -m "Build outline input page"
```

---

### Task 10: `RegenerateDialog` component

**Files:**
- Create: `app/components/RegenerateDialog.tsx`

Simple modal-ish dialog using the native `<dialog>` element to keep things lightweight (no extra dep).

- [ ] **Step 1: Write the component**

```tsx
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
        className="flex flex-col gap-4 p-6 bg-white dark:bg-zinc-900"
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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/RegenerateDialog.tsx
git commit -m "Add RegenerateDialog component"
```

---

### Task 11: `StoryPageCard` component

**Files:**
- Create: `app/components/StoryPageCard.tsx`

Editable card with text + image-prompt textareas, copy-prompt button, regenerate button. Per-card loading state controlled by parent.

- [ ] **Step 1: Write the component**

```tsx
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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/StoryPageCard.tsx
git commit -m "Add StoryPageCard component"
```

---

### Task 12: Story editor page (`/story`)

**Files:**
- Create: `app/story/page.tsx`

Loads draft from localStorage, redirects to `/` if missing. Manages per-page edits, regenerate dialog state, per-card loading flag, and a "Restart" button.

- [ ] **Step 1: Write the page**

```tsx
// app/story/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StoryPageCard } from "@/app/components/StoryPageCard";
import { RegenerateDialog } from "@/app/components/RegenerateDialog";
import {
  clearDraft,
  loadDraft,
  saveDraft,
} from "@/app/lib/storage";
import { Storybook, StoryPage } from "@/app/lib/types";

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
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outline: book.outline,
          promptLang: book.promptLang,
          pageNumber: target,
          otherPages,
          userHint: hint,
        }),
      });
      const data: { page?: StoryPage; error?: string } = await res.json();
      if (!res.ok || !data.page) {
        throw new Error(data.error ?? "重新生成失敗");
      }
      updatePage(data.page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "重新生成失敗");
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
    <main className="flex flex-1 flex-col items-center px-6 py-12">
      <div className="w-full max-w-3xl flex flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              你的繪本
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              大綱：{book.outline}
            </p>
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
          <p className="rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 px-4 py-3 text-sm" role="alert">
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
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/story/page.tsx
git commit -m "Build /story editor page with regenerate"
```

---

### Task 13: Build verification + manual acceptance

**Files:** none modified — verification only.

- [ ] **Step 1: Production build**

```bash
npm run build
```
Expected: build succeeds with no type errors. If lint surfaces unused imports etc., fix them before continuing.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```
In another terminal or browser, open `http://localhost:3000`.

- [ ] **Step 3: Walk through every acceptance criterion from the spec**

Run each one and confirm the observed behavior matches:

1. Submit outline "一隻小兔子第一次學會自己綁鞋帶" → 5 cards appear on `/story`.
2. Edit any field on any card → reload the page → edits persist.
3. Click **Regenerate** on page 3, leave hint blank, confirm → page 3 changes; pages 1, 2, 4, 5 unchanged.
4. Click **Regenerate** on page 1 with hint "讓主角變成貓" → new content reflects the hint (主角是貓).
5. Restart, set `promptLang` to **English**, generate → `imagePrompt` fields are in English.
6. Click **重新開始** → confirm → URL goes to `/`, form is empty, reload `/story` → redirects back to `/`.
7. Temporarily rename `OPENAI_API_KEY` in `.env.local` to break it (or use an invalid key) → submit outline → user sees an error message and the typed outline is preserved in the textarea. Restore the key after.

If any criterion fails, fix and re-verify before the final commit.

- [ ] **Step 4: Stop the dev server (Ctrl-C) and commit any fixes**

If fixes were needed:
```bash
git add -A
git commit -m "Fix issues found in acceptance pass"
```

If no fixes were needed, no commit. Plan is done.

---

## Self-Review Notes (author-facing, leave in the doc)

- **Spec coverage:**
  - 5-page generation → Tasks 4, 5, 9
  - Per-page edit → Tasks 11, 12
  - Per-page regenerate with `otherPages` + `userHint` → Tasks 4, 6, 10, 12
  - Image-prompt language toggle → Tasks 8, 9 (lang persisted in `Storybook`)
  - localStorage persistence → Tasks 7, 9, 12
  - Two routes (`/`, `/story`) → Tasks 9, 12
  - Error preservation (don't lose user input on failure) → Tasks 9 (sets error, leaves outline state), 12 (regen failure leaves page unchanged)
  - Restart → Task 12
  - All 7 acceptance criteria → Task 13

- **Type consistency check:** `StoryPage`, `Storybook`, `PromptLang`, `PAGE_COUNT`, `MAX_OUTLINE_LENGTH` defined in Task 2 and used identically in every later task. Function names: `generateStory`, `regeneratePage`, `loadDraft`, `saveDraft`, `clearDraft` — consistent throughout.

- **No placeholders:** every task contains the full code or full command it requires.
