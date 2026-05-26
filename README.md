# Memory Viewer

Azure Table Storage に保存された memory-MCP の記憶データをブラウザから閲覧・管理する Web アプリ。

- URL: https://brave-island-0b80cc300.7.azurestaticapps.net （カスタムドメイン設定後: https://memory.darkhaloes.com）

## 技術スタック

- **フロントエンド**: React 18 + Vite + TypeScript
- **バックエンド**: Azure Static Web Apps Managed Functions (Azure Functions v4 / TypeScript)
- **データストア**: Azure Table Storage（memory-MCP と共用）
- **認証**: SWA Built-in Authentication（Microsoft AAD）※ Free Tier

> **Note**: Google OAuth は SWA Free Tier では custom registration 非対応のため Microsoft AAD を使用。

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

### 起動

```bash
# ターミナル1
npm run dev

# ターミナル2
swa start --app-devserver-url http://localhost:5173 --api-location api
```

ブラウザで `http://localhost:4280` を開く。

## API

| エンドポイント | メソッド | 機能 |
|---|---|---|
| `/api/memories` | GET | 一覧取得（プレビュー付き） |
| `/api/memories/{key}` | GET | 1件フル取得 |
| `/api/memories/{key}` | PUT | 更新 |
| `/api/memories/{key}` | POST | 新規作成 |
| `/api/memories/{key}` | DELETE | 削除 |

## 許可ユーザー

`api/src/auth.ts` の `ALLOWED_EMAILS` に記載のメールアドレスのみ API アクセス可能:
- `taka@darkhaloes.com`
- `takayuki@darkhaloes.com`（Microsoft AAD ログイン用）

## 残タスク

- [ ] カスタムドメイン設定（`memory.darkhaloes.com` → CNAME）
- [ ] `darkhaloes.com` Landing Page へのリンク追加
