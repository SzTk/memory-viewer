import { HttpRequest } from '@azure/functions';

// 許可するメールアドレス（Microsoft AAD: takayuki@darkhaloes.com）
const ALLOWED_EMAILS = [
  'taka@darkhaloes.com',
  'takayuki@darkhaloes.com',
];

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
    if (process.env.SKIP_AUTH === 'true') {
      return true;
    }
    return false;
  }

  try {
    const decoded = Buffer.from(principalHeader, 'base64').toString('utf-8');
    const principal: ClientPrincipal = JSON.parse(decoded);

    const isAllowed = (email: string) =>
      ALLOWED_EMAILS.some((e) => e.toLowerCase() === email.toLowerCase());

    // userDetails にメールアドレスが入る場合（AAD・Google 共通）
    if (principal.userDetails && principal.userDetails.includes('@')) {
      return isAllowed(principal.userDetails);
    }

    // claims から取得（AAD の場合 preferred_username または email）
    if (principal.claims) {
      const emailClaim = principal.claims.find(
        (c) =>
          c.typ === 'preferred_username' ||
          c.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress' ||
          c.typ === 'emails' ||
          c.typ === 'email'
      );
      if (emailClaim) {
        return isAllowed(emailClaim.val);
      }
    }

    return false;
  } catch {
    return false;
  }
}
