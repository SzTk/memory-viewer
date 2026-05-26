import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { odata } from '@azure/data-tables';
import { tableClient, PARTITION_KEY } from '../tableClient';
import { isAuthorized } from '../auth';

async function memoriesHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  if (!isAuthorized(request)) {
    return { status: 403, body: JSON.stringify({ error: 'Forbidden' }) };
  }

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
      preview: string;
    }> = [];

    for await (const entity of entities) {
      const content = (entity.content as string) || '';
      memories.push({
        key: entity.rowKey as string,
        updated_at: (entity.updated_at as string) || '',
        created_at: (entity.created_at as string) || '',
        preview: content.slice(0, 100),
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

app.http('memories', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'memories',
  handler: memoriesHandler,
});
