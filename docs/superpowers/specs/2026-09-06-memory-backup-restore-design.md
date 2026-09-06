# メモリ バックアップ・復元機能 — 設計文書

## 背景・目的

memory-mcp への追記時に、LLM が誤ってレコードを上書き・削除してしまう事故が発生した。今回はチャットコンテキストから内容を復旧できたが、恒常的な対策ではない。

定期的にバックアップを取得し、必要なときに個別レコード単位で復元できるようにすることで、この種の事故のリスクを下げる。

- 個人利用（Takayuki Suzuki 専用）のツールであるため、実装はシンプルさを優先する。
- Web UI（memory-manager）とエージェント（Claude Code 等の CLI）の両方から、バックアップ取得・復元操作ができるようにする。

---

## 全体アーキテクチャ

新しいバックエンドサーバーやストレージは追加しない。既存の Azure Table Storage を唯一のデータソースとし、2つの入口（Web UI / ローカルCLIスクリプト）を用意する。

```
                    ┌─────────────────────┐
                    │  Azure Table Storage │
                    │   (既存, 変更なし)     │
                    └───────┬─────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                                        │
┌───────▼────────┐                     ┌─────────▼──────────┐
│ memory-manager  │                     │  scripts/ (ローカルCLI) │
│ Web UI          │                     │  Claude Code から実行  │
│ /api/memories   │                     │  接続文字列で直接接続    │
│ (?full=true)    │                     └─────────┬──────────┘
└───────┬────────┘                               │
        │                                 .claude/skills/memory-backup
   ブラウザダウンロード                       (使い方・安全確認手順を定義)
   /backup 画面で復元
```

- Web UI と CLI スクリプトは、同一形式のバックアップ JSON ファイルを読み書きする。どちらで取得したバックアップも、どちらでも復元に使える。
- CLI スクリプトはデプロイ済みの `/api/*` を経由せず、Table Storage に直接接続する（Web の公開APIに新しい認証経路を追加しない）。

---

## Web UI: エクスポート・復元機能

### API 変更

既存の `GET /api/memories`（`api/src/functions/memories.ts`）に `?full=true` クエリパラメータを追加する。

- 通常（クエリなし）: 従来どおり `preview`（先頭100字）を返す。
- `?full=true`: `preview` の代わりに `content` フル文字列を返す。エクスポート機能と、復元画面での現在値取得（diff用）の両方に使う。

新規エンドポイントは追加しない。既存の `PUT` / `POST /api/memories/{key}` をそのまま復元に再利用する。

### フロントエンド

新規ルート `/backup` を追加し、`Backup.tsx` を新設する（`App.tsx` の `Header` に「💾 バックアップ」リンクを追加）。

**エクスポート機能**
- 「全件エクスポート」ボタンを押すと `GET /api/memories?full=true` を呼び出し、レスポンスを [バックアップファイル形式](#バックアップファイル形式) に整形して Blob 化し、`memory-backup-<ISO8601>.json` としてブラウザダウンロードさせる。
- サーバー側にファイルは保存しない。

**復元機能**
1. ファイル入力でローカルのバックアップ JSON をアップロード（クライアント側で `JSON.parse`）。
2. スキーマ検証（`memories` 配列の有無、各要素の必須フィールド）。不正な場合はエラー表示のみで中断。
3. `GET /api/memories?full=true` で現在の全件を取得。
4. バックアップ内の各レコードについて、現在値と突き合わせて状態を判定:
   - `identical`: 内容が同一
   - `changed`: 内容が異なる（diff 表示）
   - `deleted`: 現在は存在しない（復元すると新規作成扱い）
5. 各レコードをチェックボックス付きで一覧表示。**デフォルトは全て未選択**（誤操作防止）。`changed` / `deleted` の行は展開すると diff（行単位差分、追加行=緑・削除行=赤）を表示。行単位差分の算出には `diff` npm パッケージ（`package.json` に新規 dependency として追加）を使う。
6. 「選択したレコードを復元」ボタンで、選択された各キーについて、現在存在すれば `PUT`、存在しなければ `POST` を呼び出す。
7. 実行後、キーごとの成功・失敗を一覧表示する。

---

## エージェント（Claude Code / CLI）連携

Web UI とは別に、リポジトリ直下に `scripts/` を追加し、Claude Code が Bash 経由でローカル実行する。

### 追加スクリプト

| スクリプト | 役割 |
|---|---|
| `scripts/backup-export.ts` | 全レコードを取得し `backups/memory-backup-<timestamp>.json` を出力する |
| `scripts/backup-diff.ts <file>` | バックアップファイルと現在の Table Storage の内容を比較し、キーごとに `identical` / `changed`（diff付き） / `deleted` を標準出力に表示する |
| `scripts/backup-restore.ts <file> --key <key> [--key <key> ...]` | 指定したキーのみをバックアップ内容で復元する（現在存在すれば更新、存在しなければ新規作成） |

- Table Storage への接続は `api/src/tableClient.ts` と同様の方法で、接続文字列を使い `@azure/data-tables` で直接接続する。
- 接続文字列はリポジトリルートの `.env`（新規、`.gitignore` 対象）から読み込む。未設定の場合は起動直後にエラー終了する。
- ルートの `package.json` に devDependency として `@azure/data-tables`, `tsx`, `dotenv` を追加し、以下の npm script を用意する:
  ```
  "backup:export": "tsx scripts/backup-export.ts",
  "backup:diff": "tsx scripts/backup-diff.ts",
  "backup:restore": "tsx scripts/backup-restore.ts"
  ```
- 出力される `backups/*.json` は Web UI のエクスポート形式と完全に同一。
- `backups/` ディレクトリは `.gitignore` に追加し、個人の記憶データをリポジトリにコミットしない。

### Skill: `.claude/skills/memory-backup/SKILL.md`（リポジトリにチェックイン、プロジェクトスコープ）

このプロジェクト専用スキルとして追加する。内容:

- **発火条件**: 「メモリをバックアップして」「〇〇の記憶を元に戻して」「誤って上書き/削除された記憶を復旧して」など。
- **手順**:
  1. `npm run backup:export` で最新バックアップを取得する（または既存の最新バックアップファイルの有無を確認する）。
  2. `npm run backup:diff -- <file>` で現在値との差分を確認する。
  3. 差分を必ずユーザーに提示し、復元対象キーについて明示的な承認を得る。
  4. 承認されたキーのみ `npm run backup:restore -- <file> --key <key> ...` を実行する。
- **安全上の注意（必須事項として明記）**: diff 確認・ユーザーの明示的な承認なしに復元を実行してはならない。ユーザー承認を経ない一括復元・無差別な `--key` 指定は禁止。

---

## バックアップファイル形式（Web UI / CLI 共通）

```json
{
  "exported_at": "2026-09-06T12:34:56.000Z",
  "memories": [
    {
      "key": "memory_profile_tech",
      "content": "## Takayuki の仕事背景...",
      "created_at": "2026-05-25T10:00:00.000Z",
      "updated_at": "2026-05-25T10:12:45.000Z"
    }
  ]
}
```

ファイル名は `memory-backup-<ISO8601タイムスタンプ>.json` とする（Web UIのダウンロード名、CLIの出力ファイル名とも共通の命名規則）。

---

## エラーハンドリング・エッジケース

- **バックアップファイルの形式不正**（JSON parse 失敗、`memories` 配列が無い、必須フィールド欠落等）: Web UI・CLI スクリプトともにバリデーションし、明確なエラーメッセージを表示して中断する。
- **復元対象キーが現在は存在しない**（削除済み）: `POST` で新規作成扱いにする。
- **復元対象キーが現在は存在し、内容が同一**: diff 上で「変更なし」と表示する。選択は可能だが、デフォルトでは選択されない。
- **復元 API 呼び出しの一部失敗**（ネットワークエラー等）: Web UI はキーごとに成功/失敗を表示する。CLI スクリプトは失敗したキーをエラーメッセージとともに非ゼロ終了コードで報告し、Claude Code がユーザーに再試行を提案できるようにする。
- **`.env` 未設定でスクリプト実行**: 接続文字列が無い場合は起動直後にエラーで終了する。

---

## 動作確認方法

本プロジェクトの既存方針（自動テストフレームワーク未導入）に合わせ、自動テストは追加せず手動確認とする。

- **Web UI**: `swa start` のローカル環境で、①エクスポートボタンで JSON がダウンロードされることを確認 ②既存レコード1件をわざと編集 ③そのバックアップファイルをアップロードして復元画面に正しく diff が表示されることを確認 ④復元実行後、Table Storage の内容が実際に戻ることを確認する。
- **CLI スクリプト**: ローカルで `.env` を設定し、`npm run backup:export` → `npm run backup:diff -- <file>` → 1件をわざと編集 → `npm run backup:restore -- <file> --key <key>` で元に戻ることを確認する。
- **Claude Code / Skill**: 実際に「〇〇の記憶を元に戻して」と依頼し、Skill が diff 確認 → ユーザー承認 → restore の順で正しく実行されることを確認する。

---

## ディレクトリ構成（追加分）

```
memory-manager/
├── .claude/
│   └── skills/
│       └── memory-backup/
│           └── SKILL.md            # 新規
├── scripts/                        # 新規
│   ├── backup-export.ts
│   ├── backup-diff.ts
│   └── backup-restore.ts
├── backups/                         # 新規（.gitignore 対象、バックアップ出力先）
├── src/
│   └── components/
│       └── Backup.tsx              # 新規
├── api/src/functions/
│   └── memories.ts                 # 変更（?full=true 対応）
├── .env                             # 新規（.gitignore 対象、接続文字列）
└── .gitignore                       # 変更（backups/, .env 追加）
```

---

## スコープ外（今回は対応しない）

- 自動スケジュールバックアップ（Azure Functions Timer Trigger 等によるサーバー側の定期バックアップ）は対象外。将来必要になれば別途検討する。
- 復元の「全件一括復元」は対象外。個別レコード単位の選択復元のみ実装する。
- リモート（別マシン）から CLI スクリプトを実行するケースは対象外。Claude Code がユーザー自身のマシン上で動作する前提とする。
