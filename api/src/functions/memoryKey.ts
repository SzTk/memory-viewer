import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { tableClient, PARTITION_KEY } from '../tableClient';
import { isAuthorized } from '../auth';

async function memoryKeyHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  if (!isAuthorized(request)) {
    return { status: 403, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const key = request.params['key'];
  if (!key) {
    return { status: 400, body: JSON.stringify({ error: 'key is required' }) };
  }

  try {
    switch (request.method) {
      case 'GET':
        return await getMemory(key);

      case 'PUT':
        return await updateMemory(request, key);

      case 'POST':
        return await createMemory(request, key);

      case 'DELETE':
        return await deleteMemory(key);

      default:
        return { status: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 500,
      body: JSON.stringify({ error: 'Internal Server Error', detail: message }),
    };
  }
}

async function getMemory(key: string): Promise<HttpResponseInit> {
  try {
    const entity = await tableClient.getEntity(PARTITION_KEY, key);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: entity.rowKey,
        content: entity.content,
        created_at: entity.created_at,
        updated_at: entity.updated_at,
      }),
    };
  } catch (err: unknown) {
    if (isNotFoundError(err)) {
      return { status: 404, body: JSON.stringify({ error: 'Not Found' }) };
    }
    throw err;
  }
}

async function updateMemory(request: HttpRequest, key: string): Promise<HttpResponseInit> {
  const body = await request.json() as { content?: string };
  if (typeof body.content !== 'string') {
    return { status: 400, body: JSON.stringify({ error: 'content is required' }) };
  }

  // 既存エントリの存在確認
  try {
    await tableClient.getEntity(PARTITION_KEY, key);
  } catch (err: unknown) {
    if (isNotFoundError(err)) {
      return { status: 404, body: JSON.stringify({ error: 'Not Found' }) };
    }
    throw err;
  }

  const now = new Date().toISOString();
  await tableClient.updateEntity(
    {
      partitionKey: PARTITION_KEY,
      rowKey: key,
      content: body.content,
      updated_at: now,
    },
    'Merge'
  );

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, updated_at: now }),
  };
}

async function createMemory(request: HttpRequest, key: string): Promise<HttpResponseInit> {
  const body = await request.json() as { content?: string };
  if (typeof body.content !== 'string') {
    return { status: 400, body: JSON.stringify({ error: 'content is required' }) };
  }

  // 既存エントリの存在確認（重複チェック）
  try {
    await tableClient.getEntity(PARTITION_KEY, key);
    return { status: 409, body: JSON.stringify({ error: 'Conflict: key already exists' }) };
  } catch (err: unknown) {
    if (!isNotFoundError(err)) {
      throw err;
    }
  }

  const now = new Date().toISOString();
  await tableClient.createEntity({
    partitionKey: PARTITION_KEY,
    rowKey: key,
    content: body.content,
    created_at: now,
    updated_at: now,
  });

  return {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, created_at: now }),
  };
}

async function deleteMemory(key: string): Promise<HttpResponseInit> {
  try {
    await tableClient.deleteEntity(PARTITION_KEY, key);
    return { status: 204 };
  } catch (err: unknown) {
    if (isNotFoundError(err)) {
      return { status: 404, body: JSON.stringify({ error: 'Not Found' }) };
    }
    throw err;
  }
}

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    (err as { statusCode: number }).statusCode === 404
  );
}

app.http('memoryKey', {
  methods: ['GET', 'PUT', 'POST', 'DELETE'],
  authLevel: 'anonymous',
  route: 'memories/{key}',
  handler: memoryKeyHandler,
});
