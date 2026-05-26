# Memory Viewer

Azure Table Storage に保存された memory-MCP の記憶データをブラウザから閲覧・管理する Web アプリ。

## 技術スタック

- **フロントエンド**: React 18 + Vite + TypeScript
- **バックエンド**: Azure Static Web Apps Managed Functions (Azure Functions v4 / TypeScript)
- **データストア**: Azure Table Storage（memory-MCP と共用）
- **認証**: SWA Built-in Authentication（Google OAuth）

## ローカル開発

### 前提条件

- Node.js 18+
- [Azure Static Web Apps CLI](https://azure.github.io/static-web-apps-cli/) (`npm install -g @azure/static-web-apps-cli`)
- [Azure Functions Core Tools](https://github.com/Azure/azure-functions-core-tools) v4

### セットアップ

```bash
# フロントエンド依存関係インストール
npm install

# API 依存関係インストール
cd api && npm install && cd ..
```

### 環境変数の設定

`api/local.settings.json` を作成:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_STORAGE_CONNECTION_STRING": "<接続文字列>",
    "AZURE_TABLE_NAME": "memories",
    "AZURE_TABLE_PARTITION_KEY": "memories",
    "SKIP_AUTH": "true"
  }
}
```

> **Note**: `AZURE_STORAGE_CONNECTION_STRING` は memory-MCP の Azure Functions の App Settings から取得してください。

### 起動

```bash
swa start --app-devserver-url http://localhost:5173 --api-location api
```

別ターミナルで:

```bash
npm run dev
```

ブラウザで `http://localhost:4280` を開く。

## デプロイ

Azure Static Web Apps にデプロイ済みの場合、`main` ブランチへのプッシュで自動デプロイされます。

### 初回セットアップ（Azure Portal）

1. **SWA リソース作成**: Free Tier、GitHub リポジトリと連携
2. **App Settings に追加**:
   - `AZURE_STORAGE_CONNECTION_STRING`
   - `AZURE_TABLE_NAME` = `memories`
   - `AZURE_TABLE_PARTITION_KEY` = `memories`
3. **認証設定**: Authentication → Add provider: Google
4. **カスタムドメイン**: `memory.darkhaloes.com` → CNAME を DNS に追加

## API

| エンドポイント | メソッド | 機能 |
|---|---|---|
| `/api/memories` | GET | 一覧取得（プレビュー付き） |
| `/api/memories/{key}` | GET | 1件フル取得 |
| `/api/memories/{key}` | PUT | 更新 |
| `/api/memories/{key}` | POST | 新規作成 |
| `/api/memories/{key}` | DELETE | 削除 |
