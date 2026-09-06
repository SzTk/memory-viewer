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
