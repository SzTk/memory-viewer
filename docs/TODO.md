# Memory Viewer — TODO

## Phase 1: インフラ・環境構築

- [ ] GitHub リポジトリ作成（`memory-viewer` または `darkhaloes-memory`）
- [ ] Azure Static Web Apps リソース作成（Free Tier）
  - GitHub リポジトリと連携（GitHub Actions 自動生成）
- [ ] SWA App Settings に `AZURE_STORAGE_CONNECTION_STRING` を設定
  - memory-MCP の Azure Functions から接続文字列をコピー
- [ ] SWA Built-in Authentication を設定（Google OAuth）
  - Azure Portal → SWA → Authentication → Add provider: Google
  - Google Cloud Console で OAuth クライアントID・シークレットを取得
  - 許可するリダイレクト URI: `https://memory.darkhaloes.com/.auth/login/google/callback`
- [ ] カスタムドメイン設定
  - SWA に `memory.darkhaloes.com` を追加
  - DNS レジストラに CNAME: `memory` → `<swa>.azurestaticapps.net`
  - SSL 証明書は SWA が自動発行

## Phase 2: バックエンド API 実装

- [ ] プロジェクトスキャフォールディング（Vite + React + TypeScript）
- [ ] `api/` ディレクトリに SWA Managed Functions を作成
  - [ ] `GET /api/memories` — 一覧取得（@azure/data-tables）
  - [ ] `GET /api/memories/{key}` — 1件取得
  - [ ] `PUT /api/memories/{key}` — 更新（updated_at を API 側でセット）
  - [ ] `POST /api/memories/{key}` — 新規作成
  - [ ] `DELETE /api/memories/{key}` — 削除
- [ ] `staticwebapp.config.json` を作成
  - 未認証アクセスを `/.auth/login/google` にリダイレクト
  - `/api/*` に `allowedRoles: ["authenticated"]` を設定

## Phase 3: フロントエンド実装

- [ ] ルーティング設定（react-router-dom）
  - `/` → MemoryList
  - `/memory/:key` → MemoryDetail
  - `/memory/new` → MemoryCreate
- [ ] MemoryList コンポーネント
  - キー一覧、updated_at、コンテンツプレビュー表示
- [ ] MemoryDetail コンポーネント
  - Markdown レンダリング（react-markdown）
  - 編集・削除ボタン
- [ ] MemoryEditor コンポーネント
  - テキストエリアによる編集UI
  - 保存ボタン（PUT）
- [ ] MemoryCreate コンポーネント
  - キー名入力 + コンテンツ入力
  - 作成ボタン（POST）
- [ ] 削除確認ダイアログ実装

## Phase 4: Landing Page 連携

- [ ] `darkhaloes.com` の Landing Page に Memory Viewer へのリンクを追加
  - `<a href="https://memory.darkhaloes.com">Memory</a>`

## Phase 5: 動作確認

- [ ] ローカル開発環境で `swa cli` を使って動作確認
  - `swa start` でフロント＋API＋認証をローカルエミュレート
- [ ] Google OAuth フローの確認（ログイン・ログアウト）
- [ ] CRUD 操作の確認（一覧・閲覧・編集・削除・新規作成）
- [ ] memory-MCP（Claude）で書き込んだ内容が Viewer に反映されることを確認
- [ ] カスタムドメインで HTTPS アクセス確認

---

## 参考リンク

- [Azure Static Web Apps ドキュメント](https://learn.microsoft.com/ja-jp/azure/static-web-apps/)
- [SWA 認証・認可](https://learn.microsoft.com/ja-jp/azure/static-web-apps/authentication-authorization)
- [SWA Managed Functions](https://learn.microsoft.com/ja-jp/azure/static-web-apps/apis-functions)
- [@azure/data-tables SDK](https://www.npmjs.com/package/@azure/data-tables)
- [SWA CLI（ローカル開発）](https://azure.github.io/static-web-apps-cli/)
