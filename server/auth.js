/*
 * Admin sessions: one shared admin password (ADMIN_PASSWORD) and a signed, HttpOnly cookie.
 * Mutating admin requests must also send the X-C7-Admin header, which a cross-site form or
 * image request cannot set; that is our CSRF protection on top of SameSite=Strict.
 */
import crypto from 'node:crypto';
import { HttpError, parseCookies, clientIp, rateLimit } from './http.js';

const COOKIE = 'c7_admin';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new HttpError(500, 'SESSION_SECRET must be set (32+ characters)');
  return s;
}

const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function login(request, password) {
  rateLimit(`login:${clientIp(request)}`, 8, 15 * 60 * 1000);
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected.length < 10) throw new HttpError(500, 'ADMIN_PASSWORD must be set (10+ characters)');
  if (!safeEqual(password || '', expected)) {
    await new Promise((r) => setTimeout(r, 600));
    throw new HttpError(401, 'Wrong password');
  }
  // Rotating ADMIN_PASSWORD invalidates existing sessions.
  const pw = crypto.createHash('sha256').update(expected).digest('base64url').slice(0, 10);
  const payload = `${Math.floor(Date.now() / 1000) + MAX_AGE}.${pw}`;
  return cookieHeader(`${payload}.${sign(payload)}`, MAX_AGE, request);
}

export function logoutCookie(request) {
  return cookieHeader('', 0, request);
}

function cookieHeader(value, maxAge, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function isAdmin(request) {
  const raw = parseCookies(request)[COOKIE];
  if (!raw) return false;
  const parts = raw.split('.');
  if (parts.length !== 3) return false;
  const [exp, pw, sig] = parts;
  try {
    if (!safeEqual(sig, sign(`${exp}.${pw}`))) return false;
  } catch { return false; }
  if (Number(exp) < Date.now() / 1000) return false;
  const current = crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD || '').digest('base64url').slice(0, 10);
  return pw === current;
}

export function requireAdmin(request) {
  if (!isAdmin(request)) throw new HttpError(401, 'Please log in');
  if (request.method !== 'GET' && request.headers.get('x-c7-admin') !== '1') throw new HttpError(403, 'Missing admin header');
}
