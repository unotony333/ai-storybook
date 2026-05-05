// app/lib/provider.ts
export type StructuredOutputMode = "json_schema" | "json_object" | "none";

export interface ProviderSettings {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  isLocal: boolean;
  structuredOutput: StructuredOutputMode;
  headers?: Record<string, string>;
}

export interface ProviderPreset {
  id: string;
  name: string;
  baseURL: string;
  defaultModel: string;
  isLocal: boolean;
  structuredOutput: StructuredOutputMode;
}

export const PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    isLocal: false,
    structuredOutput: "json_schema",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseURL: "https://api.anthropic.com/v1",
    defaultModel: "claude-haiku-4-5-20251001",
    isLocal: false,
    structuredOutput: "json_object",
  },
  {
    id: "google",
    name: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    isLocal: false,
    structuredOutput: "json_object",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    isLocal: false,
    structuredOutput: "json_object",
  },
  {
    id: "xai",
    name: "xAI Grok",
    baseURL: "https://api.x.ai/v1",
    defaultModel: "grok-2-latest",
    isLocal: false,
    structuredOutput: "json_object",
  },
  {
    id: "ollama",
    name: "Ollama (本地)",
    baseURL: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    isLocal: true,
    structuredOutput: "json_object",
  },
  {
    id: "lmstudio",
    name: "LM Studio (本地)",
    baseURL: "http://localhost:1234/v1",
    defaultModel: "local-model",
    isLocal: true,
    structuredOutput: "json_schema",
  },
];

export function presetToSettings(preset: ProviderPreset): ProviderSettings {
  return {
    id: preset.id,
    name: preset.name,
    baseURL: preset.baseURL,
    apiKey: "",
    model: preset.defaultModel,
    isLocal: preset.isLocal,
    structuredOutput: preset.structuredOutput,
  };
}

export function emptyCustomSettings(): ProviderSettings {
  return {
    id: "custom",
    name: "自訂",
    baseURL: "",
    apiKey: "",
    model: "",
    isLocal: false,
    structuredOutput: "json_object",
  };
}
