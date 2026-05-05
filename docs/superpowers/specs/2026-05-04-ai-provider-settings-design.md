# AI Provider Settings — Design Spec

**Date:** 2026-05-04
**Status:** Approved, ready for implementation planning
**Builds on:** [`2026-05-04-ai-storybook-design.md`](./2026-05-04-ai-storybook-design.md)

## Overview

Add a ⚙️ settings button (top-right, on both `/` and `/story`) that lets the user configure which AI provider AI Storybook uses: custom base URL, API key, model, and structured-output mode. Includes 7 quick presets covering common cloud providers and two local-model runners. Settings persist in `localStorage`. When unset, the app falls back to the existing backend environment variable (`OPENAI_API_KEY`) — no regression.

## Goals

1. Let the user point the app at any OpenAI-compatible API.
2. One-click presets for common providers including local options.
3. Support local models (Ollama, LM Studio) by calling them directly from the browser.
4. Preserve current behavior when no settings are configured.

## Non-Goals (YAGNI)

- Import/export of provider settings
- Multiple saved provider profiles (only one active at a time)
- Encryption of the API key in localStorage
- Connection-test button
- Per-provider feature detection

## Architecture Change

```
                                                ┌── (no settings) ──→ backend env (OPENAI_API_KEY)
                                                │
  ⚙️ Settings (modal, top-right)                 │
  ↓ writes localStorage["ai-storybook:provider"] │
  ↓                                              │
  generate / regenerate read settings on submit  │
  ↓                                              │
  isLocal? ── yes ──→ frontend fetches provider.baseURL directly
            └─ no ──→ frontend POSTs to /api/* with provider in body
                       server builds OpenAI client from that provider
```

**Three call paths, one shared `callAI(opts)` function** in `app/lib/ai-call.ts`. The same function is imported on both server (Route Handlers) and client (browser, with `dangerouslyAllowBrowser: true`) — wraps the `openai` npm SDK and handles all three structured-output modes.

**Security note:** in local-direct mode, the API key is read from `localStorage` and sent from the browser, so it appears in the browser's Network panel. This is acceptable for local providers (where keys are usually empty or fake) but is surfaced as a warning in the UI for any provider where `isLocal === true`. Cloud providers always route through the backend, so their keys only travel browser → same-origin server.

## Data Model

```ts
// app/lib/provider.ts
export type StructuredOutputMode = "json_schema" | "json_object" | "none";

export interface ProviderSettings {
  id: string;                       // preset id or "custom"
  name: string;                     // display name
  baseURL: string;                  // e.g. "https://api.openai.com/v1"
  apiKey: string;                   // user-supplied; may be empty for local
  model: string;
  isLocal: boolean;                 // true → frontend-direct
  structuredOutput: StructuredOutputMode;
  headers?: Record<string, string>; // optional custom headers
}
```

## Presets

| id | name | baseURL | model | isLocal | structuredOutput |
|---|---|---|---|---|---|
| `openai` | OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | false | `json_schema` |
| `anthropic` | Anthropic | `https://api.anthropic.com/v1` | `claude-haiku-4-5-20251001` | false | `json_object` |
| `google` | Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` | false | `json_object` |
| `deepseek` | DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | false | `json_object` |
| `xai` | xAI Grok | `https://api.x.ai/v1` | `grok-2-latest` | false | `json_object` |
| `ollama` | Ollama (本地) | `http://localhost:11434/v1` | `llama3.2` | true | `json_object` |
| `lmstudio` | LM Studio (本地) | `http://localhost:1234/v1` | `local-model` | true | `json_schema` |

A `custom` (no preset) option is also exposed in the UI.

## Persistence

- `localStorage` key: `ai-storybook:provider`
- Value: `ProviderSettings | null` (null/missing → backend default)
- API key stored as plain text. Single-user demo; localStorage is origin-isolated.

## Structured-Output Modes

`callAI` switches behavior by `provider.structuredOutput`:

| Mode | system prompt addition | request `response_format` |
|---|---|---|
| `json_schema` | none (existing prompt) | `{ type: "json_schema", json_schema: { name, strict: true, schema } }` |
| `json_object` | append schema description + "嚴格遵守此 schema" | `{ type: "json_object" }` |
| `none` | append schema description + "只回傳 JSON，不要 markdown 不要解釋" | omitted |

A small `extractJSON(raw)` helper strips ```` ```json ```` fences and locates the first balanced `{...}` so `none`/some `json_object` responses can be parsed defensively.

## API Contract Changes

### `POST /api/generate` and `POST /api/regenerate`

Both bodies gain an optional `provider` field:

```ts
{
  // existing fields...
  provider?: ProviderSettings;
}
```

Server behavior:
- Missing `provider` → use `DEFAULT_PROVIDER` (server-side constant: OpenAI + `OPENAI_API_KEY`).
- `provider.isLocal === true` → return 400 `{ error: "本地模型請從前端直連" }`. (Frontend never sends this; the guard catches misuse.)
- `provider` present and `isLocal === false` → build OpenAI client with `{ baseURL, apiKey, defaultHeaders }`.
- If `DEFAULT_PROVIDER` has no key (env var missing) and no provider supplied → 503 `{ error: "請點右上角設定 AI 供應商" }`.

## File Structure (additions / changes)

```
app/
├── lib/
│   ├── provider.ts              ☆ new: type, PRESETS, DEFAULT_PROVIDER (server-only constant)
│   ├── provider-storage.ts      ☆ new: load/save/clearProvider (localStorage)
│   ├── ai-call.ts               ☆ new: callAI + extractJSON + per-mode helpers
│   └── openai.ts                ★ modify: generateStory/regeneratePage now accept ProviderSettings, delegate to callAI
├── api/
│   ├── generate/route.ts        ★ modify: accept provider in body
│   └── regenerate/route.ts      ★ modify: accept provider in body
├── components/
│   ├── SettingsButton.tsx       ☆ new: top-right floating button, renders dialog
│   └── SettingsDialog.tsx       ☆ new: form + presets + persistence
├── page.tsx                     ★ modify: branch on isLocal, mount <SettingsButton />
└── story/page.tsx               ★ modify: same
```

## UI

⚙️ button fixed at `top-4 right-4`, label = current provider name (or「預設」when null). Click → native `<dialog>` modal containing:

- Row of preset chips (7 presets + 自訂). Click → fill in fields below, leave `apiKey` untouched if user already typed one.
- Inputs: `name`, `baseURL`, `apiKey` (password-masked, with toggle), `model`.
- Radio group: `json_schema` / `json_object` / `none`.
- Collapsible "進階": custom headers (JSON textarea), `isLocal` checkbox.
- Local-mode warning: "API key 會出現在 browser network 面板".
- Buttons: 還原預設 (clears localStorage) / 取消 / 儲存.

## Error Handling

| Source | Behavior |
|---|---|
| Local provider unreachable (CORS / not running) | Frontend catch → "無法連線到 {baseURL}，請確認服務已啟動且允許跨網域" |
| `extractJSON` fails (model output not parseable) | Surface as "AI 回傳格式錯誤，請換個模型或結構化模式" |
| Cloud provider apiKey blank when saving | Inline warning, but saving allowed |
| No provider set and `OPENAI_API_KEY` missing on server | 503 with "請點右上角設定 AI 供應商" |
| Custom headers JSON invalid | Block save, red inline error |
| Existing input/edit state on any failure | Preserved (existing behavior, unchanged) |

## Acceptance Criteria

1. With no provider configured, generating a story uses backend `OPENAI_API_KEY` exactly as before (regression check).
2. Set OpenAI preset + user-provided key → generation goes to `/api/generate`; server uses the user's key.
3. Set Ollama preset (with Ollama running locally) → DevTools Network tab shows the generation request going directly from the browser to `http://localhost:11434/v1/chat/completions`.
4. Set DeepSeek preset (`json_object` mode) → 5 well-formed pages produced.
5. Click "還原預設" → behavior reverts to criterion 1.
6. Set a cloud provider with a wrong API key → user sees a clear error message; the outline (or page edits) is preserved.
7. Reload after configuring → ⚙️ button shows the provider name; settings persist.
