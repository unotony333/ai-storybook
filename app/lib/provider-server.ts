// app/lib/provider-server.ts
import "server-only";
import { ProviderSettings } from "./provider";

export function getDefaultProvider(): ProviderSettings | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    id: "openai",
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    apiKey,
    model: "gpt-4o-mini",
    isLocal: false,
    structuredOutput: "json_schema",
  };
}
