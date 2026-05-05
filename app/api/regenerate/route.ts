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
