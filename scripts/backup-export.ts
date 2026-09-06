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
