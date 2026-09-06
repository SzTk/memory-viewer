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
