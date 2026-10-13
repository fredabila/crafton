/* API integration tests. Needs a throwaway Postgres database in DATABASE_URL (see .env.test).
 * Paystack is replaced by a local mock server; notifications are captured, not sent. */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

if (!process.env.DATABASE_URL || !/test/.test(process.env.DATABASE_URL)) {
  throw new Error('Set DATABASE_URL to a *test* database (it gets wiped). See .env.test');
}

Object.assign(process.env, {
  NODE_ENV: 'test',
  NOTIFY_CAPTURE: '1',
  ADMIN_PASSWORD: 'test-admin-password',
  SESSION_SECRET: 'test-session-secret-0123456789abcdef0123',
  PAYSTACK_SECRET_KEY: 'sk_test_mock',
  SITE_URL: 'https://shop.example',
  CRON_SECRET: 'cron-secret',
  STORE_EMAIL: 'store@example.com',
  STORE_PHONE: '233200000000',
  SEED_STOCK: '5'
});

// ---- mock Paystack ----
const paystack = { initialized: [], transactions: new Map() };
const mock = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  res.setHeader('content-type', 'application/json');
  if (req.method === 'POST' && req.url === '/transaction/initialize') {
    const b = JSON.parse(body);
    paystack.initialized.push(b);
    return res.end(JSON.stringify({ status: true, data: { authorization_url: `https://checkout.paystack.com/${b.reference}`, reference: b.reference } }));
  }
  const m = req.url.match(/^\/transaction\/verify\/(.+)$/);
  if (m) {
    const tx = paystack.transactions.get(decodeURIComponent(m[1]));
    if (!tx) { res.statusCode = 400; return res.end(JSON.stringify({ status: false, message: 'Transaction reference not found' })); }
    return res.end(JSON.stringify({ status: true, data: tx }));
  }
  res.statusCode = 404;
  res.end('{}');
});

let handle, db, notify;
const env = { ...process.env };

before(async () => {
  await new Promise((r) => mock.listen(0, r));
  process.env.PAYSTACK_API_BASE = `http://127.0.0.1:${mock.address().port}`;
  db = await import('../server/db.js');
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  execFileSync('node', ['scripts/migrate.js'], { env: process.env });
  execFileSync('node', ['scripts/seed.js'], { env: process.env });
  ({ handle } = await import('../server/app.js'));
  notify = await import('../server/notify.js');
});

after(async () => {
  mock.close();
  await db.closePool();
});

beforeEach(() => {
  Object.assign(process.env, env, { PAYSTACK_API_BASE: process.env.PAYSTACK_API_BASE });
  notify.sent.length = 0;
});

// ---- helpers ----
async function call(method, path, { body, headers = {}, raw } = {}) {
  const res = await handle(new Request(`https://shop.example${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined)
  }));
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

const customer = { name: 'Ama Mensah', phone: '024 123 4567', method: 'pickup', campus: 'UMaT, Tarkwa', updates: 'SMS' };
const checkout = (items, extra = {}) => call('POST', '/api/checkout', { body: { items, customer: { ...customer, ...extra.customer }, payment: extra.payment || { method: 'momo', network: 'MTN' } } });
const stockOf = async (slug, colour, size) => (await db.one('SELECT v.stock FROM variants v JOIN products p ON p.id = v.product_id WHERE p.slug = $1 AND v.colour = $2 AND v.size = $3', [slug, colour, size])).stock;
const sign = (raw) => crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');
async function webhook(payload) {
  const raw = JSON.stringify(payload);
  return call('POST', '/api/paystack/webhook', { raw, headers: { 'content-type': 'application/json', 'x-paystack-signature': sign(raw) } });
}
async function adminCookie() {
  const r = await call('POST', '/api/admin/login', { body: { password: 'test-admin-password' } });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}

// ---- catalogue ----
test('lists products with stock and hides nothing sensitive', async () => {
  const r = await call('GET', '/api/products');
  assert.equal(r.status, 200);
  const tee = r.data.products.find((p) => p.id === 'git-brain-tee');
  assert.equal(tee.price, 180);
  assert.equal(tee.stock['Black|M'], 5);
  assert.equal(r.data.products.find((p) => p.id === 'club-custom-tee').stock, null);
});

test('config exposes delivery and taxonomy', async () => {
  const r = await call('GET', '/api/config');
  assert.equal(r.data.onlinePayments, true);
  assert.equal(r.data.delivery.courierFee, 35);
  assert.ok(r.data.stacks.length >= 6);
});

test('product page is server-rendered with SEO tags', async () => {
  const r = await call('GET', '/products/git-brain-tee');
  assert.equal(r.status, 200);
  assert.match(r.data, /<title>Git Brain Tee \| Craf7ton<\/title>/);
  assert.match(r.data, /"@type":"Product"/);
  assert.equal((await call('GET', '/products/nope')).status, 404);
});

// ---- checkout ----
test('checkout prices come from the database, not the browser', async () => {
  const r = await checkout([{ id: 'git-brain-tee', colour: 'Black', size: 'M', qty: 2, price: 1 }]);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.total, 360);
  assert.equal(r.data.mode, 'paystack');
  assert.match(r.data.authorizationUrl, /^https:\/\/checkout\.paystack\.com\//);
  const init = paystack.initialized.at(-1);
  assert.equal(init.amount, 36000);
  assert.equal(init.currency, 'GHS');
  assert.deepEqual(init.channels, ['mobile_money']);
  assert.match(init.callback_url, /^https:\/\/shop\.example\/order\?ref=C7-/);
  assert.equal(init.email, '233241234567@customers.craf7ton.com');
});

test('courier fee applies, and is free from 10 pieces', async () => {
  const courier = { method: 'courier', address: 'Hall 3, Room 12', city: 'Tarkwa' };
  const one = await checkout([{ id: 'sticker-pack', colour: 'Mixed', size: 'Pack of 8', qty: 1 }], { customer: courier, payment: { method: 'card' } });
  assert.equal(one.data.total, 40 + 35);
  assert.deepEqual(paystack.initialized.at(-1).channels, ['card']);
  const lines = ['S', 'M', 'L', 'XL', 'XXL'].map((size) => ({ id: 'console-log-tee', colour: 'White', size, qty: 2 }));
  const ten = await checkout(lines, { customer: courier });
  assert.equal(ten.data.total, 180 * 10);
});

test('rejects more than is in stock, quote-only items and unknown variants', async () => {
  const tooMany = await checkout([{ id: 'git-brain-tee', colour: 'White', size: 'S', qty: 6 }]);
  assert.equal(tooMany.status, 409);
  assert.equal(tooMany.data.details.available, 5);
  // Same variant split over two lines is still counted together.
  const split = await checkout([{ id: 'git-brain-tee', colour: 'White', size: 'S', qty: 3 }, { id: 'git-brain-tee', colour: 'White', size: 'S', qty: 3 }]);
  assert.equal(split.status, 409);
  assert.equal((await checkout([{ id: 'club-custom-tee', colour: 'Black', size: 'M', qty: 1 }])).status, 409);
  assert.equal((await checkout([{ id: 'git-brain-tee', colour: 'Purple', size: 'M', qty: 1 }])).status, 409);
  assert.equal((await checkout([{ id: 'nope', colour: 'Black', size: 'M', qty: 1 }])).status, 409);
});

test('validates customer details', async () => {
  const badPhone = await checkout([{ id: 'git-brain-tee', colour: 'Black', size: 'M', qty: 1 }], { customer: { phone: '12345' } });
  assert.equal(badPhone.status, 400);
  assert.equal(badPhone.data.details.field, 'Phone');
  const badCampus = await checkout([{ id: 'git-brain-tee', colour: 'Black', size: 'M', qty: 1 }], { customer: { campus: 'Hogwarts' } });
  assert.equal(badCampus.status, 400);
  const noAddress = await checkout([{ id: 'git-brain-tee', colour: 'Black', size: 'M', qty: 1 }], { customer: { method: 'courier' } });
  assert.equal(noAddress.status, 400);
  const empty = await call('POST', '/api/checkout', { body: { items: [], customer, payment: { method: 'momo', network: 'MTN' } } });
  assert.equal(empty.status, 400);
});

// ---- payment confirmation ----
test('webhook with a bad signature is rejected', async () => {
  const raw = JSON.stringify({ event: 'charge.success', data: { reference: 'x' } });
  const r = await call('POST', '/api/paystack/webhook', { raw, headers: { 'content-type': 'application/json', 'x-paystack-signature': 'nope' } });
  assert.equal(r.status, 401);
});

test('paid webhook marks the order paid, takes stock once, and notifies', async () => {
  const before = await stockOf('ship-it-hoodie', 'Black', 'L');
  const r = await checkout([{ id: 'ship-it-hoodie', colour: 'Black', size: 'L', qty: 2 }], { customer: { email: 'ama@example.com' } });
  const { ref, token } = r.data;
  paystack.transactions.set(ref, { reference: ref, status: 'success', amount: 70000, currency: 'GHS' });

  assert.equal((await webhook({ event: 'charge.success', data: { reference: ref } })).status, 200);
  const o = await db.one('SELECT * FROM orders WHERE ref = $1', [ref]);
  assert.equal(o.payment_status, 'paid');
  assert.equal(o.status, 'paid');
  assert.equal(await stockOf('ship-it-hoodie', 'Black', 'L'), before - 2);
  assert.ok(notify.sent.some((n) => n.channel === 'sms' && n.to === '233241234567' && /payment received/.test(n.text)));
  assert.ok(notify.sent.some((n) => n.channel === 'email' && n.to === 'ama@example.com'));
  assert.ok(notify.sent.some((n) => n.channel === 'email' && n.to === 'store@example.com'));

  // Paystack retries webhooks; a repeat must not take stock again.
  notify.sent.length = 0;
  await webhook({ event: 'charge.success', data: { reference: ref } });
  assert.equal(await stockOf('ship-it-hoodie', 'Black', 'L'), before - 2);
  assert.equal(notify.sent.length, 0);

  const status = await call('GET', `/api/orders/${ref}?t=${token}`);
  assert.equal(status.data.order.paymentStatus, 'paid');
  assert.equal(status.data.order.total, 700);
});

test('return page verifies with Paystack when the webhook is late', async () => {
  const r = await checkout([{ id: 'prompt-engineer-tee', colour: 'Black', size: 'S', qty: 1 }]);
  const pending = await call('GET', `/api/orders/${r.data.ref}?t=${r.data.token}`);
  assert.equal(pending.data.order.status, 'pending_payment');
  paystack.transactions.set(r.data.ref, { reference: r.data.ref, status: 'success', amount: 18000, currency: 'GHS' });
  const paid = await call('GET', `/api/orders/${r.data.ref}?t=${r.data.token}`);
  assert.equal(paid.data.order.paymentStatus, 'paid');
});

test('a payment for the wrong amount does not mark the order paid', async () => {
  const r = await checkout([{ id: 'void-warranty-tee', colour: 'Ash grey', size: 'M', qty: 1 }]);
  paystack.transactions.set(r.data.ref, { reference: r.data.ref, status: 'success', amount: 100, currency: 'GHS' });
  await webhook({ event: 'charge.success', data: { reference: r.data.ref } });
  const o = await db.one('SELECT * FROM orders WHERE ref = $1', [r.data.ref]);
  assert.equal(o.payment_status, 'unpaid');
  assert.ok(notify.sent.some((n) => n.to === 'store@example.com' && /Check payment/.test(n.subject)));
});

test('order lookup needs the right token', async () => {
  const r = await checkout([{ id: 'git-brain-tee', colour: 'Black', size: 'S', qty: 1 }]);
  assert.equal((await call('GET', `/api/orders/${r.data.ref}?t=wrong`)).status, 404);
  assert.equal((await call('GET', `/api/orders/${r.data.ref}`)).status, 404);
});

test('manual mode (no Paystack key) creates an order awaiting MoMo payment', async () => {
  delete process.env.PAYSTACK_SECRET_KEY;
  const r = await checkout([{ id: 'git-brain-tee', colour: 'Black', size: 'XL', qty: 1 }]);
  assert.equal(r.status, 201);
  assert.equal(r.data.mode, 'manual');
  assert.equal(r.data.authorizationUrl, undefined);
  const o = await db.one('SELECT * FROM orders WHERE ref = $1', [r.data.ref]);
  assert.equal(o.status, 'awaiting_manual_payment');
  assert.ok(notify.sent.some((n) => n.to === 'store@example.com' && /awaiting MoMo/.test(n.subject)));
});

// ---- forms ----
test('club quotes are saved and alert the store; honeypot submissions are dropped', async () => {
  const ok = await call('POST', '/api/quotes', { body: { club: 'GDSC UMaT', pieces: 40, whatsapp: '0551234567', garment: 'Tees' } });
  assert.equal(ok.status, 201);
  assert.ok(notify.sent.some((n) => /GDSC UMaT/.test(n.subject || '')));
  await call('POST', '/api/quotes', { body: { club: 'Spam', pieces: 1, whatsapp: '0551234567', website: 'http://spam' } });
  const { rows } = await db.query('SELECT club FROM quotes');
  assert.deepEqual(rows.map((r) => r.club), ['GDSC UMaT']);
});

test('subscribe normalises numbers and ignores duplicates', async () => {
  assert.equal((await call('POST', '/api/subscribe', { body: { contact: '024 111 2222' } })).status, 201);
  assert.equal((await call('POST', '/api/subscribe', { body: { contact: '+233241112222' } })).status, 201);
  assert.equal((await call('POST', '/api/subscribe', { body: { contact: 'Dev@Example.com' } })).status, 201);
  const { rows } = await db.query('SELECT contact FROM subscribers ORDER BY id');
  assert.deepEqual(rows.map((r) => r.contact), ['233241112222', 'dev@example.com']);
});

// ---- admin ----
test('admin endpoints require login and the CSRF header', async () => {
  assert.equal((await call('GET', '/api/admin/stats')).status, 401);
  assert.equal((await call('POST', '/api/admin/login', { body: { password: 'wrong' } })).status, 401);
  const cookie = await adminCookie();
  assert.equal((await call('GET', '/api/admin/stats', { headers: { cookie } })).status, 200);
  assert.equal((await call('PUT', '/api/admin/settings', { headers: { cookie }, body: { courierFee: 40 } })).status, 403);
  assert.equal((await call('PUT', '/api/admin/settings', { headers: { cookie, 'x-c7-admin': '1' }, body: { courierFee: 40 } })).status, 200);
  assert.equal((await call('GET', '/api/config')).data.delivery.courierFee, 40);
  // Forged cookie
  assert.equal((await call('GET', '/api/admin/stats', { headers: { cookie: 'c7_admin=9999999999.abc.def' } })).status, 401);
});

test('admin can mark a manual order paid and cancelling restocks it', async () => {
  delete process.env.PAYSTACK_SECRET_KEY;
  const before = await stockOf('git-brain-tee', 'White', 'L');
  const r = await checkout([{ id: 'git-brain-tee', colour: 'White', size: 'L', qty: 3 }]);
  const cookie = await adminCookie();
  const h = { cookie, 'x-c7-admin': '1' };
  assert.equal((await call('POST', `/api/admin/orders/${r.data.ref}/mark-paid`, { headers: h, body: {} })).status, 200);
  assert.equal(await stockOf('git-brain-tee', 'White', 'L'), before - 3);
  assert.equal((await call('PATCH', `/api/admin/orders/${r.data.ref}`, { headers: h, body: { status: 'ready_for_pickup', notify: true } })).status, 200);
  assert.ok(notify.sent.some((n) => n.channel === 'sms' && /ready for pickup/.test(n.text)));
  assert.equal((await call('PATCH', `/api/admin/orders/${r.data.ref}`, { headers: h, body: { status: 'cancelled' } })).status, 200);
  assert.equal(await stockOf('git-brain-tee', 'White', 'L'), before);
  const detail = await call('GET', `/api/admin/orders/${r.data.ref}`, { headers: { cookie } });
  assert.ok(detail.data.events.some((e) => e.type === 'restocked'));
});

test('admin product CRUD keeps variants in sync', async () => {
  const cookie = await adminCookie();
  const h = { cookie, 'x-c7-admin': '1' };
  const body = { name: 'Rust Tee', price: 199.5, type: 'tee', category: 'tees', stacks: ['backend'], colours: [{ name: 'Black', hex: '#111111' }], sizes: ['M', 'L'], stock: { 'Black|M': 4, 'Black|L': 0 } };
  const created = await call('POST', '/api/admin/products', { headers: h, body });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.product.slug, 'rust-tee');
  assert.equal(created.data.product.price, 19950);
  const pub = (await call('GET', '/api/products/rust-tee')).data.product;
  assert.deepEqual(pub.stock, { 'Black|M': 4, 'Black|L': 0 });
  // Drop size L, add a colour.
  const upd = await call('PUT', `/api/admin/products/${created.data.product.id}`, { headers: h, body: { ...body, sizes: ['M'], colours: [...body.colours, { name: 'White', hex: '#ffffff' }], stock: { 'Black|M': 4, 'White|M': 2 } } });
  assert.equal(upd.status, 200);
  assert.deepEqual((await call('GET', '/api/products/rust-tee')).data.product.stock, { 'Black|M': 4, 'White|M': 2 });
  const badHex = await call('POST', '/api/admin/products', { headers: h, body: { ...body, name: 'X tee', colours: [{ name: 'Bad', hex: 'red' }] } });
  assert.equal(badHex.status, 400);
  assert.equal((await call('DELETE', `/api/admin/products/${created.data.product.id}`, { headers: h })).status, 200);
  assert.equal((await call('GET', '/api/products/rust-tee')).status, 404);
});

test('cron expires stale unpaid orders and is protected', async () => {
  assert.equal((await call('GET', '/api/cron/expire-orders')).status, 401);
  const r = await checkout([{ id: 'git-brain-tee', colour: 'Black', size: 'L', qty: 1 }]);
  await db.query("UPDATE orders SET created_at = now() - interval '2 days' WHERE ref = $1", [r.data.ref]);
  const res = await call('GET', '/api/cron/expire-orders', { headers: { authorization: 'Bearer cron-secret' } });
  assert.ok(res.data.expired >= 1);
  assert.equal((await db.one('SELECT status FROM orders WHERE ref = $1', [r.data.ref])).status, 'expired');
});
