// app/lib/provider-storage.ts
import { ProviderSettings } from "./provider";

const KEY = "ai-storybook:provider";

export function loadProvider(): ProviderSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ProviderSettings;
  } catch {
    return null;
  }
}

export function saveProvider(p: ProviderSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

export function clearProvider(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
