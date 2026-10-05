import { Response } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './session';

const isProduction = () => process.env.NODE_ENV === 'production';

export function setAuthenticationCookies(res: Response, accessToken: string, refreshToken?: string): void {
  const secure = isProduction() ? '; Secure' : '';
  const accessMaxAge = 15 * 60;
  const refreshMaxAge = 30 * 24 * 60 * 60;
  const cookies = [
    `${ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; Max-Age=${accessMaxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`,
  ];
  if (refreshToken) {
    cookies.push(
      `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; Max-Age=${refreshMaxAge}; Path=/api/auth; HttpOnly; SameSite=Lax${secure}`,
    );
  }
  res.setHeader('Set-Cookie', cookies);
}

export function clearAuthenticationCookies(res: Response): void {
  const secure = isProduction() ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `${ACCESS_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`,
    `${REFRESH_COOKIE}=; Max-Age=0; Path=/api/auth; HttpOnly; SameSite=Lax${secure}`,
  ]);
}

export function readCookie(req: { headers: { cookie?: string } }, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const part = header.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.substring(name.length + 1)) : null;
}
