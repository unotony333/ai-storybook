# AI Storybook（Vibe Coding Demo）

一個使用 AI 協作開發（Vibe Coding）打造的繪本生成平台。
輸入一段大綱，自動生成 5 頁可編輯的兒童繪本故事。AI 用結構化 JSON 輸出，使用者可以逐頁編輯、單頁重新生成；圖片暫不串接，改成顯示提示詞（image prompt）讓使用者貼到自己慣用的圖片生成 AI。

## Demo

https://ai-storybook-sand.vercel.app/

## 特色

- **5 頁繪本一鍵生成**：用任何 OpenAI 相容 API 都能跑
- **逐頁編輯 + 單頁 Regenerate**：可帶選填修改提示，AI 重生時保持與其他頁劇情連貫
- **語言自動匹配**：偵測輸入的書寫系統（繁/簡中、English、日文、韓文），確保輸出語言與使用者輸入一致
- **多 provider 支援**：內建 OpenAI、Anthropic、Google、DeepSeek、xAI、OpenRouter、Ollama、LM Studio 快速 preset，加上自訂 baseURL / API key / model / headers
- **本地模型直連**：選 Ollama / LM Studio 時直接從瀏覽器呼叫 `localhost`，不經 server
- **三種結構化輸出模式**：`json_schema`（嚴格）/ `json_object`（寬鬆 + prompt 引導）/ `none`（純 prompt）
- **localStorage 持久化**：草稿與 provider 設定都存瀏覽器，重整不丟
- **連線測試**：設定 modal 內可先 ping 確認 provider 可用
- **免費 OpenRouter model 自動挑選**：未設定 provider 時，server 會 fetch OpenRouter `/v1/models` 並對偏好清單做 1-token ping，挑出當下實際可用的免費 model

## Tech Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · OpenAI SDK 4.x

## 開始使用

### 1. 取得 API key

預設後端用 OpenRouter（[openrouter.ai/keys](https://openrouter.ai/keys) 註冊免費 key 即可）。也可以完全不設後端 key，每個使用者按右上角設定自己設 provider。

### 2. 安裝與啟動

```bash
git clone https://github.com/unotony333/ai-storybook.git
cd ai-storybook
npm install
cp .env.example .env.local
# 編輯 .env.local，填入 OPENROUTER_API_KEY
npm run dev
```

打開 [http://localhost:3000](http://localhost:3000)。

### 環境變數

| 變數 | 必填 | 說明 |
|---|---|---|
| `OPENROUTER_API_KEY` | 否 | Server 端後備 provider；未設則使用者必須在右上角自行設定 |
| `OPENROUTER_DEFAULT_MODEL` | 否 | 釘住特定 model，跳過自動挑選 |

## 使用流程

1. 在首頁輸入大綱（最多 1000 字）+ 選擇圖片提示詞語言（中/英）→ 按生成
2. 跳到 `/story` 顯示 5 張卡片，每張可編輯 `text` 與 `imagePrompt`
3. 對任一頁按「重新生成」，可選填提示（例如「主角換成貓」）
4. 點圖片提示詞旁的「複製」鈕，貼到你慣用的圖片生成 AI
5. 「重新開始」清除目前繪本

## AI Provider 設定

右上角設定按鈕 → 8 個 preset 一鍵帶入，或選「自訂」手動填：

- **OpenAI**：`json_schema` strict 模式（schema 嚴格保證）
- **Anthropic / Google / DeepSeek / xAI / OpenRouter**：`json_object` 模式
- **Ollama (`localhost:11434/v1`)**：本地直連，需在 Ollama 設定 `OLLAMA_ORIGINS=*`
- **LM Studio (`localhost:1234/v1`)**：本地直連，需開啟 server 內的 CORS 設定

支援自訂 headers（JSON 物件，例如 OpenRouter 的 referrer / app name）。

## 部署到 Vercel

1. Push 到 GitHub
2. [vercel.com/new](https://vercel.com/new) → Import 此 repo
3. Environment Variables 加 `OPENROUTER_API_KEY`（或留空，讓使用者自己設 provider）
4. Deploy

## 專案結構

```
app/
├── page.tsx              # 大綱輸入頁
├── story/page.tsx        # 5 頁編輯器
├── api/
│   ├── generate/         # 整本生成
│   ├── regenerate/       # 單頁重生
│   └── test-provider/    # 連線測試（雲端走後端避 CORS）
├── components/           # OutlineForm / StoryPageCard / SettingsDialog 等
└── lib/
    ├── ai-call.ts        # 統一的 AI 呼叫，3 種結構化輸出模式
    ├── openai.ts         # generateStory / regeneratePage
    ├── provider.ts       # ProviderSettings 型別 + 8 個 preset
    ├── provider-server.ts # 自動挑選免費 OpenRouter model
    └── storage.ts        # localStorage helpers
```

## AI 協作開發文件

本專案全程使用 AI 工具（ChatGPT / Cursor / GitHub Copilot）協作開發。以下文件詳細記錄了開發過程：

- **[AI 協作開發流程](docs/ai-workflow.md)**：Prompt 設計策略、AI 工具分工、實際對話紀錄、從 AI 產出到最終程式碼的修改過程
- **[Debug 案例紀錄](docs/debug-case.md)**：開發中遇到的真實問題、error message、排查思路與最終解法

## 已知限制

- 5 頁固定（不可變）
- 沒有圖片生成（只有 prompt）
- localStorage 一次只能存一份草稿
- 沒有帳號 / 雲端同步

## 未來優化方向

- 加入圖片生成（DALL·E / Stable Diffusion）
- 使用者登入（Supabase Auth）
- 分享功能（Public URL）
- 頁數自由調整
