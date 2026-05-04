# AI Storybook — Design Spec

**Date:** 2026-05-04
**Status:** Approved, ready for implementation planning

## Overview

A web app that turns a short user-supplied outline into a 5-page children's storybook. The AI returns structured JSON, the user can edit any page inline, and individual pages can be regenerated with optional guidance. Image generation is **not** integrated — instead, each page surfaces a copy-ready image-generation prompt the user pastes into their preferred image AI.

## Goals

1. Generate a complete 5-page story from a single outline input.
2. Let the user freely edit every field on every page.
3. Let the user regenerate a single page while keeping the rest intact and coherent.
4. Persist the in-progress draft across page reloads on the same browser.

## Non-Goals (YAGNI)

- User accounts / login
- Cloud / database persistence
- Real image-generation API integration
- Multiple draft history (one current draft only)
- Streaming AI output
- Export / sharing
- i18n of the UI itself (UI is Traditional Chinese)
- Automated tests (demo project; manual acceptance)

## Stack

- **Framework:** Next.js 16.2.4 (App Router) + React 19 + TypeScript
- **Styling:** Tailwind CSS v4 (already configured)
- **AI:** OpenAI Chat Completions, `gpt-4o-mini`, Structured Outputs (`response_format: { type: "json_schema", strict: true }`)
- **Persistence:** `localStorage` (key `ai-storybook:draft`)
- **Deployment target:** Vercel

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Next.js 16 App Router (Vercel-ready)                │
├──────────────────────────────────────────────────────┤
│  Frontend (Client)                                   │
│    /          → Outline input page (+ lang toggle)   │
│    /story     → Editor page (5 cards + regenerate)   │
│                                                      │
│  Backend (Route Handlers)                            │
│    POST /api/generate    → produce all 5 pages       │
│    POST /api/regenerate  → produce one page          │
│                                                      │
│  Persistence                                         │
│    localStorage key: "ai-storybook:draft"            │
│                                                      │
│  External                                            │
│    OpenAI Chat Completions (gpt-4o-mini, strict      │
│    JSON schema)                                      │
└──────────────────────────────────────────────────────┘
```

**Page-to-page handoff:** `/` writes the generated draft to `localStorage`, then `router.push('/story')`. `/story` reads from `localStorage` on mount; if empty, redirects back to `/`. This keeps URLs clean and survives reloads.

## Data Model

```ts
// app/lib/types.ts
export type PromptLang = "zh" | "en";

export interface StoryPage {
  pageNumber: number;   // 1..5
  text: string;         // story body, Traditional Chinese
  imagePrompt: string;  // image-gen prompt, language per promptLang
}

export interface Storybook {
  outline: string;      // user's original input
  promptLang: PromptLang;
  pages: StoryPage[];   // length always 5
}
```

## API Contracts

### `POST /api/generate`

**Request**
```ts
{ outline: string; promptLang: "zh" | "en" }
```

**Response 200**
```ts
{ pages: StoryPage[] }   // exactly 5
```

**Errors**
- `400` — missing field, empty outline, or outline > 1000 chars
- `500` — OpenAI failure; body `{ error: string }`

### `POST /api/regenerate`

**Request**
```ts
{
  outline: string;
  promptLang: "zh" | "en";
  pageNumber: number;          // 1..5
  otherPages: StoryPage[];     // the other 4 pages with current edits
  userHint?: string;           // optional steering hint
}
```

**Response 200**
```ts
{ page: StoryPage }
```

**Errors:** same shape as `/api/generate`.

## OpenAI Prompts

### Generate (system)

> 你是兒童繪本創作助手。根據使用者的大綱，產出**正好 5 頁**的故事。每頁要有：
> - `pageNumber`（1–5）
> - `text`：繁體中文，2–4 句，口語、適合朗讀給孩子聽
> - `imagePrompt`：用於 AI 圖片生成的描述，語言為 **{{中文 / English}}**，描述場景視覺（角色、動作、環境、氛圍、畫風），不要含對白
>
> 整體風格：溫暖、富想像力，5 頁構成完整的「起承轉合 + 收尾」。

User message: the outline.

### Regenerate (system)

> 重新生成第 N 頁。要與其他 4 頁（已附上）保持劇情連貫，不要重複它們的內容。若使用者額外提供修改提示，**優先遵循該提示**。

User message: outline, other 4 pages JSON, target pageNumber, optional userHint.

**Why pinned:** the dominant failure mode of regenerate is incoherence with the surrounding pages — the prompt must explicitly demand continuity and forbid duplication.

## File Structure

```
app/
├── layout.tsx                   ★ edit: title → "AI Storybook"
├── page.tsx                     ★ edit: outline input page
├── story/
│   └── page.tsx                 ☆ new: editor page
├── api/
│   ├── generate/route.ts        ☆ new: POST handler
│   └── regenerate/route.ts      ☆ new: POST handler
├── lib/
│   ├── types.ts                 ☆ new: shared types
│   ├── openai.ts                ☆ new: client + generateStory / regeneratePage
│   ├── openai-schema.ts         ☆ new: JSON schema definitions
│   └── storage.ts               ☆ new: SSR-safe localStorage helpers
├── components/
│   ├── OutlineForm.tsx          ☆ new: outline + lang toggle + submit
│   ├── StoryPageCard.tsx        ☆ new: editable card + regenerate button
│   └── RegenerateDialog.tsx     ☆ new: hint dialog
└── globals.css                  unchanged

.env.local                       ☆ new: OPENAI_API_KEY=...
.env.example                     ☆ new: template
```

## Module Responsibilities

| Module | Inputs | Output | Depends on |
|---|---|---|---|
| `lib/openai.ts :: generateStory(outline, lang)` | outline, lang | `StoryPage[]` | OpenAI SDK |
| `lib/openai.ts :: regeneratePage(args)` | outline, lang, pageNumber, otherPages, userHint? | `StoryPage` | OpenAI SDK |
| `lib/storage.ts :: loadDraft()` / `saveDraft(b)` / `clearDraft()` | — | `Storybook \| null` / void | `window.localStorage` (guarded for SSR) |
| `OutlineForm` | — | calls parent `onSubmit` | parent does the `fetch` |
| `StoryPageCard` | `page`, `onChange`, `onRegenerate` | UI | — |
| `RegenerateDialog` | `open`, `onConfirm(hint?)` | UI | — |

## Key Interactions

### Outline page `/`
1. User types outline, picks `promptLang`.
2. Click **Generate** → loading state.
3. `fetch('/api/generate', { outline, promptLang })`.
4. On success: `saveDraft({ outline, promptLang, pages })` → `router.push('/story')`.
5. On error: surface message inline; **do not** clear the outline field.

### Editor page `/story`
1. On mount: `loadDraft()`. If null → redirect to `/`.
2. Each `<StoryPageCard>`:
   - `text` and `imagePrompt` are `<textarea>`s; `onChange` updates state and calls `saveDraft` synchronously (localStorage writes are cheap, no debounce needed).
   - **Regenerate** button → opens `RegenerateDialog` → confirm → `fetch('/api/regenerate', { … otherPages, userHint? })` → on success replace that page only and `saveDraft`; on failure leave the existing page intact.
   - **Copy image prompt** button (small UX win, in scope because the core feature is "easy to paste into image AI").
3. **Restart** button → `clearDraft()` → `router.push('/')`.

### Loading states
- Full generate: 5–15 s. Show a loading state on `/` (button disabled + spinner + skeleton hint).
- Single regenerate: 1–3 s. Inline loading on that one card; other cards remain editable.

## Error Handling

| Source | Behavior |
|---|---|
| OpenAI network / timeout | route handler returns 500 with `{ error: "AI 服務暫時無法使用，請稍後再試" }` |
| Strict-schema deviation (rare) | same as above |
| `outline` empty or > 1000 chars | 400; frontend also blocks submit |
| `OPENAI_API_KEY` missing | route handler returns 500 with explicit message on first call |
| Frontend fetch fails | inline error / toast; **never** discard outline or edited page content |
| Regenerate fails | leave the existing page text and prompt unchanged |

## Environment

- `OPENAI_API_KEY` in `.env.local` (gitignored). Provide `.env.example` template.
- Vercel deployment: set the env var in the project dashboard.

## Acceptance Criteria

1. Submit an outline → 5 cards appear on `/story`.
2. Edit any field → reload → edits persist.
3. Regenerate a page (no hint) → only that page changes; others untouched.
4. Regenerate with hint "讓主角變成貓" → new content reflects the hint.
5. Set `promptLang` to English then generate → `imagePrompt` is in English.
6. **Restart** → localStorage cleared, `/` shows empty form.
7. With OPENAI_API_KEY missing or OpenAI failing → user sees a clear error and the input/edit state is preserved.
