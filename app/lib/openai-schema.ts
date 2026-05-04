// app/lib/openai-schema.ts
export const pageSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    pageNumber: { type: "integer", minimum: 1, maximum: 5 },
    text: { type: "string" },
    imagePrompt: { type: "string" },
  },
  required: ["pageNumber", "text", "imagePrompt"],
} as const;

export const storySchema = {
  name: "storybook",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      pages: {
        type: "array",
        items: pageSchema,
        minItems: 5,
        maxItems: 5,
      },
    },
    required: ["pages"],
  },
} as const;

export const singlePageSchema = {
  name: "storybook_page",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      page: pageSchema,
    },
    required: ["page"],
  },
} as const;
