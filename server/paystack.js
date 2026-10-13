import crypto from 'node:crypto';

const base = () => (process.env.PAYSTACK_API_BASE || 'https://api.paystack.co').replace(/\/$/, '');

async function call(path, init = {}) {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(15_000)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === false) {
    const err = new Error(`Paystack ${path} failed: ${body.message || res.status}`);
    err.paystack = body;
    throw err;
  }
  return body.data;
}

/* Start a hosted payment page. Amount is in pesewas. */
export function initializeTransaction({ email, amount, reference, callbackUrl, channels, metadata }) {
  return call('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({ email, amount, currency: 'GHS', reference, callback_url: callbackUrl, channels, metadata })
  });
}

export function verifyTransaction(reference) {
  return call(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/* Paystack signs the raw webhook body with HMAC-SHA512 using the secret key. */
export function validSignature(rawBody, signature) {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
