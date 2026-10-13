/* The whole API as one Web-standard handler: (Request) => Response.
 * Vercel runs it as a single function (api/index.js); scripts/dev-server.js runs it locally. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { query, one } from './db.js';
import { HttpError, json, readJson, bad, notFound, str, int, email, ghPhone, oneOf, siteUrl, clientIp, rateLimit } from './http.js';
import { getSettings, saveSettings, paystackEnabled, DEFAULT_SETTINGS } from './settings.js';
import { listPublicProducts, getPublicProduct, slugify } from './catalog.js';
import { STACKS, CATEGORIES, COLLECTION_LINES, PRODUCT_TYPES, ORDER_STATUSES } from './taxonomy.js';
import * as orders from './orders.js';
import * as paystack from './paystack.js';
import * as notify from './notify.js';
import { login, logoutCookie, requireAdmin, isAdmin } from './auth.js';

const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler });
}

/* ---------- public: catalogue + config ---------- */

route('GET', '/api/config', async () => {
  const s = await getSettings();
  return json({
    announcement: s.announcement, whatsapp: s.whatsapp, email: s.email, socialHandle: s.socialHandle,
    instagram: s.instagram, tiktok: s.tiktok,
    delivery: { courierFee: s.courierFee / 100, freeDeliveryPieces: s.freeDeliveryPieces, campuses: s.campuses, pickupEnabled: s.pickupEnabled, courierEnabled: s.courierEnabled },
    onlinePayments: paystackEnabled(),
    stacks: STACKS, categories: CATEGORIES, lines: COLLECTION_LINES
  }, { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } });
});

route('GET', '/api/products', async () => json({ products: await listPublicProducts() }, {
  headers: { 'cache-control': 'public, s-maxage=30, stale-while-revalidate=120' }
}));

route('GET', '/api/products/:slug', async ({ params }) => {
  const p = await getPublicProduct(params.slug);
  if (!p) throw notFound('Product not found');
  return json({ product: p });
});

/* ---------- public: checkout + orders ---------- */

route('POST', '/api/checkout', async ({ request }) => {
  rateLimit(`checkout:${clientIp(request)}`, 20, 10 * 60 * 1000);
  const body = await readJson(request);
  return json(await orders.createOrder(body, { siteUrl: siteUrl(request) }), { status: 201 });
});

route('GET', '/api/orders/:ref', async ({ request, params, url }) => {
  let o = await orders.findOrderForCustomer(params.ref, url.searchParams.get('t'));
  if (!o) throw notFound('Order not found');
  o = await orders.refreshPayment(o, siteUrl(request));
  return json({ order: await orders.publicOrder(o) });
});

route('POST', '/api/paystack/webhook', async ({ request }) => {
  const raw = await request.text();
  if (!paystack.validSignature(raw, request.headers.get('x-paystack-signature'))) {
    return json({ error: 'Invalid signature' }, { status: 401 });
  }
  const event = JSON.parse(raw);
  if (event.event === 'charge.success' && event.data?.reference) {
    // Re-check with Paystack rather than trusting the payload alone.
    const tx = await paystack.verifyTransaction(event.data.reference).catch(() => event.data);
    if (tx.status === 'success') {
      await orders.markPaid(tx.reference, { amount: tx.amount, currency: tx.currency, source: 'webhook', siteUrl: siteUrl(request) });
    }
  }
  return json({ received: true });
});

/* ---------- public: forms ---------- */

function honeypot(body) {
  // Bots fill every field; people never see this one.
  return Boolean(body.website);
}

route('POST', '/api/quotes', async ({ request }) => {
  rateLimit(`form:${clientIp(request)}`, 10, 10 * 60 * 1000);
  const b = await readJson(request);
  if (honeypot(b)) return json({ ok: true }, { status: 201 });
  const q = {
    club: str(b.club, { field: 'Club or company name', min: 2, max: 120, required: true }),
    contact_name: str(b.name, { field: 'Name', max: 100 }),
    pieces: int(b.pieces, { field: 'Number of pieces', min: 1, max: 100000 }),
    garment: str(b.garment, { field: 'Item', max: 60 }),
    whatsapp: ghPhone(b.whatsapp, { field: 'WhatsApp number' }),
    email: email(b.email),
    notes: str(b.notes, { field: 'Notes', max: 2000 })
  };
  const row = await one(
    'INSERT INTO quotes (club, contact_name, pieces, garment, whatsapp, email, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [q.club, q.contact_name || null, q.pieces, q.garment || null, q.whatsapp, q.email || null, q.notes || null]);
  await notify.newQuote(row);
  return json({ ok: true }, { status: 201 });
});

route('POST', '/api/messages', async ({ request }) => {
  rateLimit(`form:${clientIp(request)}`, 10, 10 * 60 * 1000);
  const b = await readJson(request);
  if (honeypot(b)) return json({ ok: true }, { status: 201 });
  const m = {
    name: str(b.name, { field: 'Name', min: 2, max: 100, required: true }),
    contact: str(b.contact, { field: 'WhatsApp or email', min: 5, max: 200, required: true }),
    message: str(b.message, { field: 'Message', min: 2, max: 4000, required: true })
  };
  const row = await one('INSERT INTO messages (name, contact, message) VALUES ($1,$2,$3) RETURNING *', [m.name, m.contact, m.message]);
  await notify.newMessage(row);
  return json({ ok: true }, { status: 201 });
});

route('POST', '/api/subscribe', async ({ request }) => {
  rateLimit(`form:${clientIp(request)}`, 10, 10 * 60 * 1000);
  const b = await readJson(request);
  if (honeypot(b)) return json({ ok: true }, { status: 201 });
  const raw = str(b.contact, { field: 'WhatsApp number or email', required: true, max: 200 });
  const isEmail = raw.includes('@');
  const contact = isEmail ? email(raw, { required: true }) : ghPhone(raw, { field: 'WhatsApp number' });
  await query('INSERT INTO subscribers (contact, kind) VALUES ($1, $2) ON CONFLICT (contact) DO NOTHING', [contact, isEmail ? 'email' : 'whatsapp']);
  return json({ ok: true }, { status: 201 });
});

/* ---------- SEO ---------- */

let productTemplate;
async function renderProduct({ request, url, params }) {
  productTemplate ||= await fs.readFile(path.join(process.cwd(), 'public', 'product.html'), 'utf8');
  const slug = params.slug || url.searchParams.get('slug') || '';
  const p = await getPublicProduct(slug);
  if (!p) {
    return new Response(productTemplate, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  const base = siteUrl(request);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const image = p.images.front ? new URL(p.images.front, base).href : `${base}/assets/img/og.png`;
  const title = `${p.name} | Craf7ton`;
  const desc = `${p.tagline} GHS ${p.price}. Printed both sides.`;
  const anyStock = !p.stock || Object.values(p.stock).some((n) => n > 0);
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description, image: [image], sku: p.id,
    brand: { '@type': 'Brand', name: 'Craf7ton' },
    offers: { '@type': 'Offer', priceCurrency: 'GHS', price: p.price, url: `${base}/products/${p.id}`, availability: `https://schema.org/${anyStock ? 'InStock' : 'OutOfStock'}` }
  };
  const head = `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${base}/products/${esc(p.id)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="product">
<meta property="og:url" content="${base}/products/${esc(p.id)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
  const html = productTemplate
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta (name="description"|property="og:[a-z]+") content="[^"]*">\n?/g, '')
    .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n${head}`);
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600' } });
}
// Vercel passes the original URL through rewrites, so register the public paths too.
route('GET', '/api/render/product', renderProduct);
route('GET', '/products/:slug', renderProduct);

async function sitemap({ request }) {
  const base = siteUrl(request);
  const products = await listPublicProducts();
  const urls = ['', '/shop', '/clubs', '/story', '/contact', '/size-guide', '/delivery-returns', ...products.map((p) => `/products/${p.id}`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml', 'cache-control': 'public, s-maxage=3600' } });
}
route('GET', '/api/sitemap', sitemap);
route('GET', '/sitemap.xml', sitemap);

const robots = async ({ request }) => new Response(
  `User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /cart\nDisallow: /order\nSitemap: ${siteUrl(request)}/sitemap.xml\n`,
  { headers: { 'content-type': 'text/plain', 'cache-control': 'public, s-maxage=86400' } });
route('GET', '/api/robots', robots);
route('GET', '/robots.txt', robots);

/* ---------- cron ---------- */

route('GET', '/api/cron/expire-orders', async ({ request }) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Unauthorized');
  return json({ expired: await orders.expireStale(24) });
});

/* ---------- admin ---------- */

route('POST', '/api/admin/login', async ({ request }) => {
  const b = await readJson(request);
  const cookie = await login(request, b.password);
  return json({ ok: true }, { headers: { 'set-cookie': cookie } });
});

route('POST', '/api/admin/logout', async ({ request }) => json({ ok: true }, { headers: { 'set-cookie': logoutCookie(request) } }));

route('GET', '/api/admin/me', async ({ request }) => json({ admin: isAdmin(request) }));

const admin = (method, pattern, handler) => route(method, pattern, async (ctx) => { requireAdmin(ctx.request); return handler(ctx); });

admin('GET', '/api/admin/meta', async () => json({ stacks: STACKS, categories: CATEGORIES, types: PRODUCT_TYPES, statuses: ORDER_STATUSES, onlinePayments: paystackEnabled(), blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN) }));

admin('GET', '/api/admin/stats', async () => {
  const s = await getSettings();
  const sales = await one(`SELECT
      COALESCE(SUM(total) FILTER (WHERE paid_at >= date_trunc('day', now())), 0)::int AS today,
      COALESCE(SUM(total) FILTER (WHERE paid_at >= now() - interval '7 days'), 0)::int AS week,
      COALESCE(SUM(total) FILTER (WHERE paid_at >= now() - interval '30 days'), 0)::int AS month,
      COUNT(*) FILTER (WHERE paid_at >= now() - interval '30 days')::int AS month_orders
    FROM orders WHERE payment_status = 'paid'`);
  const { rows: byStatus } = await query('SELECT status, COUNT(*)::int AS n FROM orders GROUP BY status');
  const { rows: lowStock } = await query(
    `SELECT p.slug, p.name, v.colour, v.size, v.stock FROM variants v JOIN products p ON p.id = v.product_id
     WHERE p.active AND p.track_stock AND NOT p.quote_only AND v.stock <= $1 ORDER BY v.stock, p.name LIMIT 30`, [s.lowStockThreshold]);
  const { rows: recent } = await query('SELECT ref, customer_name, total, status, payment_status, created_at FROM orders ORDER BY created_at DESC LIMIT 8');
  const counts = await one(`SELECT (SELECT COUNT(*) FROM quotes WHERE status = 'new')::int AS quotes, (SELECT COUNT(*) FROM messages WHERE status = 'new')::int AS messages, (SELECT COUNT(*) FROM subscribers)::int AS subscribers`);
  return json({ sales, byStatus, lowStock, recent, counts });
});

admin('GET', '/api/admin/orders', async ({ url }) => {
  const status = url.searchParams.get('status') || '';
  const q = (url.searchParams.get('q') || '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const where = [];
  const args = [];
  if (status) { args.push(status); where.push(`status = $${args.length}`); }
  if (q) { args.push(`%${q}%`); where.push(`(ref ILIKE $${args.length} OR customer_name ILIKE $${args.length} OR phone ILIKE $${args.length} OR email ILIKE $${args.length})`); }
  args.push(50, (page - 1) * 50);
  const { rows } = await query(
    `SELECT id, ref, status, payment_status, payment_method, customer_name, phone, fulfilment, campus, city, total, stock_issue, created_at,
       (SELECT SUM(qty) FROM order_items WHERE order_id = orders.id)::int AS pieces
     FROM orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`, args);
  return json({ orders: rows, page });
});

admin('GET', '/api/admin/orders/:ref', async ({ params }) => {
  const o = await one('SELECT * FROM orders WHERE ref = $1', [params.ref]);
  if (!o) throw notFound('Order not found');
  const items = await orders.getItems(o.id);
  const { rows: events } = await query('SELECT * FROM order_events WHERE order_id = $1 ORDER BY created_at, id', [o.id]);
  return json({ order: o, items, events });
});

admin('PATCH', '/api/admin/orders/:ref', async ({ request, params }) => {
  const b = await readJson(request);
  if (b.adminNotes !== undefined) {
    await query('UPDATE orders SET admin_notes = $2, updated_at = now() WHERE ref = $1', [params.ref, str(b.adminNotes, { field: 'Notes', max: 4000 })]);
  }
  if (b.status) {
    const status = oneOf(b.status, ORDER_STATUSES, 'Status');
    if (status === 'cancelled') await orders.cancelAndRestock(params.ref);
    await orders.setStatus(params.ref, status, { notifyCustomer: Boolean(b.notify), note: str(b.note, { field: 'Note', max: 300 }) });
  }
  return json({ ok: true });
});

admin('POST', '/api/admin/orders/:ref/mark-paid', async ({ request, params }) => {
  const r = await orders.markPaid(params.ref, { source: 'admin (manual MoMo)', siteUrl: siteUrl(request) });
  if (!r.ok) throw bad(r.reason === 'not_found' ? 'Order not found' : 'Could not mark paid');
  return json({ ok: true, already: Boolean(r.already) });
});

/* Products */

const fail = (message, details) => { throw bad(message, details); };

function productInput(b) {
  const name = str(b.name, { field: 'Name', min: 2, max: 120, required: true });
  const colours = Array.isArray(b.colours) ? b.colours.map((c) => ({
    name: str(c.name, { field: 'Colour name', max: 60, required: true }),
    hex: /^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : fail('Colour must be a hex like #111111', { field: 'colours' })
  })) : [];
  if (!colours.length) throw bad('Add at least one colour', { field: 'colours' });
  const sizes = Array.isArray(b.sizes) ? [...new Set(b.sizes.map((s) => str(s, { field: 'Size', max: 30 })).filter(Boolean))] : [];
  if (!sizes.length) throw bad('Add at least one size', { field: 'sizes' });
  const images = {};
  for (const k of ['front', 'back', 'print', 'person']) {
    const v = str(b.images?.[k], { field: `Image ${k}`, max: 500 });
    if (v) {
      if (!/^(https:\/\/|\/)/.test(v)) throw bad('Images must be https:// URLs or /paths', { field: 'images' });
      images[k] = v;
    }
  }
  return {
    slug: slugify(str(b.slug, { field: 'Slug', max: 80 }) || name) || fail('Slug is required', { field: 'slug' }),
    name,
    type: oneOf(b.type, PRODUCT_TYPES, 'Type'),
    category: oneOf(b.category, CATEGORIES.map((c) => c.id), 'Category'),
    stacks: (Array.isArray(b.stacks) ? b.stacks : []).filter((s) => STACKS.some((x) => x.id === s)),
    price: Math.round(Number(b.price) * 100),
    colours, sizes, images,
    front_print: str(b.front, { field: 'Front print', max: 60 }),
    back_print: str(b.back, { field: 'Back print', max: 120 }),
    tagline: str(b.tagline, { field: 'Tagline', max: 200 }),
    description: str(b.description, { field: 'Description', max: 4000 }),
    details: (Array.isArray(b.details) ? b.details : []).map((d) => str(d, { field: 'Detail', max: 200 })).filter(Boolean),
    is_new: Boolean(b.isNew), quote_only: Boolean(b.quoteOnly), track_stock: b.trackStock !== false, active: b.active !== false,
    sort: Number.isInteger(Number(b.sort)) ? Number(b.sort) : 0,
    stock: b.stock && typeof b.stock === 'object' ? b.stock : {}
  };
}

async function saveProduct(id, p) {
  if (!Number.isInteger(p.price) || p.price < 0 || p.price > 10_000_000) throw bad('Price is not valid', { field: 'price' });
  const clash = await one('SELECT id FROM products WHERE slug = $1 AND id <> $2', [p.slug, id || 0]);
  if (clash) throw bad('Another product already uses that URL slug', { field: 'slug' });
  const cols = [p.slug, p.name, p.type, p.category, p.stacks, p.price, JSON.stringify(p.colours), JSON.stringify(p.sizes),
    p.front_print, p.back_print, p.tagline, p.description, JSON.stringify(p.details), JSON.stringify(p.images),
    p.is_new, p.quote_only, p.track_stock, p.active, p.sort];
  const row = id
    ? await one(`UPDATE products SET slug=$1, name=$2, type=$3, category=$4, stacks=$5, price=$6, colours=$7, sizes=$8, front_print=$9, back_print=$10,
        tagline=$11, description=$12, details=$13, images=$14, is_new=$15, quote_only=$16, track_stock=$17, active=$18, sort=$19, updated_at=now()
        WHERE id=$20 RETURNING *`, [...cols, id])
    : await one(`INSERT INTO products (slug, name, type, category, stacks, price, colours, sizes, front_print, back_print, tagline, description, details, images,
        is_new, quote_only, track_stock, active, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`, cols);
  if (!row) throw notFound('Product not found');
  // One variant per colour x size; remove variants for colours/sizes that were dropped.
  for (const c of p.colours) {
    for (const s of p.sizes) {
      const n = Number(p.stock[`${c.name}|${s}`] ?? 0);
      const stock = Number.isFinite(n) ? Math.max(-100000, Math.min(100000, Math.trunc(n))) : 0;
      await query(`INSERT INTO variants (product_id, colour, size, stock) VALUES ($1,$2,$3,$4)
        ON CONFLICT (product_id, colour, size) DO UPDATE SET stock = EXCLUDED.stock`, [row.id, c.name, s, stock]);
    }
  }
  await query(`DELETE FROM variants WHERE product_id = $1 AND NOT (colour = ANY($2) AND size = ANY($3))`, [row.id, p.colours.map((c) => c.name), p.sizes]);
  return row;
}

admin('GET', '/api/admin/products', async () => {
  const { rows: products } = await query('SELECT * FROM products ORDER BY active DESC, sort, id');
  const { rows: variants } = await query('SELECT * FROM variants');
  return json({ products: products.map((p) => ({ ...p, variants: variants.filter((v) => v.product_id === p.id) })) });
});

admin('GET', '/api/admin/products/:id', async ({ params }) => {
  const p = await one('SELECT * FROM products WHERE id = $1', [Number(params.id) || 0]);
  if (!p) throw notFound('Product not found');
  const { rows } = await query('SELECT * FROM variants WHERE product_id = $1', [p.id]);
  return json({ product: { ...p, variants: rows } });
});

admin('POST', '/api/admin/products', async ({ request }) => {
  const row = await saveProduct(null, productInput(await readJson(request)));
  return json({ product: row }, { status: 201 });
});

admin('PUT', '/api/admin/products/:id', async ({ request, params }) => {
  const row = await saveProduct(Number(params.id) || 0, productInput(await readJson(request)));
  return json({ product: row });
});

admin('DELETE', '/api/admin/products/:id', async ({ params }) => {
  // Archive rather than delete so past orders keep their product link.
  const row = await one('UPDATE products SET active = false, updated_at = now() WHERE id = $1 RETURNING id', [Number(params.id) || 0]);
  if (!row) throw notFound('Product not found');
  return json({ ok: true });
});

admin('POST', '/api/admin/upload', async ({ request, url }) => {
  const type = request.headers.get('content-type') || '';
  if (!/^image\/(webp|jpeg|png|avif)$/.test(type)) throw bad('Upload a WebP, JPEG, PNG or AVIF image');
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length > 4 * 1024 * 1024) throw new HttpError(413, 'Image is over 4 MB. Export it as WebP under 300 KB.');
  const name = slugify((url.searchParams.get('filename') || 'image').replace(/\.[a-z0-9]+$/i, '')) || 'image';
  const ext = type.split('/')[1].replace('jpeg', 'jpg');
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`products/${name}.${ext}`, buf, { access: 'public', addRandomSuffix: true, contentType: type });
    return json({ url: blob.url }, { status: 201 });
  }
  if (process.env.VERCEL) throw new HttpError(501, 'Connect a Vercel Blob store to this project to upload images.');
  // Local development: write into public/uploads.
  const dir = path.join(process.cwd(), 'public', 'uploads');
  await fs.mkdir(dir, { recursive: true });
  const file = `${name}-${Date.now().toString(36)}.${ext}`;
  await fs.writeFile(path.join(dir, file), buf);
  return json({ url: `/uploads/${file}` }, { status: 201 });
});

/* Quotes, messages, subscribers */

admin('GET', '/api/admin/quotes', async () => json({ quotes: (await query('SELECT * FROM quotes ORDER BY created_at DESC LIMIT 500')).rows }));
admin('PATCH', '/api/admin/quotes/:id', async ({ request, params }) => {
  const b = await readJson(request);
  await query('UPDATE quotes SET status = $2 WHERE id = $1', [Number(params.id) || 0, oneOf(b.status, ['new', 'quoted', 'won', 'lost'], 'Status')]);
  return json({ ok: true });
});
admin('GET', '/api/admin/messages', async () => json({ messages: (await query('SELECT * FROM messages ORDER BY created_at DESC LIMIT 500')).rows }));
admin('PATCH', '/api/admin/messages/:id', async ({ request, params }) => {
  const b = await readJson(request);
  await query('UPDATE messages SET status = $2 WHERE id = $1', [Number(params.id) || 0, oneOf(b.status, ['new', 'done'], 'Status')]);
  return json({ ok: true });
});
admin('GET', '/api/admin/subscribers', async () => json({ subscribers: (await query('SELECT * FROM subscribers ORDER BY created_at DESC')).rows }));

/* Settings */

admin('GET', '/api/admin/settings', async () => json({ settings: await getSettings() }));
admin('PUT', '/api/admin/settings', async ({ request }) => {
  const b = await readJson(request);
  const patch = {};
  if ('announcement' in b) patch.announcement = str(b.announcement, { field: 'Announcement', max: 140 });
  if ('whatsapp' in b) patch.whatsapp = ghPhone(b.whatsapp, { field: 'WhatsApp number' });
  if ('email' in b) patch.email = email(b.email, { required: true });
  if ('socialHandle' in b) patch.socialHandle = str(b.socialHandle, { field: 'Handle', max: 60 }).replace(/^@/, '');
  for (const k of ['instagram', 'tiktok']) if (k in b) {
    const v = str(b[k], { field: k, max: 200 });
    if (v && !/^https:\/\//.test(v)) throw bad(`${k} link must start with https://`, { field: k });
    patch[k] = v;
  }
  if ('courierFee' in b) patch.courierFee = Math.round(Number(b.courierFee) * 100);
  if (patch.courierFee !== undefined && !(patch.courierFee >= 0 && patch.courierFee <= 1_000_000)) throw bad('Courier fee is not valid', { field: 'courierFee' });
  if ('freeDeliveryPieces' in b) patch.freeDeliveryPieces = int(b.freeDeliveryPieces, { field: 'Free delivery pieces', min: 1, max: 10000 });
  if ('lowStockThreshold' in b) patch.lowStockThreshold = int(b.lowStockThreshold, { field: 'Low stock threshold', min: 0, max: 1000 });
  for (const k of ['pickupEnabled', 'courierEnabled']) if (k in b) patch[k] = Boolean(b[k]);
  if ('campuses' in b) {
    patch.campuses = (Array.isArray(b.campuses) ? b.campuses : []).map((c) => str(c, { field: 'Campus', max: 100 })).filter(Boolean);
    if (!patch.campuses.length) patch.campuses = DEFAULT_SETTINGS.campuses;
  }
  return json({ settings: await saveSettings(patch) });
});

/* ---------- dispatcher ---------- */

export async function handle(request) {
  const url = new URL(request.url);
  try {
    for (const r of routes) {
      const m = url.pathname.match(r.re);
      if (!m) continue;
      if (r.method !== request.method && !(request.method === 'HEAD' && r.method === 'GET')) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return await r.handler({ request, url, params });
    }
    const pathMatches = routes.some((r) => r.re.test(url.pathname));
    return json({ error: pathMatches ? 'Method not allowed' : 'Not found' }, { status: pathMatches ? 405 : 404 });
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, ...(err.details ? { details: err.details } : {}) }, { status: err.status });
    console.error('[api]', request.method, url.pathname, err);
    return json({ error: 'Something went wrong on our side. Please try again.' }, { status: 500 });
  }
}
