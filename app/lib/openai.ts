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
