// app/api/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateStory } from "@/app/lib/openai";
import { friendlyAIError } from "@/app/lib/ai-call";
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

  const provider = body.provider ?? (await getDefaultProvider());
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
    console.error("[/api/generate]", e);
    return NextResponse.json(
      { error: friendlyAIError(e) },
      { status: 500 },
    );
  }
}
