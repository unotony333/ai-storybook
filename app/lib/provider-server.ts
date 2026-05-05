// app/lib/provider-server.ts
import "server-only";
import { ProviderSettings } from "./provider";

export function getDefaultProvider(): ProviderSettings | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return {
    id: "openrouter",
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    model: "openai/gpt-4o-mini",
    isLocal: false,
    structuredOutput: "json_object",
  };
}
