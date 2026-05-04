// app/lib/storage.ts
import { Storybook } from "./types";

const KEY = "ai-storybook:draft";

export function loadDraft(): Storybook | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Storybook;
  } catch {
    return null;
  }
}

export function saveDraft(book: Storybook): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    // Quota or serialization errors — ignore for a demo.
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
