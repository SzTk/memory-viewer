import { HttpRequest } from '@azure/functions';

const ALLOWED_EMAIL = 'taka@darkhaloes.com';

interface ClientPrincipalClaim {
  typ: string;
  val: string;
}

interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
  claims?: ClientPrincipalClaim[];
}

/**
 * x-ms-client-principal ヘッダーをデコードしてユーザーのメールアドレスを確認する。
 * 許可されたメールアドレスでない場合は false を返す。
 */
export function isAuthorized(request: HttpRequest): boolean {
  const principalHeader = request.headers.get('x-ms-client-principal');
  if (!principalHeader) {
    // ローカル開発環境では認証ヘッダーがない場合を許容
    if (process.env.NODE_ENV === 'development' || process.env.SKIP_AUTH === 'true') {
      return true;
    }
    return false;
  }

  try {
    const decoded = Buffer.from(principalHeader, 'base64').toString('utf-8');
    const principal: ClientPrincipal = JSON.parse(decoded);

    // claims からメールアドレスを取得
    const emailClaim = principal.claims?.find(
      (c) => c.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'
                || c.typ === 'emails'
                || c.typ === 'email'
    );

    if (emailClaim) {
      return emailClaim.val === ALLOWED_EMAIL;
    }

    // userDetails にメールアドレスが入る場合もある
    return principal.userDetails === ALLOWED_EMAIL;
  } catch {
    return false;
  }
}
