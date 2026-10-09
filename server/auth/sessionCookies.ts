import { Response } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './session';

const isSecureCookieContext = () =>
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.K_SERVICE) ||
  Boolean(process.env.CLOUD_RUN_JOB) ||
  Boolean(process.env.APP_URL?.startsWith('https://'));

export function setAuthenticationCookies(res: Response, accessToken: string, refreshToken?: string): void {
  const cookieAttrs = isSecureCookieContext()
    ? 'HttpOnly; SameSite=None; Secure; Partitioned'
    : 'HttpOnly; SameSite=Lax';
  const accessMaxAge = 15 * 60;
  const refreshMaxAge = 30 * 24 * 60 * 60;
  const cookies = [
    `${ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; Max-Age=${accessMaxAge}; Path=/; ${cookieAttrs}`,
  ];
  if (refreshToken) {
    cookies.push(
      `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; Max-Age=${refreshMaxAge}; Path=/api/auth; ${cookieAttrs}`,
    );
  }
  res.setHeader('Set-Cookie', cookies);
}

export function clearAuthenticationCookies(res: Response): void {
  const cookieAttrs = isSecureCookieContext()
    ? 'HttpOnly; SameSite=None; Secure; Partitioned'
    : 'HttpOnly; SameSite=Lax';
  res.setHeader('Set-Cookie', [
    `${ACCESS_COOKIE}=; Max-Age=0; Path=/; ${cookieAttrs}`,
    `${REFRESH_COOKIE}=; Max-Age=0; Path=/api/auth; ${cookieAttrs}`,
  ]);
}

export function readCookie(req: { headers: { cookie?: string } }, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const part = header.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.substring(name.length + 1)) : null;
}
