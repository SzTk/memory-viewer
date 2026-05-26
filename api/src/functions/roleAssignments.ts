import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

const ALLOWED_EMAIL = 'taka@darkhaloes.com';

interface RoleAssignmentRequest {
  identityProvider?: string;
  userId?: string;
  userDetails?: string;  // 多くの場合メールアドレスが入る
  claims?: Array<{ typ: string; val: string }>;
}

async function roleAssignmentsHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const body = await request.json() as RoleAssignmentRequest;

    // userDetails（メールアドレス）で判定
    let email = body.userDetails ?? '';

    // userDetails に入らない場合は claims から取得
    if (!email && body.claims) {
      const emailClaim = body.claims.find(
        (c) =>
          c.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress' ||
          c.typ === 'emails' ||
          c.typ === 'email'
      );
      email = emailClaim?.val ?? '';
    }

    const roles = email === ALLOWED_EMAIL ? ['authenticated'] : [];

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles }),
    };
  } catch {
    // パース失敗時はアクセス拒否
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles: [] }),
    };
  }
}

app.http('roleAssignments', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'roleAssignments',
  handler: roleAssignmentsHandler,
});
