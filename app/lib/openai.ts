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
  const result = await callAI<{ pages: Partial<StoryPage>[] }>({
    provider,
    systemPrompt: SYSTEM_BASE(lang),
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
