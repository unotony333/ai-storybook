# AI Provider Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ⚙️ settings UI that lets users point the app at any OpenAI-compatible provider (with 7 quick presets including local Ollama / LM Studio), with three structured-output modes and routing logic that sends local providers direct from the browser and cloud providers through the existing backend.

**Architecture:** Refactor the existing `generateStory` / `regeneratePage` to take a `ProviderSettings` arg and delegate to a shared `callAI` helper that switches behavior by `structuredOutput` mode. Backend route handlers gain an optional `provider` body field; missing → server falls back to `DEFAULT_PROVIDER` (existing env). Frontend pages read `localStorage`; if `isLocal === true` they import `generateStory` and call directly from the browser using the OpenAI SDK with `dangerouslyAllowBrowser: true`.

**Tech Stack:** Next.js 16.2.4, React 19, TypeScript, Tailwind v4, OpenAI SDK 4.x (isomorphic).

**Spec:** [`docs/superpowers/specs/2026-05-04-ai-provider-settings-design.md`](../specs/2026-05-04-ai-provider-settings-design.md)

**Test policy:** No automated tests (consistent with the original AI Storybook plan). Manual verification against the spec's acceptance criteria in Task 12.

---

## File Structure

```
app/
├── lib/
│   ├── provider.ts              [create] type, PRESETS, isomorphic helpers
│   ├── provider-server.ts       [create] DEFAULT_PROVIDER (reads env, server-only)
│   ├── provider-storage.ts      [create] localStorage helpers (browser-only)
│   ├── ai-call.ts               [create] callAI + extractJSON + 3 modes
│   ├── openai.ts                [modify] generateStory/regeneratePage now take provider, delegate to callAI
│   └── openai-schema.ts         [unchanged]
├── api/
│   ├── generate/route.ts        [modify] accept provider in body
│   └── regenerate/route.ts      [modify] accept provider in body
├── components/
│   ├── SettingsButton.tsx       [create] floating top-right button + dialog mount
│   └── SettingsDialog.tsx       [create] form + presets + save/clear
├── page.tsx                     [modify] mount SettingsButton, isLocal branch
└── story/page.tsx               [modify] mount SettingsButton, isLocal branch
```

---

### Task 1: Provider type, presets, and isomorphic helpers

**Files:**
- Create: `app/lib/provider.ts`

- [ ] **Step 1: Write `app/lib/provider.ts`**

```ts
// app/lib/provider.ts
export type StructuredOutputMode = "json_schema" | "json_object" | "none";

export interface ProviderSettings {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  isLocal: boolean;
  structuredOutput: StructuredOutputMode;
  headers?: Record<string, string>;
}

export interface ProviderPreset {
  id: string;
  name: string;
  baseURL: string;
  defaultModel: string;
  isLocal: boolean;
  structuredOutput: StructuredOutputMode;
}

export const PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    isLocal: false,
    structuredOutput: "json_schema",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseURL: "https://api.anthropic.com/v1",
    defaultModel: "claude-haiku-4-5-20251001",
    isLocal: false,
    structuredOutput: "json_object",
  },
  {
    id: "google",
    name: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    isLocal: false,
    structuredOutput: "json_object",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    isLocal: false,
    structuredOutput: "json_object",
  },
  {
    id: "xai",
    name: "xAI Grok",
    baseURL: "https://api.x.ai/v1",
    defaultModel: "grok-2-latest",
    isLocal: false,
    structuredOutput: "json_object",
  },
  {
    id: "ollama",
    name: "Ollama (本地)",
    baseURL: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    isLocal: true,
    structuredOutput: "json_object",
  },
  {
    id: "lmstudio",
    name: "LM Studio (本地)",
    baseURL: "http://localhost:1234/v1",
    defaultModel: "local-model",
    isLocal: true,
    structuredOutput: "json_schema",
  },
];

export function presetToSettings(preset: ProviderPreset): ProviderSettings {
  return {
    id: preset.id,
    name: preset.name,
    baseURL: preset.baseURL,
    apiKey: "",
    model: preset.defaultModel,
    isLocal: preset.isLocal,
    structuredOutput: preset.structuredOutput,
  };
}

export function emptyCustomSettings(): ProviderSettings {
  return {
    id: "custom",
    name: "自訂",
    baseURL: "",
    apiKey: "",
    model: "",
    isLocal: false,
    structuredOutput: "json_object",
  };
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/tony/ai-storybook && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/provider.ts
git commit -m "Add ProviderSettings type and presets"
```

---

### Task 2: Server-only `DEFAULT_PROVIDER`

**Files:**
- Create: `app/lib/provider-server.ts`

This file reads `process.env` and must NEVER be imported by client components. Route handlers only.

- [ ] **Step 1: Write `app/lib/provider-server.ts`**

```ts
// app/lib/provider-server.ts
import "server-only";
import { ProviderSettings } from "./provider";

export function getDefaultProvider(): ProviderSettings | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    id: "openai",
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    apiKey,
    model: "gpt-4o-mini",
    isLocal: false,
    structuredOutput: "json_schema",
  };
}
```

> The `server-only` import is provided by Next.js. If a client component ever transitively imports this file, the build fails with a clear error.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/provider-server.ts
git commit -m "Add server-only DEFAULT_PROVIDER helper"
```

---

### Task 3: localStorage helpers for provider settings

**Files:**
- Create: `app/lib/provider-storage.ts`

- [ ] **Step 1: Write `app/lib/provider-storage.ts`**

```ts
// app/lib/provider-storage.ts
import { ProviderSettings } from "./provider";

const KEY = "ai-storybook:provider";

export function loadProvider(): ProviderSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ProviderSettings;
  } catch {
    return null;
  }
}

export function saveProvider(p: ProviderSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

export function clearProvider(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/provider-storage.ts
git commit -m "Add provider settings localStorage helpers"
```

---

### Task 4: Shared `callAI` helper with 3 modes

**Files:**
- Create: `app/lib/ai-call.ts`

Isomorphic — works in server and browser.

- [ ] **Step 1: Write `app/lib/ai-call.ts`**

```ts
// app/lib/ai-call.ts
import OpenAI from "openai";
import { ProviderSettings } from "./provider";

export interface CallAIOptions {
  provider: ProviderSettings;
  systemPrompt: string;
  userMessage: string;
  schemaName: string;
  schema: object;
  schemaDescription: string;
}

export async function callAI<T>(opts: CallAIOptions): Promise<T> {
  const { provider, systemPrompt, userMessage, schemaName, schema, schemaDescription } = opts;

  const client = new OpenAI({
    baseURL: provider.baseURL,
    apiKey: provider.apiKey || "no-key",
    defaultHeaders: provider.headers,
    dangerouslyAllowBrowser: true,
  });

  const finalSystem = buildSystemPrompt(systemPrompt, provider.structuredOutput, schemaDescription);
  const responseFormat = buildResponseFormat(provider.structuredOutput, schemaName, schema);

  const completion = await client.chat.completions.create({
    model: provider.model,
    messages: [
      { role: "system", content: finalSystem },
      { role: "user", content: userMessage },
    ],
    ...(responseFormat ? { response_format: responseFormat } : {}),
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("AI 回傳空內容");
  const cleaned = extractJSON(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error("AI 回傳格式錯誤，請換個模型或結構化模式");
  }
}

function buildSystemPrompt(
  base: string,
  mode: ProviderSettings["structuredOutput"],
  schemaDescription: string,
): string {
  if (mode === "json_schema") return base;
  if (mode === "json_object") {
    return `${base}

輸出格式（請嚴格遵守）：${schemaDescription}`;
  }
  // none
  return `${base}

輸出格式（請嚴格遵守）：${schemaDescription}

只回傳 JSON 本身，不要使用 markdown 程式碼區塊（例如 \`\`\`json），不要加任何額外說明。`;
}

function buildResponseFormat(
  mode: ProviderSettings["structuredOutput"],
  schemaName: string,
  schema: object,
):
  | { type: "json_schema"; json_schema: { name: string; strict: true; schema: object } }
  | { type: "json_object" }
  | undefined {
  if (mode === "json_schema") {
    return {
      type: "json_schema",
      json_schema: { name: schemaName, strict: true, schema },
    };
  }
  if (mode === "json_object") {
    return { type: "json_object" };
  }
  return undefined;
}

export function extractJSON(raw: string): string {
  let s = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences if present
  const fenceMatch = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    s = fenceMatch[1].trim();
  }
  // If still has leading/trailing prose, find outermost {...}
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return s.slice(first, last + 1);
  }
  return s;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: zero errors. If the OpenAI SDK rejects the literal-typed `responseFormat`, do not use `as any` — escalate (BLOCKED) with the error.

- [ ] **Step 3: Commit**

```bash
git add app/lib/ai-call.ts
git commit -m "Add callAI helper with 3 structured-output modes"
```

---

### Task 5: Refactor `lib/openai.ts` to take ProviderSettings

**Files:**
- Modify: `app/lib/openai.ts` (full replacement)

- [ ] **Step 1: Replace contents of `app/lib/openai.ts` with EXACTLY**

```ts
// app/lib/openai.ts
import { ProviderSettings } from "./provider";
import { PromptLang, StoryPage } from "./types";
import { callAI } from "./ai-call";
import { storySchema, singlePageSchema } from "./openai-schema";

function langLabel(lang: PromptLang): string {
  return lang === "zh" ? "繁體中文" : "English";
}

const SYSTEM_BASE = (lang: PromptLang) => `你是兒童繪本創作助手。根據使用者的大綱，產出**正好 5 頁**的故事。每頁要有：
- pageNumber（1–5）
- text：繁體中文，2–4 句，口語、適合朗讀給孩子聽
- imagePrompt：用於 AI 圖片生成的描述，語言為 ${langLabel(lang)}，描述場景視覺（角色、動作、環境、氛圍、畫風），不要含對白

整體風格：溫暖、富想像力，5 頁構成完整的「起承轉合 + 收尾」。`;

const STORY_SCHEMA_DESC =
  '回傳 JSON：{ "pages": [{ "pageNumber": 1..5, "text": "...", "imagePrompt": "..." }, ...] }，pages 必須正好 5 個元素，pageNumber 依序 1 到 5。';

const PAGE_SCHEMA_DESC =
  '回傳 JSON：{ "page": { "pageNumber": <該頁頁碼>, "text": "...", "imagePrompt": "..." } }';

export async function generateStory(
  provider: ProviderSettings,
  outline: string,
  lang: PromptLang,
): Promise<StoryPage[]> {
  const result = await callAI<{ pages: StoryPage[] }>({
    provider,
    systemPrompt: SYSTEM_BASE(lang),
    userMessage: outline,
    schemaName: storySchema.name,
    schema: storySchema.schema,
    schemaDescription: STORY_SCHEMA_DESC,
  });
  return result.pages;
}

export interface RegenerateArgs {
  provider: ProviderSettings;
  outline: string;
  lang: PromptLang;
  pageNumber: number;
  otherPages: StoryPage[];
  userHint?: string;
}

export async function regeneratePage(args: RegenerateArgs): Promise<StoryPage> {
  const { provider, outline, lang, pageNumber, otherPages, userHint } = args;

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

  const result = await callAI<{ page: StoryPage }>({
    provider,
    systemPrompt: system,
    userMessage,
    schemaName: singlePageSchema.name,
    schema: singlePageSchema.schema,
    schemaDescription: PAGE_SCHEMA_DESC,
  });

  if (result.page.pageNumber !== pageNumber) {
    result.page.pageNumber = pageNumber;
  }
  return result.page;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: TypeScript will now report the route handlers fail to compile (they call the old signatures). That's expected — the next two tasks fix them. Do NOT commit yet if other files broke.

Actually, do this stricter check: run `npx tsc --noEmit` and confirm the errors come ONLY from `app/api/generate/route.ts` and `app/api/regenerate/route.ts` and are about argument count / shape. If any other file errors, STOP and report.

- [ ] **Step 3: Commit (with broken consumers)**

```bash
git add app/lib/openai.ts
git commit -m "Refactor generateStory and regeneratePage to accept ProviderSettings"
```

> The route handlers will be broken at this commit. Tasks 6 and 7 immediately fix them; do not run the dev server or build until Task 7 is committed.

---

### Task 6: `/api/generate` accepts optional `provider`

**Files:**
- Modify: `app/api/generate/route.ts` (full replacement)

- [ ] **Step 1: Replace contents of `app/api/generate/route.ts` with EXACTLY**

```ts
// app/api/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateStory } from "@/app/lib/openai";
import { MAX_OUTLINE_LENGTH, type PromptLang } from "@/app/lib/types";
import { type ProviderSettings } from "@/app/lib/provider";
import { getDefaultProvider } from "@/app/lib/provider-server";

interface Body {
  outline?: string;
  promptLang?: PromptLang;
  provider?: ProviderSettings;
}

export async function POST(req: NextRequest) {
  let body: Body;
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

  if (body.provider?.isLocal) {
    return NextResponse.json(
      { error: "本地模型請從前端直連" },
      { status: 400 },
    );
  }

  const provider = body.provider ?? getDefaultProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "請點右上角設定 AI 供應商" },
      { status: 503 },
    );
  }

  try {
    const pages = await generateStory(provider, outline, promptLang);
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

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: error count drops to only those in `app/api/regenerate/route.ts`. No new errors elsewhere.

- [ ] **Step 3: Commit**

```bash
git add app/api/generate/route.ts
git commit -m "Wire /api/generate to optional ProviderSettings"
```

---

### Task 7: `/api/regenerate` accepts optional `provider`

**Files:**
- Modify: `app/api/regenerate/route.ts` (full replacement)

- [ ] **Step 1: Replace contents of `app/api/regenerate/route.ts` with EXACTLY**

```ts
// app/api/regenerate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { regeneratePage } from "@/app/lib/openai";
import {
  MAX_OUTLINE_LENGTH,
  PAGE_COUNT,
  type PromptLang,
  type StoryPage,
} from "@/app/lib/types";
import { type ProviderSettings } from "@/app/lib/provider";
import { getDefaultProvider } from "@/app/lib/provider-server";

interface Body {
  outline?: string;
  promptLang?: PromptLang;
  pageNumber?: number;
  otherPages?: StoryPage[];
  userHint?: string;
  provider?: ProviderSettings;
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

  if (body.provider?.isLocal) {
    return NextResponse.json(
      { error: "本地模型請從前端直連" },
      { status: 400 },
    );
  }

  const provider = body.provider ?? getDefaultProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "請點右上角設定 AI 供應商" },
      { status: 503 },
    );
  }

  try {
    const page = await regeneratePage({
      provider,
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

- [ ] **Step 2: Type-check (must be clean now)**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/regenerate/route.ts
git commit -m "Wire /api/regenerate to optional ProviderSettings"
```

---

### Task 8: `SettingsDialog` component

**Files:**
- Create: `app/components/SettingsDialog.tsx`

- [ ] **Step 1: Write `app/components/SettingsDialog.tsx`**

```tsx
// app/components/SettingsDialog.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  PRESETS,
  ProviderSettings,
  StructuredOutputMode,
  emptyCustomSettings,
  presetToSettings,
} from "@/app/lib/provider";

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

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setS(initial ?? emptyCustomSettings());
      setHeadersText(initial?.headers ? JSON.stringify(initial.headers, null, 2) : "");
      setHeadersError(null);
      setShowKey(false);
      setAdvancedOpen(false);
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open, initial]);

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
        return;
      }
    }
    setHeadersError(null);
    onSave({ ...s, headers });
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="rounded-xl p-0 backdrop:bg-black/40 max-w-xl w-[95vw]"
    >
      <form
        onSubmit={handleSave}
        className="flex flex-col gap-4 p-6 bg-white dark:bg-zinc-900 max-h-[85vh] overflow-y-auto"
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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/SettingsDialog.tsx
git commit -m "Add SettingsDialog component"
```

---

### Task 9: `SettingsButton` component

**Files:**
- Create: `app/components/SettingsButton.tsx`

This is the floating top-right button. It owns the dialog open state and persistence. Pages just mount `<SettingsButton onChange={...} />` once.

- [ ] **Step 1: Write `app/components/SettingsButton.tsx`**

```tsx
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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/SettingsButton.tsx
git commit -m "Add SettingsButton component"
```

---

### Task 10: Wire outline page (`/`) to provider settings

**Files:**
- Modify: `app/page.tsx` (full replacement)

- [ ] **Step 1: Replace contents of `app/page.tsx` with EXACTLY**

```tsx
// app/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OutlineForm } from "./components/OutlineForm";
import { SettingsButton } from "./components/SettingsButton";
import { generateStory } from "./lib/openai";
import { loadProvider } from "./lib/provider-storage";
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
          <OutlineForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            errorMessage={error}
          />
        </div>
      </main>
    </>
  );
}

function formatError(e: unknown, isLocal: boolean): string {
  const msg = e instanceof Error ? e.message : "生成失敗";
  if (isLocal && /fetch|network|cors/i.test(msg)) {
    return `無法連線到本地模型：${msg}。請確認服務已啟動且允許跨網域。`;
  }
  return msg;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "Mount SettingsButton and route via provider on outline page"
```

---

### Task 11: Wire story editor (`/story`) to provider settings

**Files:**
- Modify: `app/story/page.tsx` (full replacement)

- [ ] **Step 1: Replace contents of `app/story/page.tsx` with EXACTLY**

```tsx
// app/story/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StoryPageCard } from "@/app/components/StoryPageCard";
import { RegenerateDialog } from "@/app/components/RegenerateDialog";
import { SettingsButton } from "@/app/components/SettingsButton";
import { regeneratePage } from "@/app/lib/openai";
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
  const msg = e instanceof Error ? e.message : "重新生成失敗";
  if (isLocal && /fetch|network|cors/i.test(msg)) {
    return `無法連線到本地模型：${msg}。請確認服務已啟動且允許跨網域。`;
  }
  return msg;
}
```

> Note the editor page reading `provider` once at the top of `handleRegenerate` (not separately for the `loadProvider()?.isLocal ?? false` formatError call) avoids two reads of localStorage during a single submit.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/story/page.tsx
git commit -m "Mount SettingsButton and route via provider on story page"
```

---

### Task 12: Build verification + manual acceptance

**Files:** none modified — verification only.

- [ ] **Step 1: Production build**

```bash
npm run build
```
Expected: build succeeds, no type errors. Routes listed should be: `/`, `/_not-found`, `/api/generate`, `/api/regenerate`, `/story`.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```
Open `http://localhost:3000`.

- [ ] **Step 3: Walk through every acceptance criterion**

Run each one and confirm the observed behavior matches:

1. **No provider configured (regression check):** Click ⚙️ — label says "預設". Submit "一隻小兔子第一次學會自己綁鞋帶" → 5 pages appear on `/story`. (Uses backend env `OPENAI_API_KEY`.)
2. **OpenAI preset + own key (backend route):** Open ⚙️, click "OpenAI" preset, paste a real OPENAI key, save. Submit an outline. In DevTools → Network, the request goes to `/api/generate` (not `api.openai.com`). 5 pages appear. The ⚙️ label now reads "OpenAI".
3. **Ollama preset (frontend-direct):** Have Ollama running locally with `OLLAMA_ORIGINS=*` (or localhost:3000). Open ⚙️, click "Ollama (本地)" preset, save. Submit an outline. In DevTools → Network, the request goes directly to `http://localhost:11434/v1/chat/completions`. 5 pages appear (or a clear error if Ollama isn't reachable).
4. **DeepSeek preset (json_object mode):** Open ⚙️, click "DeepSeek" preset, paste a DeepSeek key, save. Submit an outline. Result: 5 well-formed pages.
5. **Restore default:** Open ⚙️, click "還原預設", confirm dialog closes. ⚙️ label says "預設" again. Submit an outline → behavior matches criterion 1.
6. **Wrong API key:** Open ⚙️, choose any cloud preset, paste a deliberately wrong key, save. Submit an outline. Expect: red error message visible, the textarea content (the outline) is preserved.
7. **Persistence:** With a provider configured, reload the page (`F5`). ⚙️ button still shows the configured provider name; settings still in localStorage.

If any criterion fails, fix and re-verify before final commit.

- [ ] **Step 4: Stop the dev server (Ctrl-C) and commit any fixes**

If fixes were needed:
```bash
git add -A
git commit -m "Fix issues found in provider-settings acceptance pass"
```

If no fixes were needed, no commit. Plan is done.

---

## Self-Review Notes

- **Spec coverage:**
  - ⚙️ button on both pages → Tasks 9, 10, 11
  - 7 presets + custom → Task 1 (PRESETS), Task 8 (UI chips)
  - Per-mode structured output (`json_schema` / `json_object` / `none`) → Task 4
  - Custom headers → Task 1 (type), Task 8 (UI), Task 4 (forwarding)
  - localStorage persistence → Task 3, Tasks 9–11
  - Cloud routes via backend, local routes from browser → Tasks 6, 7, 10, 11
  - Server fallback to env when no provider → Tasks 2, 6, 7
  - 503 when neither provider nor env → Tasks 6, 7
  - Local mode warning in UI → Task 8
  - Error messages preserved on failure (input not lost) → Tasks 10, 11 (error state set, no state cleared)
  - All 7 acceptance criteria → Task 12

- **Type / signature consistency:** `ProviderSettings`, `StructuredOutputMode`, `PRESETS`, `presetToSettings`, `emptyCustomSettings` defined in Task 1 and used identically through Tasks 4–11. Function signatures: `generateStory(provider, outline, lang)` and `regeneratePage({ provider, ... })` match across Tasks 5, 6, 7, 10, 11. `loadProvider`, `saveProvider`, `clearProvider` defined Task 3 and used Task 9. `getDefaultProvider()` Task 2, used Tasks 6, 7.

- **No placeholders:** every step has the full file contents or exact command.
