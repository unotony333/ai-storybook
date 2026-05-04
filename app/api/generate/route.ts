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
