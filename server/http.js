/* Small helpers for Web-standard Request/Response handlers. */

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const bad = (message, details) => new HttpError(400, message, details);
export const notFound = (message = 'Not found') => new HttpError(404, message);

export function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

const MAX_JSON_BYTES = 64 * 1024;

export async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Expected JSON');
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new HttpError(413, 'Request too large');
  try {
    const data = JSON.parse(text || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw bad('Invalid JSON');
  }
}

export function parseCookies(request) {
  const out = {};
  (request.headers.get('cookie') || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

export function clientIp(request) {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

/* Base URL for links we hand to third parties (Paystack callback, emails). Prefer the
 * configured SITE_URL so a spoofed Host header can never redirect customers elsewhere. */
export function siteUrl(request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return new URL(request.url).origin;
}

/* Best-effort per-instance rate limit. Serverless instances are short-lived, so this only
 * blunts bursts; put Vercel's firewall rate limiting in front for real protection. */
const buckets = new Map();
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) { buckets.set(key, { n: 1, reset: now + windowMs }); return; }
  b.n += 1;
  if (b.n > limit) throw new HttpError(429, 'Too many requests. Please wait a minute and try again.');
}

/* ---------- validation ---------- */

export function str(value, { field, min = 0, max = 500, required = false } = {}) {
  const s = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  if (required && !s) throw bad(`${field} is required`, { field });
  if (s && s.length < min) throw bad(`${field} is too short`, { field });
  if (s.length > max) throw bad(`${field} is too long`, { field });
  return s;
}

export function int(value, { field, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${field} must be a whole number between ${min} and ${max}`, { field });
  return n;
}

export function email(value, { field = 'Email', required = false } = {}) {
  const s = str(value, { field, max: 200, required }).toLowerCase();
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw bad(`${field} doesn't look right`, { field });
  return s;
}

/* Ghana phone numbers -> 233XXXXXXXXX. Accepts 024..., +233 24..., 23324... */
export function ghPhone(value, { field = 'Phone', required = true } = {}) {
  const raw = str(value, { field, max: 30, required });
  if (!raw) return '';
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = `233${d.slice(1)}`;
  if (d.length === 9) d = `233${d}`;
  if (!/^233\d{9}$/.test(d)) throw bad(`${field} should be a Ghana number like 024 123 4567`, { field });
  return d;
}

export function oneOf(value, list, field) {
  if (!list.includes(value)) throw bad(`${field} is not valid`, { field });
  return value;
}

export const cedis = (pesewas) => `GHS ${(pesewas / 100).toFixed(2).replace(/\.00$/, '')}`;
