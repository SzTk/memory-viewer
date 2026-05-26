import { TableClient } from '@azure/data-tables';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const tableName = process.env.AZURE_TABLE_NAME || 'memories';

export const PARTITION_KEY = process.env.AZURE_TABLE_PARTITION_KEY || 'memories';

if (!connectionString) {
  throw new Error('AZURE_STORAGE_CONNECTION_STRING environment variable is not set');
}

export const tableClient = TableClient.fromConnectionString(connectionString, tableName);

export interface MemoryEntity {
  partitionKey: string;
  rowKey: string;
  content: string;
  created_at: string;
  updated_at: string;
}
