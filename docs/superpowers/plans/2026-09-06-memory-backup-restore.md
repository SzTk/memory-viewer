# Memory Backup / Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner export all memory records to a JSON backup file and selectively restore individual records — from the memory-manager Web UI, and from Claude Code via local scripts — to mitigate the risk of an LLM accidentally overwriting or deleting a memory record.

**Architecture:** No new backend service or storage. The existing Azure Table Storage stays the single source of truth. Two independent entry points read/write it: (1) the memory-manager Web UI, via a `?full=true` extension to the existing `GET /api/memories` plus the existing `PUT`/`POST /api/memories/{key}`; (2) three standalone local CLI scripts (`backup-export`, `backup-diff`, `backup-restore`) that connect to Table Storage directly with the same connection string, invoked by Claude Code through a project-scoped Skill. Both entry points read/write the exact same backup JSON file format, so a backup taken by one can be restored by the other.

**Tech Stack:** React 18 + Vite + TypeScript (frontend), Azure Functions v4 / TypeScript (API), `@azure/data-tables`, `tsx` + `dotenv` (CLI scripts), `diff` (jsdiff, used both in the browser and in the CLI scripts for line-level diffing).

**Spec:** `docs/superpowers/specs/2026-09-06-memory-backup-restore-design.md`

---

## Notes for whoever executes this plan

- This project has no automated test framework (no vitest/jest anywhere in the repo). Per the approved design, verification for every task is **manual**: run a command or open the app and confirm the exact output described in each step. Do not introduce a test framework as part of this plan.
- Local frontend/backend verification uses the fast local loop: `cd api && npm start` (Azure Functions Core Tools, needs `api/local.settings.json` with `SKIP_AUTH=true`) in one terminal, `npm run dev` (Vite directly, proxies `/api/*` to `:7071`) in another, browsing `http://localhost:5173`. This bypasses SWA auth entirely, which is fine for local checks. The full `swa start` flow (real auth) is only exercised once, in the final task.
- CLI script verification needs a real `AZURE_STORAGE_CONNECTION_STRING` in a root `.env` file — the same value already used in `api/local.settings.json`. `.env` is already gitignored (see `.gitignore`).
- Follow existing code conventions exactly: the `odata` tagged template for Table Storage filters, the `isNotFoundError` 404-check pattern, Japanese UI copy, the CSS variable system in `src/index.css`.

---

### Task 1: Backend — `?full=true` support on `GET /api/memories`

**Files:**
- Modify: `api/src/functions/memories.ts`

- [ ] **Step 1: Add the `full` query flag and full-content branch**

Replace the body of `memoriesHandler` and the `memories` array construction:

```ts
async function memoriesHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  if (!isAuthorized(request)) {
    return { status: 403, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const full = request.query.get('full') === 'true';

  try {
    const entities = tableClient.listEntities({
      queryOptions: {
        filter: odata`PartitionKey eq ${PARTITION_KEY}`,
      },
    });

    const memories: Array<{
      key: string;
      updated_at: string;
      created_at: string;
      preview?: string;
      content?: string;
    }> = [];

    for await (const entity of entities) {
      const content = (entity.content as string) || '';
      memories.push({
        key: entity.rowKey as string,
        updated_at: (entity.updated_at as string) || '',
        created_at: (entity.created_at as string) || '',
        ...(full ? { content } : { preview: content.slice(0, 100) }),
      });
    }

    // updated_at の降順でソート
    memories.sort((a, b) => b.updated_at.localeCompare(a.updated_at));

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memories),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 500,
      body: JSON.stringify({ error: 'Internal Server Error', detail: message }),
    };
  }
}
```

The rest of the file (`app.http('memories', ...)` registration at the bottom) is unchanged.

- [ ] **Step 2: Build the API project**

Run: `cd api && npm run build`
Expected: TypeScript compiles with no errors, `api/dist/functions/memories.js` is regenerated.

- [ ] **Step 3: Verify both response shapes manually**

If `api/local.settings.json` doesn't exist yet, create it per `README.md`'s "環境変数の設定" section (include `"SKIP_AUTH": "true"` and your real `AZURE_STORAGE_CONNECTION_STRING`).

Run: `cd api && npm start` (leave running)

In another terminal:
```bash
curl -s http://localhost:7071/api/memories | head -c 300
curl -s "http://localhost:7071/api/memories?full=true" | head -c 300
```
Expected: the first call's JSON objects contain a `"preview"` field; the second call's objects contain a `"content"` field instead, with the full record text. Stop the `func start` process (Ctrl+C) when done.

- [ ] **Step 4: Commit**

```bash
git add api/src/functions/memories.ts
git commit -m "feat(api): add ?full=true to GET /api/memories for full-content export"
```

---

### Task 2: CLI scripts scaffolding — dependencies, `.env.example`, shared Table Storage client

**Files:**
- Create: `.env.example`
- Create: `scripts/lib/tableClient.ts`
- Modify: `package.json` (root)

- [ ] **Step 1: Install dependencies**

```bash
npm install -D @azure/data-tables tsx dotenv
npm install diff
npm install -D @types/diff
```

`@azure/data-tables`, `tsx`, `dotenv` are dev-only tools used by the local CLI scripts. `diff` is a runtime dependency because it's also imported by the frontend (Task 9); `@types/diff` is dev-only.

- [ ] **Step 2: Create `.env.example`**

```
AZURE_STORAGE_CONNECTION_STRING=
AZURE_TABLE_NAME=memories
AZURE_TABLE_PARTITION_KEY=memories
```

- [ ] **Step 3: Create the shared Table Storage client for scripts**

Create `scripts/lib/tableClient.ts`:

```ts
import { TableClient } from '@azure/data-tables'
import { config } from 'dotenv'

config()

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
const tableName = process.env.AZURE_TABLE_NAME || 'memories'

export const PARTITION_KEY = process.env.AZURE_TABLE_PARTITION_KEY || 'memories'

if (!connectionString) {
  throw new Error(
    'AZURE_STORAGE_CONNECTION_STRING is not set. Copy .env.example to .env and fill in the connection string.'
  )
}

export const tableClient = TableClient.fromConnectionString(connectionString, tableName)
```

- [ ] **Step 4: Verify the missing-env error path**

Run: `npx tsx -e "import('./scripts/lib/tableClient.ts')"`
Expected: it throws and prints `AZURE_STORAGE_CONNECTION_STRING is not set. Copy .env.example to .env and fill in the connection string.` (there is no `.env` yet, so this is the correct behavior).

- [ ] **Step 5: Create the real `.env`**

Copy `.env.example` to `.env` and fill in the same `AZURE_STORAGE_CONNECTION_STRING` value already used in `api/local.settings.json` (and adjust `AZURE_TABLE_NAME`/`AZURE_TABLE_PARTITION_KEY` if those differ from the defaults). This file is not committed (already covered by the existing `.env` entry in `.gitignore`).

Run: `npx tsx -e "import('./scripts/lib/tableClient.ts').then(() => console.log('OK'))"`
Expected: prints `OK` with no error.

- [ ] **Step 6: Commit**

```bash
git add .env.example scripts/lib/tableClient.ts package.json package-lock.json
git commit -m "feat: scaffold CLI backup scripts (dependencies, shared table client)"
```

---

### Task 3: Backup file format module

**Files:**
- Create: `scripts/lib/backupFile.ts`

- [ ] **Step 1: Write the module**

```ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface BackupMemoryEntry {
  key: string
  content: string
  created_at: string
  updated_at: string
}

export interface BackupFile {
  exported_at: string
  memories: BackupMemoryEntry[]
}

export function isBackupFile(value: unknown): value is BackupFile {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.exported_at !== 'string') return false
  if (!Array.isArray(v.memories)) return false
  return v.memories.every(
    (m) =>
      typeof m === 'object' &&
      m !== null &&
      typeof (m as BackupMemoryEntry).key === 'string' &&
      typeof (m as BackupMemoryEntry).content === 'string' &&
      typeof (m as BackupMemoryEntry).created_at === 'string' &&
      typeof (m as BackupMemoryEntry).updated_at === 'string'
  )
}

export function readBackupFile(path: string): BackupFile {
  const raw = readFileSync(path, 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${path} is not valid JSON`)
  }
  if (!isBackupFile(parsed)) {
    throw new Error(`${path} is not a valid backup file (missing exported_at/memories fields)`)
  }
  return parsed
}

export function writeBackupFile(path: string, data: BackupFile): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}
```

- [ ] **Step 2: Verify the module loads and the validators behave correctly**

Run:
```bash
npx tsx -e "
import { isBackupFile } from './scripts/lib/backupFile.ts'
console.log(isBackupFile({ exported_at: 'x', memories: [] }))
console.log(isBackupFile({ exported_at: 'x', memories: [{ key: 'k', content: 'c', created_at: 'a', updated_at: 'b' }] }))
console.log(isBackupFile({ memories: [] }))
console.log(isBackupFile(null))
"
```
Expected output (four lines): `true`, `true`, `false`, `false`.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/backupFile.ts
git commit -m "feat: add backup file read/write/validate module"
```

---

### Task 4: `backup-export` script

**Files:**
- Create: `scripts/backup-export.ts`
- Modify: `package.json` (root, `scripts` field)

- [ ] **Step 1: Write the script**

```ts
import { odata } from '@azure/data-tables'
import { tableClient, PARTITION_KEY } from './lib/tableClient'
import { writeBackupFile, BackupMemoryEntry } from './lib/backupFile'

async function main() {
  const entities = tableClient.listEntities({
    queryOptions: { filter: odata`PartitionKey eq ${PARTITION_KEY}` },
  })

  const memories: BackupMemoryEntry[] = []
  for await (const entity of entities) {
    memories.push({
      key: entity.rowKey as string,
      content: (entity.content as string) || '',
      created_at: (entity.created_at as string) || '',
      updated_at: (entity.updated_at as string) || '',
    })
  }

  const exportedAt = new Date().toISOString()
  const timestamp = exportedAt.replace(/[:.]/g, '-')
  const outPath = `backups/memory-backup-${timestamp}.json`

  writeBackupFile(outPath, { exported_at: exportedAt, memories })

  console.log(`Exported ${memories.length} memories to ${outPath}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
```

- [ ] **Step 2: Add the npm script**

In `package.json`, inside `"scripts"`, add:
```json
"backup:export": "tsx scripts/backup-export.ts"
```

- [ ] **Step 3: Run it and verify**

Run: `npm run backup:export`
Expected: prints `Exported N memories to backups/memory-backup-<timestamp>.json` where N matches the number of records you see in the Web UI or `curl http://localhost:7071/api/memories`.

Run: `cat backups/memory-backup-*.json | head -c 500`
Expected: an object with `"exported_at"` and a `"memories"` array whose entries have `key`, `content`, `created_at`, `updated_at`.

- [ ] **Step 4: Commit**

```bash
git add scripts/backup-export.ts package.json
git commit -m "feat: add backup-export CLI script"
```

---

### Task 5: Diff computation + `backup-diff` script

**Files:**
- Create: `scripts/lib/diffMemories.ts`
- Create: `scripts/backup-diff.ts`
- Modify: `package.json` (root, `scripts` field)

- [ ] **Step 1: Write the diff module**

```ts
import { diffLines } from 'diff'
import type { BackupMemoryEntry } from './backupFile'

export type MemoryStatus = 'identical' | 'changed' | 'deleted'

export interface MemoryDiffResult {
  key: string
  status: MemoryStatus
  backupContent: string
  currentContent?: string
}

export function computeMemoryDiffs(
  backupEntries: BackupMemoryEntry[],
  currentByKey: Map<string, string>
): MemoryDiffResult[] {
  return backupEntries.map((entry) => {
    const currentContent = currentByKey.get(entry.key)
    if (currentContent === undefined) {
      return { key: entry.key, status: 'deleted', backupContent: entry.content }
    }
    if (currentContent === entry.content) {
      return { key: entry.key, status: 'identical', backupContent: entry.content, currentContent }
    }
    return { key: entry.key, status: 'changed', backupContent: entry.content, currentContent }
  })
}

export function formatLineDiff(currentContent: string, backupContent: string): string {
  const parts = diffLines(currentContent, backupContent)
  return parts
    .map((part) => {
      const prefix = part.added ? '+ ' : part.removed ? '- ' : '  '
      return part.value
        .split('\n')
        .filter((line, i, arr) => !(i === arr.length - 1 && line === ''))
        .map((line) => `${prefix}${line}`)
        .join('\n')
    })
    .join('\n')
}
```

`formatLineDiff(current, backup)`: `+` lines are present in the backup but not in the current record (would be added by restoring), `-` lines are present now but not in the backup (would be removed by restoring).

- [ ] **Step 2: Write the diff script**

```ts
import { odata } from '@azure/data-tables'
import { tableClient, PARTITION_KEY } from './lib/tableClient'
import { readBackupFile } from './lib/backupFile'
import { computeMemoryDiffs, formatLineDiff } from './lib/diffMemories'

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: npm run backup:diff -- <path-to-backup-file>')
    process.exitCode = 1
    return
  }

  const backup = readBackupFile(filePath)

  const currentByKey = new Map<string, string>()
  const entities = tableClient.listEntities({
    queryOptions: { filter: odata`PartitionKey eq ${PARTITION_KEY}` },
  })
  for await (const entity of entities) {
    currentByKey.set(entity.rowKey as string, (entity.content as string) || '')
  }

  const results = computeMemoryDiffs(backup.memories, currentByKey)

  for (const result of results) {
    console.log(`\n=== ${result.key} [${result.status}] ===`)
    if (result.status === 'changed') {
      console.log(formatLineDiff(result.currentContent!, result.backupContent))
    } else if (result.status === 'deleted') {
      console.log('(現在は存在しません。復元すると新規作成されます)')
    } else {
      console.log('(変更なし)')
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
```

- [ ] **Step 3: Add the npm script**

In `package.json`, inside `"scripts"`, add:
```json
"backup:diff": "tsx scripts/backup-diff.ts"
```

- [ ] **Step 4: Verify with a real change**

Pick any existing memory key that is safe to touch temporarily (e.g. one you can restore afterwards) and edit its content through the Web UI (`/memory/<key>/edit`) — add a line, save.

Run: `npm run backup:diff -- backups/memory-backup-<timestamp-from-task-4>.json`
Expected: the edited key's block shows `[changed]` with `-` lines for what you added and (if you removed anything) `+` lines for the original content; every other key shows `[identical]` with `(変更なし)`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/diffMemories.ts scripts/backup-diff.ts package.json
git commit -m "feat: add backup-diff CLI script"
```

---

### Task 6: `backup-restore` script

**Files:**
- Create: `scripts/backup-restore.ts`
- Modify: `package.json` (root, `scripts` field)

- [ ] **Step 1: Write the script**

```ts
import { tableClient, PARTITION_KEY } from './lib/tableClient'
import { readBackupFile } from './lib/backupFile'

function parseArgs(argv: string[]): { filePath?: string; keys: string[] } {
  const filePath = argv[0]
  const keys: string[] = []
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--key') {
      const value = argv[i + 1]
      if (!value) {
        throw new Error('--key requires a value')
      }
      keys.push(value)
      i++
    }
  }
  return { filePath, keys }
}

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    (err as { statusCode: number }).statusCode === 404
  )
}

async function restoreOne(key: string, content: string): Promise<void> {
  const now = new Date().toISOString()
  let exists = true
  try {
    await tableClient.getEntity(PARTITION_KEY, key)
  } catch (err: unknown) {
    if (isNotFoundError(err)) {
      exists = false
    } else {
      throw err
    }
  }

  if (exists) {
    await tableClient.updateEntity(
      { partitionKey: PARTITION_KEY, rowKey: key, content, updated_at: now },
      'Merge'
    )
  } else {
    await tableClient.createEntity({
      partitionKey: PARTITION_KEY,
      rowKey: key,
      content,
      created_at: now,
      updated_at: now,
    })
  }
}

async function main() {
  const { filePath, keys } = parseArgs(process.argv.slice(2))
  if (!filePath || keys.length === 0) {
    console.error('Usage: npm run backup:restore -- <path-to-backup-file> --key <key> [--key <key> ...]')
    process.exitCode = 1
    return
  }

  const backup = readBackupFile(filePath)
  const byKey = new Map(backup.memories.map((m) => [m.key, m.content]))

  let hasFailure = false
  for (const key of keys) {
    const content = byKey.get(key)
    if (content === undefined) {
      console.error(`✗ ${key}: バックアップファイルに存在しません`)
      hasFailure = true
      continue
    }
    try {
      await restoreOne(key, content)
      console.log(`✓ ${key}: 復元しました`)
    } catch (err) {
      console.error(`✗ ${key}: ${err instanceof Error ? err.message : err}`)
      hasFailure = true
    }
  }

  if (hasFailure) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
```

- [ ] **Step 2: Add the npm script**

In `package.json`, inside `"scripts"`, add:
```json
"backup:restore": "tsx scripts/backup-restore.ts"
```

- [ ] **Step 3: Verify the restore succeeds and reverts the edit from Task 5**

Using the same file and key from Task 5's Step 4:
```bash
npm run backup:restore -- backups/memory-backup-<timestamp-from-task-4>.json --key "<that-key>"
```
Expected: prints `✓ <that-key>: 復元しました`.

Run: `npm run backup:diff -- backups/memory-backup-<timestamp-from-task-4>.json`
Expected: that key now shows `[identical]` again (the edit was reverted).

- [ ] **Step 4: Verify the failure path**

```bash
npm run backup:restore -- backups/memory-backup-<timestamp-from-task-4>.json --key "definitely-not-a-real-key-xyz"
echo "exit code: $?"
```
Expected: prints `✗ definitely-not-a-real-key-xyz: バックアップファイルに存在しません` and `exit code: 1`.

- [ ] **Step 5: Commit**

```bash
git add scripts/backup-restore.ts package.json
git commit -m "feat: add backup-restore CLI script"
```

---

### Task 7: Ignore local backup output

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add `backups/` to `.gitignore`**

Current `.gitignore`:
```
node_modules/
dist/
api/node_modules/
api/dist/
.env
.env.local
*.local
```

Append `backups/` as a new line at the end.

- [ ] **Step 2: Verify it's ignored**

Run: `git status --short`
Expected: `backups/` and the `memory-backup-*.json` files created in earlier tasks do NOT appear in the output.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore local backups/ output directory"
```

---

### Task 8: Web UI — export page, routing, header link

**Files:**
- Create: `src/components/Backup.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Create the Backup page (export only for now)**

```tsx
import { useState } from 'react'

interface FullMemory {
  key: string
  content: string
  created_at: string
  updated_at: string
}

export default function Backup() {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      const res = await fetch('/api/memories?full=true')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const memories: FullMemory[] = await res.json()

      const exportedAt = new Date().toISOString()
      const backup = { exported_at: exportedAt, memories }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `memory-backup-${exportedAt.replace(/[:.]/g, '-')}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div className="card">
        <div className="editor-title">💾 エクスポート</div>
        {error && <div className="error-banner">{error}</div>}
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          全ての記憶をJSONファイルとしてダウンロードします。
        </p>
        <button className="btn-save" onClick={handleExport} disabled={exporting}>
          {exporting ? 'エクスポート中...' : '全件エクスポート'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire up the route and header link**

Replace the full contents of `src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import MemoryList from './components/MemoryList'
import MemoryDetail from './components/MemoryDetail'
import MemoryEditor from './components/MemoryEditor'
import Backup from './components/Backup'

function Header() {
  const navigate = useNavigate()
  return (
    <header className="header">
      <Link to="/" className="header-logo">
        🧠 Memory Viewer
      </Link>
      <div className="header-spacer" />
      <Link to="/backup" className="header-link">
        💾 バックアップ
      </Link>
      <button className="btn-new" onClick={() => navigate('/memory/new')}>
        + 新規作成
      </button>
    </header>
  )
}

function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <Header />
        <main className="main">
          <Routes>
            <Route path="/" element={<MemoryList />} />
            <Route path="/backup" element={<Backup />} />
            <Route path="/memory/new" element={<MemoryEditor mode="create" />} />
            <Route path="/memory/:key" element={<MemoryDetail />} />
            <Route path="/memory/:key/edit" element={<MemoryEditor mode="edit" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 3: Add the header link style**

Append to `src/index.css`:

```css
/* Header link (Backup) */
.header-link {
  background: var(--surface2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.header-link:hover {
  border-color: var(--accent);
  color: var(--accent);
}
```

- [ ] **Step 4: Verify in the browser**

Terminal 1: `cd api && npm start`
Terminal 2: `npm run dev`

Open `http://localhost:5173/`. Expected: header shows a "💾 バックアップ" link next to "+ 新規作成". Click it, expected: navigates to `/backup` showing the export card. Click "全件エクスポート". Expected: a file named `memory-backup-<timestamp>.json` downloads; opening it shows `exported_at` and a `memories` array with `content` fields (not `preview`).

- [ ] **Step 5: Commit**

```bash
git add src/components/Backup.tsx src/App.tsx src/index.css
git commit -m "feat(web): add /backup page with export"
```

---

### Task 9: Web UI — restore: upload, diff, selective restore

**Files:**
- Create: `src/lib/backupDiff.ts`
- Modify: `src/components/Backup.tsx`

- [ ] **Step 1: Create the shared frontend diff/validation module**

```ts
import { diffLines, Change } from 'diff'

export interface FullMemory {
  key: string
  content: string
  created_at: string
  updated_at: string
}

export interface BackupFile {
  exported_at: string
  memories: FullMemory[]
}

export type MemoryStatus = 'identical' | 'changed' | 'deleted'

export interface MemoryDiffResult {
  key: string
  status: MemoryStatus
  backupContent: string
  currentContent?: string
}

export function isBackupFile(value: unknown): value is BackupFile {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.exported_at !== 'string') return false
  if (!Array.isArray(v.memories)) return false
  return v.memories.every(
    (m) =>
      typeof m === 'object' &&
      m !== null &&
      typeof (m as FullMemory).key === 'string' &&
      typeof (m as FullMemory).content === 'string' &&
      typeof (m as FullMemory).created_at === 'string' &&
      typeof (m as FullMemory).updated_at === 'string'
  )
}

export function computeMemoryDiffs(
  backupMemories: FullMemory[],
  current: FullMemory[]
): MemoryDiffResult[] {
  const currentByKey = new Map(current.map((m) => [m.key, m.content]))
  return backupMemories.map((entry) => {
    const currentContent = currentByKey.get(entry.key)
    if (currentContent === undefined) {
      return { key: entry.key, status: 'deleted', backupContent: entry.content }
    }
    if (currentContent === entry.content) {
      return { key: entry.key, status: 'identical', backupContent: entry.content, currentContent }
    }
    return { key: entry.key, status: 'changed', backupContent: entry.content, currentContent }
  })
}

export function computeLineDiff(currentContent: string, backupContent: string): Change[] {
  return diffLines(currentContent, backupContent)
}
```

- [ ] **Step 2: Extend `Backup.tsx` with the restore section**

Replace the full contents of `src/components/Backup.tsx`:

```tsx
import { useState, type ChangeEvent } from 'react'
import type { Change } from 'diff'
import {
  BackupFile,
  FullMemory,
  MemoryDiffResult,
  isBackupFile,
  computeMemoryDiffs,
  computeLineDiff,
} from '../lib/backupDiff'

export default function Backup() {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [diffResults, setDiffResults] = useState<MemoryDiffResult[] | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreResults, setRestoreResults] = useState<Record<string, 'ok' | 'error'> | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      const res = await fetch('/api/memories?full=true')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const memories: FullMemory[] = await res.json()

      const exportedAt = new Date().toISOString()
      const backup: BackupFile = { exported_at: exportedAt, memories }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `memory-backup-${exportedAt.replace(/[:.]/g, '-')}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export')
    } finally {
      setExporting(false)
    }
  }

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    setDiffResults(null)
    setSelectedKeys(new Set())
    setRestoreResults(null)
    setLoadingDiff(true)

    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('ファイルが正しいJSON形式ではありません')
      }
      if (!isBackupFile(parsed)) {
        throw new Error('バックアップファイルの形式が正しくありません')
      }

      const res = await fetch('/api/memories?full=true')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const current: FullMemory[] = await res.json()

      setDiffResults(computeMemoryDiffs(parsed.memories, current))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read backup file')
    } finally {
      setLoadingDiff(false)
    }
  }

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleRestore() {
    if (!diffResults) return
    setRestoring(true)
    setError(null)
    const results: Record<string, 'ok' | 'error'> = {}

    for (const result of diffResults) {
      if (!selectedKeys.has(result.key)) continue
      try {
        const method = result.status === 'deleted' ? 'POST' : 'PUT'
        const res = await fetch(`/api/memories/${encodeURIComponent(result.key)}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: result.backupContent }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        results[result.key] = 'ok'
      } catch {
        results[result.key] = 'error'
      }
    }

    setRestoreResults(results)
    setRestoring(false)
  }

  function renderDiff(parts: Change[]) {
    return (
      <pre className="diff-view">
        {parts.map((part, i) => {
          const cls = part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-unchanged'
          const prefix = part.added ? '+' : part.removed ? '-' : ' '
          const lines = part.value
            .split('\n')
            .filter((line, idx, arr) => !(idx === arr.length - 1 && line === ''))
          return lines.map((line, j) => (
            <div key={`${i}-${j}`} className={cls}>
              {prefix} {line}
            </div>
          ))
        })}
      </pre>
    )
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="editor-title">💾 エクスポート</div>
        {error && <div className="error-banner">{error}</div>}
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          全ての記憶をJSONファイルとしてダウンロードします。
        </p>
        <button className="btn-save" onClick={handleExport} disabled={exporting}>
          {exporting ? 'エクスポート中...' : '全件エクスポート'}
        </button>
      </div>

      <div className="card">
        <div className="editor-title">♻️ 復元</div>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          バックアップファイルをアップロードして、個別に記憶を復元できます。
        </p>
        <input type="file" accept="application/json" onChange={handleFileSelect} disabled={loadingDiff} />

        {loadingDiff && (
          <div className="loading">
            <div className="spinner" />
            差分を確認中...
          </div>
        )}

        {diffResults && (
          <div style={{ marginTop: '1rem' }}>
            {diffResults.map((result) => (
              <div key={result.key} className="restore-row">
                <label className="restore-row-header">
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(result.key)}
                    onChange={() => toggleKey(result.key)}
                  />
                  <span className="memory-item-key">{result.key}</span>
                  <span className={`restore-status restore-status-${result.status}`}>
                    {result.status === 'identical' && '変更なし'}
                    {result.status === 'changed' && '変更あり'}
                    {result.status === 'deleted' && '現在は存在しません（新規作成されます）'}
                  </span>
                  {restoreResults?.[result.key] === 'ok' && (
                    <span className="success-banner" style={{ padding: '0.15rem 0.5rem' }}>
                      復元しました
                    </span>
                  )}
                  {restoreResults?.[result.key] === 'error' && (
                    <span className="error-banner" style={{ padding: '0.15rem 0.5rem' }}>
                      失敗しました
                    </span>
                  )}
                </label>
                {result.status !== 'identical' && (
                  <details>
                    <summary>差分を表示</summary>
                    {renderDiff(computeLineDiff(result.currentContent ?? '', result.backupContent))}
                  </details>
                )}
              </div>
            ))}

            <button
              className="btn-save"
              style={{ marginTop: '1rem' }}
              onClick={handleRestore}
              disabled={restoring || selectedKeys.size === 0}
            >
              {restoring ? '復元中...' : `選択した${selectedKeys.size}件を復元`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Manual verification**

Terminal 1: `cd api && npm start`
Terminal 2: `npm run dev`

1. On `http://localhost:5173/backup`, use a backup file exported earlier (e.g. from Task 4/8). Edit one existing memory's content via `/memory/<key>/edit` (add a line), leave others untouched.
2. On `/backup`, use the file input to upload that backup file. Expected: a list appears, one row per key in the backup; the edited key shows `変更あり`, all others show `変更なし`.
3. Expand "差分を表示" on the changed row. Expected: added/removed lines rendered in green/red matching what you edited.
4. Check only the changed key's checkbox, click "選択した1件を復元". Expected: button shows "復元中..." then the row shows a "復元しました" badge.
5. Reload `/memory/<key>` for that key. Expected: content matches the original backup (your edit was reverted).

- [ ] **Step 4: Commit**

```bash
git add src/lib/backupDiff.ts src/components/Backup.tsx
git commit -m "feat(web): add restore flow with diff review and selective restore"
```

---

### Task 10: Restore UI styling

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Append the restore/diff styles**

```css
/* Backup / Restore rows */
.restore-row {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  background: var(--surface2);
}

.restore-row-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  flex-wrap: wrap;
}

.restore-status {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.restore-status-changed {
  color: var(--accent);
}

.restore-status-deleted {
  color: var(--danger);
}

.restore-row details {
  margin-top: 0.5rem;
}

.restore-row summary {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.diff-view {
  font-family: var(--mono);
  font-size: 0.8rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem;
  margin-top: 0.5rem;
  overflow-x: auto;
  white-space: pre-wrap;
}

.diff-added {
  color: var(--success);
}

.diff-removed {
  color: var(--danger);
}

.diff-unchanged {
  color: var(--text-muted);
}
```

- [ ] **Step 2: Verify visually**

Repeat Task 9 Step 3's flow. Expected: the diff block has a monospace font, added lines are green, removed lines are red, unchanged context lines are muted gray; each restore row has a visible border separating it from the next.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "style: add restore row and diff view styles"
```

---

### Task 11: Claude Code Skill for backup/restore

**Files:**
- Create: `.claude/skills/memory-backup/SKILL.md`

- [ ] **Step 1: Write the skill**

```markdown
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
```

- [ ] **Step 2: Verify it's discoverable**

Run: `cat .claude/skills/memory-backup/SKILL.md | head -5`
Expected: shows the frontmatter with `name: memory-backup`. (The skill becomes available to Claude Code the next time skills are loaded/reloaded for this project.)

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/memory-backup/SKILL.md
git commit -m "docs: add memory-backup Skill for Claude Code"
```

---

### Task 12: README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "バックアップ・復元" section**

In `README.md`, insert a new section right after the "## API" table and before "## 許可ユーザー":

```markdown
## バックアップ・復元

LLM による誤った上書き・削除に備え、記憶データのバックアップ・復元機能を用意している。

- Web UI: `/backup` 画面から全件エクスポート（JSONダウンロード）、および個別レコード単位の復元（差分確認付き）ができる。
- CLI（Claude Code などのエージェントから利用）:
  ```bash
  npm run backup:export                                                   # バックアップ取得
  npm run backup:diff -- backups/memory-backup-<timestamp>.json           # 差分確認
  npm run backup:restore -- backups/memory-backup-<timestamp>.json --key <key>  # 個別復元
  ```
  実行には `.env`（`.env.example` を参照）に `AZURE_STORAGE_CONNECTION_STRING` 等の設定が必要。
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document backup/restore feature in README"
```

---

### Task 13: Final end-to-end verification (real auth flow)

**Files:** none (verification only)

- [ ] **Step 1: Run the full SWA-authenticated stack**

Terminal 1: `npm run dev`
Terminal 2: `swa start --app-devserver-url http://localhost:5173 --api-location api`

Open `http://localhost:4280`, log in via the AAD flow if prompted.

- [ ] **Step 2: Exercise the whole flow through real auth**

1. Go to `/backup`, click "全件エクスポート" — expect a JSON file to download.
2. Edit one memory's content via the normal UI.
3. On `/backup`, upload the file downloaded in step 1 — expect the edited key to show `変更あり` with a correct diff, everything else `変更なし`.
4. Select that key, click restore — expect a "復元しました" badge, and the memory detail page to show the reverted content.

Expected: every step behaves identically to the unauthenticated local checks in Tasks 8–10 — SWA auth doesn't interfere with the new endpoints or flows.

- [ ] **Step 3: Confirm CLI scripts still work against the same deployed data**

```bash
npm run backup:export
npm run backup:diff -- backups/memory-backup-<latest-timestamp>.json
```
Expected: the diff report shows all keys as `[identical]` (Web UI and CLI are looking at the same Table Storage data).

No commit needed for this task — it only verifies work already committed in Tasks 1–12.
