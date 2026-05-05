// app/lib/ai-call.ts
import OpenAI from "openai";
import { ProviderSettings } from "./provider";

export interface CallAIOptions {
  provider: ProviderSettings;
  systemPrompt: string;
  userMessage: string;
  schemaName: string;
  schema: Record<string, unknown>;
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
  schema: Record<string, unknown>,
):
  | { type: "json_schema"; json_schema: { name: string; strict: true; schema: Record<string, unknown> } }
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

export function friendlyAIError(e: unknown): string {
  const status = (e as { status?: number })?.status;
  const baseMsg = e instanceof Error ? e.message : "未知錯誤";
  if (status === 429) {
    return "額度或速率限制 (429)：請稍後再試，或在右上角改用其他 AI 供應商。";
  }
  if (status === 401) {
    return "API Key 無效或未授權 (401)：請在右上角設定檢查 key。";
  }
  if (status === 403) {
    return "權限不足 (403)：API Key 沒有存取此模型的權限。";
  }
  if (status === 404) {
    return "找不到模型或端點 (404)：請確認 Base URL 與模型名稱正確。";
  }
  return baseMsg;
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
