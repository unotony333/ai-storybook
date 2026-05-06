// app/lib/openai.ts
import { ProviderSettings } from "./provider";
import { PromptLang, StoryPage } from "./types";
import { callAI } from "./ai-call";
import { storySchema, singlePageSchema } from "./openai-schema";

function langLabel(lang: PromptLang): string {
  return lang === "zh" ? "繁體中文" : "English";
}

// Heuristic: detect the writing system / language of the outline so we can
// tell the model to mirror it. Necessary because models trained mostly on
// simplified Chinese (Qwen, DeepSeek) tend to ignore "繁體中文" hints.
function detectInputLang(input: string): string {
  if (/[一-鿿]/.test(input)) {
    // Simplified-only characters (no traditional counterpart with the same form)
    const simplifiedOnly = /[国学这个时来号长机为说会请这无么们对发产规东运动远车]/;
    // Traditional-only characters
    const traditionalOnly = /[國學這個時來號長機為說會請這無麼們對發產規東運動遠車]/;
    if (traditionalOnly.test(input)) return "繁體中文（必須使用繁體字，禁止使用簡體字）";
    if (simplifiedOnly.test(input)) return "简体中文（必须使用简体字，禁止使用繁体字）";
    return "中文（與使用者輸入完全相同的書寫系統，不可在繁體與簡體之間切換）";
  }
  if (/[぀-ゟ゠-ヿ]/.test(input)) return "日本語";
  if (/[가-힯]/.test(input)) return "한국어";
  if (/^[\x20-\x7e\s\n\r\t]+$/.test(input.trim())) return "English";
  return "與使用者輸入完全相同的語言";
}

const SYSTEM_BASE = (input: string, imagePromptLang: PromptLang) => {
  const storyLang = detectInputLang(input);
  return `你是兒童繪本創作助手。根據使用者的大綱，產出**正好 5 頁**的故事。每頁要有：
- pageNumber（1–5）
- text：${storyLang}，2–4 句，口語、適合朗讀給孩子聽
- imagePrompt：用於 AI 圖片生成的描述，語言為 ${langLabel(imagePromptLang)}，描述場景視覺（角色、動作、環境、氛圍、畫風），不要含對白

整體風格：溫暖、富想像力，5 頁構成完整的「起承轉合 + 收尾」。

**語言要求（最重要，違反視為失敗）**：text 欄位的語言與書寫系統必須與使用者輸入完全相同；如果使用者用繁體中文，禁止輸出簡體字（反之亦然）。`;
};

const STORY_SCHEMA_DESC =
  '回傳 JSON：{ "pages": [{ "pageNumber": 1..5, "text": "...", "imagePrompt": "..." }, ...] }，pages 必須正好 5 個元素，pageNumber 依序 1 到 5。';

const PAGE_SCHEMA_DESC =
  '回傳 JSON：{ "page": { "pageNumber": <該頁頁碼>, "text": "...", "imagePrompt": "..." } }';

export async function generateStory(
  provider: ProviderSettings,
  outline: string,
  lang: PromptLang,
): Promise<StoryPage[]> {
  const result = await callAI<{ pages: Partial<StoryPage>[] }>({
    provider,
    systemPrompt: SYSTEM_BASE(outline, lang),
    userMessage: outline,
    schemaName: storySchema.name,
    schema: storySchema.schema,
    schemaDescription: STORY_SCHEMA_DESC,
  });
  const pages = Array.isArray(result.pages) ? result.pages : [];
  if (pages.length !== 5) {
    throw new Error(`AI 回傳 ${pages.length} 頁而非 5 頁，請改用其他模型或結構化模式`);
  }
  return pages.map((p, i) => ({
    pageNumber: i + 1,
    text: typeof p.text === "string" ? p.text : "",
    imagePrompt: typeof p.imagePrompt === "string" ? p.imagePrompt : "",
  }));
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

  const system = `${SYSTEM_BASE(outline, lang)}

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

  const result = await callAI<{ page?: Partial<StoryPage> }>({
    provider,
    systemPrompt: system,
    userMessage,
    schemaName: singlePageSchema.name,
    schema: singlePageSchema.schema,
    schemaDescription: PAGE_SCHEMA_DESC,
  });

  const p = result.page ?? {};
  return {
    pageNumber,
    text: typeof p.text === "string" ? p.text : "",
    imagePrompt: typeof p.imagePrompt === "string" ? p.imagePrompt : "",
  };
}
