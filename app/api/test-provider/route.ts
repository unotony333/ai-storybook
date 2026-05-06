// app/api/test-provider/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { friendlyAIError } from "@/app/lib/ai-call";
import { type ProviderSettings } from "@/app/lib/provider";
import { getDefaultProvider } from "@/app/lib/provider-server";

interface Body {
  provider?: ProviderSettings;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  if (body.provider?.isLocal) {
    return NextResponse.json(
      { error: "本地模型請從前端直連測試" },
      { status: 400 },
    );
  }

  const provider = body.provider ?? (await getDefaultProvider());
  if (!provider) {
    return NextResponse.json(
      { error: "沒有可測試的 provider" },
      { status: 400 },
    );
  }

  try {
    const client = new OpenAI({
      baseURL: provider.baseURL,
      apiKey: provider.apiKey || "no-key",
      defaultHeaders: provider.headers,
    });
    await client.models.list();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/test-provider]", e);
    return NextResponse.json(
      { error: friendlyAIError(e) },
      { status: 500 },
    );
  }
}
