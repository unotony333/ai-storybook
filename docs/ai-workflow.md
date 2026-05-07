# AI 協作開發流程

本專案全程使用 AI 工具協作開發。這份文件記錄我怎麼分工、怎麼下 prompt、AI 給了什麼、我改了什麼。

## AI 工具分工

| 工具 | 用途 | 使用時機 |
|---|---|---|
| ChatGPT | 架構設計、問題拆解、Prompt 設計 | 開工前先討論方向，把大需求拆成小任務 |
| Cursor | 寫程式碼、改程式碼 | 主要的 coding 工具，幾乎所有程式碼都經過 Cursor |
| GitHub Copilot | 行內補齊 | 打字時自動建議，接受或跳過 |

基本流程：ChatGPT 想清楚要做什麼 → Cursor 生成程式碼 → 我驗證 + 修改 → commit。

---

## 實際案例 1：設計統一的 AI 呼叫層（ai-call.ts）

### 背景

專案需要支援多家 AI provider（OpenAI、Anthropic、Google 等），而且每家對「結構化輸出」的支援程度不同。我需要一個統一的呼叫介面。

### 我問 ChatGPT 的 Prompt

```
我在做一個 Next.js 專案，需要呼叫不同的 AI provider（OpenAI、Anthropic、Google 等）。
每家 API 格式不同，但我想統一用 OpenAI SDK 來呼叫（因為大部分 provider 都有 OpenAI 相容端點）。

問題是結構化輸出：
- OpenAI 支援 json_schema（strict mode）
- 其他家只支援 json_object 或完全不支援

我要怎麼設計一個 callAI function，可以根據 provider 的能力自動切換結構化輸出模式？
```

### ChatGPT 給的方向

建議用一個 `structuredOutput` 欄位區分三種模式，然後在 callAI 裡用 switch 切換：
- `json_schema`：用 `response_format: { type: "json_schema", json_schema: {...} }`
- `json_object`：用 `response_format: { type: "json_object" }` + 在 system prompt 裡描述格式
- `none`：不設 response_format，純靠 prompt 引導

### 我用 Cursor 生成的程式碼 vs 我的修改

Cursor 生成了基本的 `callAI` function，但有幾個問題我手動改了：

**問題 1：Cursor 沒處理 reasoning model 的回傳格式**

某些模型（如 DeepSeek R1）回傳的不是 `message.content`，而是 `message.reasoning_content`。Cursor 生成的版本只讀 `content`，遇到 reasoning model 會拿到 null。

我加了 fallback chain：

```ts
// 我的修改：依序嘗試 content → reasoning_content → reasoning
const raw =
  (message?.content && message.content.length > 0 ? message.content : null) ??
  message?.reasoning_content ??
  message?.reasoning ??
  null;
if (!raw) throw new Error("AI 回傳空內容");
```

**問題 2：`none` 模式的 prompt 要更強硬**

Cursor 在 `none` 模式下只加了「請回傳 JSON」，但實際跑起來，模型會加 markdown code fence。我改成明確禁止：

```ts
// none 模式的 system prompt 尾巴
return `${base}

輸出格式（請嚴格遵守）：${schemaDescription}

只回傳 JSON 本身，不要使用 markdown 程式碼區塊（例如 \`\`\`json），不要加任何額外說明。`;
```

---

## 實際案例 2：免費 OpenRouter 模型自動挑選（provider-server.ts）

### 背景

我想讓沒有設定 API key 的使用者也能體驗，所以後端預設用 OpenRouter 的免費模型。但免費模型常常掛掉或額度用完，不能寫死一個 model name。

### 我問 ChatGPT 的 Prompt

```
OpenRouter 有一些免費模型，但它們的可用性不穩定，可能隨時被下架或暫停。
我想在 server 端自動挑選一個當前可用的免費模型。

OpenRouter 的 /v1/models API 會列出所有模型，免費模型的 pricing.prompt 和 pricing.completion 都是 "0"。

我的想法是：
1. 先 fetch /v1/models，篩出免費模型
2. 對每個模型做一次 1-token ping 確認它真的能用
3. 從可用的裡面挑一個

這個邏輯應該怎麼寫？要考慮 cache（不要每個 request 都重新挑選）和 timeout。
```

### ChatGPT 的建議

基本邏輯 OK，額外建議：加一個偏好清單（先試品質好的模型），用 `Promise.all` 並行 ping 所有候選模型，加 cache 和 inflight dedup。

### 我用 Cursor 生成後改了什麼

Cursor 生成了基本的 `pickFreeModel`，但我做了幾個調整：

**調整 1：加了 8 秒 AbortController timeout**

Cursor 沒設 timeout，實際跑起來某些掛掉的模型會讓 ping 等超過 30 秒。我加了 `AbortController`：

```ts
async function pingModel(apiKey: string, modelId: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { ... },
      body: JSON.stringify({ model: modelId, messages: [...], max_tokens: 1 }),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
```

**調整 2：加了 inflight dedup**

Cursor 只做了 `cached` 變數，但沒處理同時進來多個 request 的情況（會觸發重複的 pickFreeModel）。我加了 `inFlight` promise dedup：

```ts
let cached: ProviderSettings | null = null;
let inFlight: Promise<ProviderSettings | null> | null = null;

export async function getDefaultProvider(): Promise<ProviderSettings | null> {
  if (cached) return cached;
  if (inFlight) return inFlight;  // 已經在挑了，等它
  inFlight = (async () => { ... })();
  return inFlight;
}
```

---

## 實際案例 3：單頁重新生成要保持劇情連貫（regeneratePage）

### 背景

使用者可以只重新生成其中一頁，但新生成的內容要跟其他 4 頁連貫。

### 我問 ChatGPT 的 Prompt

```
使用者可以只重新生成繪本的第 3 頁。
我要怎麼設計 prompt，讓 AI 生成的新第 3 頁跟第 1、2、4、5 頁連貫？
使用者還可以給一個修改提示，例如「主角換成貓」。
```

### ChatGPT 的建議

把其他 4 頁的內容直接附在 user message 裡，system prompt 裡強調「保持連貫、不要重複其他頁內容」。

### 我的修改

Cursor 生成的版本把 `userHint` 的處理寫在 user message 裡。但我實測發現，某些模型會忽略 user message 裡的 hint。改成在 system prompt 裡強調：

```ts
const system = `${SYSTEM_BASE(outline, lang)}

現在的任務是**只重新生成第 ${pageNumber} 頁**。要與其他 4 頁（已附上）保持劇情連貫，不要重複它們的內容。${
  userHint ? "若使用者額外提供修改提示，**優先遵循該提示**。" : ""
}`;
```

把 `otherPages` 放在 user message 裡用 JSON 傳遞，這樣 system prompt 管邏輯，user message 管資料，分工清楚。

---

## 實際案例 4：友善的錯誤訊息（friendlyAIError）

### 背景

AI API 報錯時，原始錯誤訊息對使用者沒有意義（例如 `401 Unauthorized`）。

### Cursor Prompt

```
幫我寫一個 friendlyAIError function，把 HTTP status code 轉成中文的友善錯誤訊息。
要處理 401、403、404、429。
```

### Cursor 生成 + 我的調整

Cursor 生成的版本只給了通用訊息。我加上了「使用者可以怎麼做」的引導，例如 429 不是只說「速率限制」，而是告訴使用者「請在右上角改用其他 AI 供應商」：

```ts
if (status === 429) {
  return "額度或速率限制 (429)：請稍後再試，或在右上角改用其他 AI 供應商。";
}
if (status === 401) {
  return "API Key 無效或未授權 (401)：請在右上角設定檢查 key。";
}
```

---

## AI 的限制 vs 我的處理方式

| AI 做得到的 | AI 做不到的（我來補） |
|---|---|
| 生成基本的 function 結構 | 處理 edge case（reasoning model 回傳格式、race condition） |
| 生成 CRUD 邏輯 | 設計跨 provider 的抽象層 |
| 生成基本 UI | 寫友善的錯誤訊息引導使用者操作 |
| 建議架構方向 | 判斷哪些建議適合、哪些不適合當前場景 |

## 核心心得

AI 協作開發的關鍵不是「讓 AI 寫完所有程式碼」，而是知道什麼時候該信任 AI 的產出、什麼時候該自己動手改。

在這個專案裡，大約 70% 的程式碼是 AI 生成的初版，但其中大概一半被我修改過——加 edge case 處理、改 prompt 策略、調整 UX 細節。最終交付的是一個能穩定運作的產品，不是一堆 AI 生成的片段。
