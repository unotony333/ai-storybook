// app/lib/provider-server.ts
import "server-only";
import { ProviderSettings } from "./provider";

// Ranked preference of free OpenRouter models. The picker checks these
// in order against /v1/models; if none are present (IDs change over
// time), it falls back to whichever free model OpenRouter lists first.
const PREFERRED_FREE_MODELS = [
  "deepseek/deepseek-chat-v3-0324:free",
  "deepseek/deepseek-r1:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemini-2.0-flash-exp:free",
  "qwen/qwen-2.5-72b-instruct:free",
];

interface OpenRouterModel {
  id: string;
  pricing?: { prompt?: string; completion?: string };
}

let cached: ProviderSettings | null = null;
let inFlight: Promise<ProviderSettings | null> | null = null;

async function pickFreeModel(): Promise<string | null> {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) return null;
  const data = (await res.json()) as { data: OpenRouterModel[] };
  const free = data.data.filter(
    (m) => m.pricing?.prompt === "0" && m.pricing?.completion === "0",
  );
  const ids = new Set(free.map((m) => m.id));
  for (const candidate of PREFERRED_FREE_MODELS) {
    if (ids.has(candidate)) return candidate;
  }
  return free[0]?.id ?? null;
}

export async function getDefaultProvider(): Promise<ProviderSettings | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  if (cached) return cached;

  const override = process.env.OPENROUTER_DEFAULT_MODEL;
  if (override) {
    cached = buildProvider(apiKey, override);
    return cached;
  }

  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const model = await pickFreeModel();
      if (!model) return null;
      console.log(`[provider-server] selected default model: ${model}`);
      cached = buildProvider(apiKey, model);
      return cached;
    } catch (e) {
      console.error("[provider-server] pickFreeModel failed:", e);
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function buildProvider(apiKey: string, model: string): ProviderSettings {
  return {
    id: "openrouter",
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    model,
    isLocal: false,
    structuredOutput: "json_object",
  };
}
