# Memory Viewer — 設計文書

## 概要

Azure Table Storage に保存された memory-MCP の記憶データを、ブラウザから閲覧・管理するWebアプリ。

- URL: `https://memory.darkhaloes.com`
- Landing Page (`https://darkhaloes.com`) からリンクされる
- 個人利用（Takayuki Suzuki 専用）

---

## アーキテクチャ

```
darkhaloes.com (Landing Page)
    └─ リンク
memory.darkhaloes.com
    ├── Static Hosting     : React (Vite + TypeScript) ビルド成果物
    └── /api/*             : SWA Managed Functions (TypeScript / Node.js)
                                 ↓ @azure/data-tables SDK
                         Azure Table Storage（既存テーブル）
                                 ↑
                         memory-MCP (既存 Azure Functions)
                         Claude / Perplexity / Comet から読み書き
```

### コンポーネント一覧

| コンポーネント | 技術 | 備考 |
|---|---|---|
| ホスティング | Azure Static Web Apps (Free Tier) | カスタムドメイン無料 |
| フロントエンド | React 18 + Vite + TypeScript | |
| バックエンドAPI | SWA Managed Functions (TypeScript) | `api/` ディレクトリ |
| 認証 | SWA Built-in Authentication（Google OAuth） | `/.auth/login/google` |
| データストア | Azure Table Storage（既存） | memory-MCP と共用 |
| 接続文字列管理 | SWA App Settings（環境変数） | `AZURE_STORAGE_CONNECTION_STRING` |

---

## データモデル

Azure Table Storage の既存スキーマをそのまま使用。新規テーブルは作成しない。

| フィールド | 型 | 説明 |
|---|---|---|
| PartitionKey | string | 固定値（memory-MCP の実装に合わせる） |
| RowKey | string | メモリのキー（例: `memory_profile_tech`） |
| content | string | Markdown テキスト |
| created_at | string | ISO 8601 |
| updated_at | string | ISO 8601 |

### 既存キー（2026-05-26 時点）

| キー | 内容 |
|---|---|
| `memory_profile_tech` | 仕事・技術スキル |
| `memory_profile_personal` | 個人・家族情報 |
| `memory_topic_exoplanet` | 系外惑星トピック |
| `diary_2026-05` | 5月日記（月次追記） |

---

## API 設計

ベースパス: `/api`

認証: SWA Built-in Auth により、未認証リクエストは自動的に 401 を返す（`staticwebapp.config.json` で設定）。

| エンドポイント | メソッド | 機能 |
|---|---|---|
| `/api/memories` | GET | キー一覧取得（key, updated_at, content 先頭100字） |
| `/api/memories/{key}` | GET | 1件フル取得 |
| `/api/memories/{key}` | PUT | 既存エントリ更新（content のみ更新、updated_at は API 側でセット） |
| `/api/memories/{key}` | POST | 新規作成 |
| `/api/memories/{key}` | DELETE | 削除 |

### レスポンス例（GET /api/memories）

```json
[
  {
    "key": "memory_profile_tech",
    "updated_at": "2026-05-25T10:12:45Z",
    "preview": "## Takayuki の仕事背景・技術スキル\n\n**職務環境**\n..."
  }
]
```

---

## 認証フロー

SWA Built-in Authentication を使用。Google を IdP として設定。

1. 未認証でアクセス → `staticwebapp.config.json` の `allowedRoles: ["authenticated"]` によりリダイレクト
2. `/.auth/login/google` → Google 同意画面 → コールバック
3. SWA が セッション Cookie をセット
4. 以降のAPIリクエストに `x-ms-client-principal` ヘッダーが付与される
5. API Functions 側でヘッダーをデコードしてユーザー確認（オプション）

---

## フロントエンド画面構成

```
/                   ← MemoryList（キー一覧、updated_at、プレビュー）
/memory/:key        ← MemoryDetail（Markdownレンダリング、編集・削除ボタン）
/memory/new         ← MemoryCreate（キー名入力 + コンテンツ入力）
```

### 使用ライブラリ（案）

| ライブラリ | 用途 |
|---|---|
| `react-router-dom` | ルーティング |
| `react-markdown` | Markdown レンダリング |
| `@uiw/react-md-editor` または `textarea` | 編集UI |
| `date-fns` | 日時フォーマット |

---

## ドメイン・デプロイ設定

1. Azure Static Web Apps リソース作成（GitHub Actions による CI/CD）
2. SWA の Custom Domain に `memory.darkhaloes.com` を追加
3. DNS（darkhaloes.com のレジストラ）に CNAME レコード追加
   - `memory` → `<swa-default-domain>.azurestaticapps.net`
4. `darkhaloes.com` の Landing Page に `<a href="https://memory.darkhaloes.com">` を追加

---

## 削除の方針

- WebアプリとMCP（Claude等）の両方から削除操作が可能
- 楽観的排他制御は実装しない（個人利用のため競合リスクが低い）
- Webアプリ側には確認ダイアログ（「本当に削除しますか？」）を実装して誤操作を防ぐ

---

## 環境変数

| 変数名 | 設定箇所 | 説明 |
|---|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | SWA App Settings | Table Storage 接続文字列 |

memory-MCP（Azure Functions）側の App Settings にすでに存在する値をそのまま流用する。

---

## ディレクトリ構成（案）

```
memory-viewer/
├── api/                        # SWA Managed Functions
│   ├── memories/
│   │   ├── index.ts            # GET /api/memories
│   │   └── function.json
│   └── memories-key/
│       ├── index.ts            # GET/PUT/POST/DELETE /api/memories/{key}
│       └── function.json
├── src/
│   ├── components/
│   │   ├── MemoryList.tsx
│   │   ├── MemoryDetail.tsx
│   │   └── MemoryEditor.tsx
│   ├── App.tsx
│   └── main.tsx
├── staticwebapp.config.json    # 認証・ルーティング設定
├── vite.config.ts
└── package.json
```
