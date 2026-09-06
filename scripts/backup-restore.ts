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
    } else {
      throw new Error(`Unrecognized argument: ${argv[i]}`)
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
