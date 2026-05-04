// app/lib/types.ts
export type PromptLang = "zh" | "en";

export interface StoryPage {
  pageNumber: number;
  text: string;
  imagePrompt: string;
}

export interface Storybook {
  outline: string;
  promptLang: PromptLang;
  pages: StoryPage[];
}

export const PAGE_COUNT = 5;
export const MAX_OUTLINE_LENGTH = 1000;
