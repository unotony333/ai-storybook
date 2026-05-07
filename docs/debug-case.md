# Debug 案例紀錄

本文件記錄開發 AI Storybook 過程中實際遇到的問題。每個案例都包含：我看到的錯誤、排查的過程、最終的解法。

---

## Case 1：OpenRouter 免費模型回傳被 markdown 包裹的 JSON

### 發生場景

實作 `provider-server.ts` 的免費模型自動挑選後，使用 OpenRouter 的免費模型（如 `deepseek/deepseek-chat-v3-0324:free`）生成故事，前端跳出「AI 回傳格式錯誤」。

### 看到的錯誤

```
SyntaxError: Unexpected token '`', "```json
{" is not valid JSON
```

### 排查過程

1. 在 `ai-call.ts` 的 `callAI` function 加了 `console.log("raw response:", raw)` 看原始回傳
2. 發現 AI 回傳的內容長這樣：

```
```json
{ "pages": [ ... ] }
```​
```

3. `JSON.parse` 直接吃到 ` ``` ` 開頭的字串，當然失敗
4. 這個問題只在 `structuredOutput: "json_object"` 和 `"none"` 模式出現，`"json_schema"` 模式不會（因為 OpenAI 的 strict schema 會強制輸出純 JSON）

### 解法

在 `ai-call.ts` 寫了 `extractJSON` function，先處理 markdown code fence，再定位最外層的 `{}`：

```ts
// app/lib/ai-call.ts
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
```

### 學到什麼

不能假設 AI 會乖乖回傳純 JSON，即使 prompt 裡寫了「只回傳 JSON」。免費模型尤其不穩定。所以 `callAI` 的流程是：拿到 raw → `extractJSON` 清理 → `JSON.parse` → 如果還是失敗才丟 error。

---

## Case 2：繁體中文輸入卻拿到簡體中文故事

### 發生場景

使用者用繁體中文輸入大綱「小熊去森林裡找朋友」，生成結果卻出現簡體字：「小熊去森林里找朋友」「开心地跑了过来」。

### 排查過程

1. 一開始 system prompt 只寫「使用繁體中文」，但 DeepSeek / Qwen 這類以簡體語料為主的模型會忽略
2. 嘗試在 prompt 加強語氣：「必須使用繁體中文，禁止簡體字」→ 改善了一些，但偶爾還是漏
3. 最後的想法：不靠 prompt 硬指定語言，改成自動偵測使用者輸入的書寫系統，然後在 prompt 裡直接告訴模型「跟使用者的書寫系統完全一致」

### 解法

在 `openai.ts` 寫了 `detectInputLang` function，用 regex 比對繁體字 vs 簡體字的特徵字元：

```ts
// app/lib/openai.ts
function detectInputLang(input: string): string {
  if (/[一-鿿]/.test(input)) {
    const simplifiedOnly = /[国学这个时来号长机为说会请这无么们对发产规东运动远车]/;
    const traditionalOnly = /[國學這個時來號長機為說會請這無麼們對發產規東運動遠車]/;
    if (traditionalOnly.test(input)) return "繁體中文（必須使用繁體字，禁止使用簡體字）";
    if (simplifiedOnly.test(input)) return "简体中文（必须使用简体字，禁止使用繁体字）";
    return "中文（與使用者輸入完全相同的書寫系統，不可在繁體與簡體之間切換）";
  }
  if (/[぀-ゟ゠-ヿ]/.test(input)) return "日本語";
  if (/[가-힯]/.test(input)) return "한국어";
  if (/^[\x20-\x7e\s\n\r\t]+$/.test(input.trim())) return "English";
  return "與使用者輸入完全相同的語言";
}
```

然後在 system prompt 裡動態插入偵測結果，並加上「違反視為失敗」的強調：

```
**語言要求（最重要，違反視為失敗）**：text 欄位的語言與書寫系統必須與使用者輸入完全相同；
如果使用者用繁體中文，禁止輸出簡體字（反之亦然）。
```

### 學到什麼

AI 不一定聽你的 prompt 指令，特別是語言這種事。與其用 prompt 硬壓，不如寫程式偵測 + 在 prompt 裡用偵測結果動態組合，效果好很多。「違反視為失敗」這種強烈措辭對某些模型有效。

---

## Case 3：本地模型 (Ollama) CORS 被擋

### 發生場景

在 `SettingsDialog` 選擇 Ollama preset 後按「測試連線」，直接報 `TypeError: Failed to fetch`。

### 排查過程

1. 打開 Chrome DevTools Network tab，看到 preflight request (OPTIONS) 被擋：`Access-Control-Allow-Origin` header 不存在
2. 確認是因為瀏覽器直接呼叫 `http://localhost:11434/v1`，跨了 origin（前端跑在 `localhost:3000`）
3. 想法：可以走 API Route 繞過去（server-to-server 沒有 CORS），但這樣就失去「本地模型不經 server」的意義

### 解法

兩層處理：

第一，在 `provider.ts` 裡把 Ollama 和 LM Studio 標記為 `isLocal: true`。前端判斷到 `isLocal` 時，直接從瀏覽器呼叫本地 API（用 OpenAI SDK 的 `dangerouslyAllowBrowser: true`），不走後端 API Route。

第二，使用者那邊需要設定 Ollama 允許 CORS。在 README 和 SettingsDialog 裡加上提示：

```
Ollama 需設定 OLLAMA_ORIGINS=* 來允許跨網域
LM Studio 需在 server 設定裡開啟 CORS
```

第三，在錯誤訊息裡做友善處理，偵測到 fetch/network/cors 相關錯誤時，顯示明確的中文提示而不是原始 error：

```ts
// app/story/page.tsx
if (isLocal && /fetch|network|cors/i.test(msg)) {
  return `無法連線到本地模型：${msg}。請確認服務已啟動且允許跨網域。`;
}
```

### 學到什麼

瀏覽器直連本地 API 這個架構決定，帶來了隱私好處（API key 不經 server），但 CORS 是不可避免的門檻。解法不是技術上繞過它，而是在 UX 上處理好：友善的錯誤訊息 + 清楚的設定指引。

---

## Case 4：AI 回傳頁數不穩定（3 頁或 7 頁）

### 發生場景

使用免費模型生成故事，有時候拿到 3 頁，有時候 7 頁，前端卡片渲染混亂。

### 排查過程

1. 在 `openai.ts` 的 `generateStory` 加 log，發現 `result.pages.length` 不是每次都等於 5
2. prompt 裡明明寫了「產出正好 5 頁」，但小模型（特別是免費模型和本地的小參數模型）常常無視
3. 用 `json_schema` strict 模式可以限制結構，但沒辦法限制 array length

### 解法

在 `generateStory` 裡加了嚴格驗證：如果回傳不是正好 5 頁，直接丟 error 讓使用者重試或換模型：

```ts
// app/lib/openai.ts
const pages = Array.isArray(result.pages) ? result.pages : [];
if (pages.length !== 5) {
  throw new Error(`AI 回傳 ${pages.length} 頁而非 5 頁，請改用其他模型或結構化模式`);
}
```

同時，每一頁的欄位也做了 defensive 處理，避免 AI 回傳缺欄位時前端 crash：

```ts
return pages.map((p, i) => ({
  pageNumber: i + 1,
  text: typeof p.text === "string" ? p.text : "",
  imagePrompt: typeof p.imagePrompt === "string" ? p.imagePrompt : "",
}));
```

### 學到什麼

AI 的輸出不等於 API——API 保證 schema，AI 不保證。即使用了 `json_schema` strict 模式，array 長度還是不在 schema 的控制範圍內。所以每一層都要做驗證：結構驗證（`extractJSON`）→ 數量驗證（頁數）→ 欄位驗證（型別檢查）。

---

## 總結

這些問題的共通點是：**AI 的輸出不可信，工程師的工作是在 AI 和使用者之間建立一層可靠的轉換**。

我的處理流程固定是：看 error → 加 log 確認原始資料 → 找出 root cause → 寫防呆邏輯 → 測試邊界情況。
