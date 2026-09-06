---
name: memory-backup
description: memory-manager のバックアップ取得・復元をローカルスクリプト経由で行う。「メモリをバックアップして」「〇〇の記憶を元に戻して」「誤って上書き/削除された記憶を復旧して」等の依頼で使う。
---

# Memory Backup / Restore

memory-manager（Azure Table Storage 上の記憶データ）のバックアップ取得・復元を行うためのスキル。LLM がメモリ更新時に誤って上書き・削除してしまうリスクを軽減するためのもの。

## 前提

- リポジトリルートに `.env` が設定されていること（`AZURE_STORAGE_CONNECTION_STRING` 等）。無ければ `.env.example` を参照してユーザーに確認する。
- 依存パッケージがインストール済みであること（`npm install`）。

## 手順

1. **バックアップを取得する**
   ```bash
   npm run backup:export
   ```
   出力された `backups/memory-backup-<timestamp>.json` のパスを控える。既に十分新しいバックアップファイルがあれば、再取得しなくてもよい。

2. **差分を確認する**
   ```bash
   npm run backup:diff -- backups/memory-backup-<timestamp>.json
   ```
   各キーについて `identical` / `changed` / `deleted` のステータスと、`changed` の場合は行単位の差分が表示される。

3. **必ずユーザーに差分を提示し、復元対象キーについて明示的な承認を得る**
   - どのキーを、どの内容に戻すのかを具体的に説明すること。
   - ユーザーが承認したキーのみを次のステップに進める。

4. **承認されたキーのみ復元する**
   ```bash
   npm run backup:restore -- backups/memory-backup-<timestamp>.json --key <key1> --key <key2>
   ```
   実行結果（`✓`/`✗`）をユーザーに報告する。

## 安全上の注意（必須）

- diff 確認・ユーザーの明示的な承認なしに `backup:restore` を実行してはならない。
- ユーザーが指定していないキーを推測で `--key` に含めない。
- 復元は個別レコード単位のみ。バックアップファイル全体を無差別に復元しない。
