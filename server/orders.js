import crypto from 'node:crypto';
import { query, one, transaction } from './db.js';
import { bad, HttpError, str, int, email, ghPhone, oneOf } from './http.js';
import { getSettings, paystackEnabled } from './settings.js';
import { MOMO_NETWORKS } from './taxonomy.js';
import * as paystack from './paystack.js';
import * as notify from './notify.js';

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRef() {
  const bytes = crypto.randomBytes(8);
  return 'C7-' + Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
}

async function logEvent(db, orderId, type, message = '') {
  await db.query('INSERT INTO order_events (order_id, type, message) VALUES ($1, $2, $3)', [orderId, type, message]);
}

export async function getItems(orderId, db = { query }) {
  const { rows } = await db.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [orderId]);
  return rows;
}

/* ---------- checkout ---------- */

export function validateCheckout(input, settings) {
  const c = input.customer || {};
  const customer = {
    name: str(c.name, { field: 'Name', min: 2, max: 100, required: true }),
    phone: ghPhone(c.phone, { field: 'Phone' }),
    email: email(c.email),
    fulfilment: oneOf(c.method, ['pickup', 'courier'], 'Delivery method'),
    campus: '',
    address: '',
    city: '',
    notes: str(c.notes, { field: 'Notes', max: 500 }),
    updates: oneOf(c.updates || 'WhatsApp', ['WhatsApp', 'SMS', 'Email'], 'Updates')
  };
  if (customer.fulfilment === 'pickup') {
    if (!settings.pickupEnabled) throw bad('Campus pickup is not available right now', { field: 'method' });
    customer.campus = oneOf(str(c.campus, { field: 'Campus', required: true }), settings.campuses, 'Campus');
  } else {
    if (!settings.courierEnabled) throw bad('Courier delivery is not available right now', { field: 'method' });
    customer.address = str(c.address, { field: 'Address', min: 3, max: 300, required: true });
    customer.city = str(c.city, { field: 'Town / city', min: 2, max: 100, required: true });
  }
  if (customer.updates === 'Email' && !customer.email) throw bad('Add an email address to get updates by email', { field: 'email' });

  const p = input.payment || {};
  const payment = { method: oneOf(p.method, ['momo', 'card'], 'Payment method'), network: null };
  if (payment.method === 'momo') payment.network = oneOf(p.network, MOMO_NETWORKS, 'Mobile Money network');

  if (!Array.isArray(input.items) || input.items.length === 0) throw bad('Your bag is empty');
  if (input.items.length > 50) throw bad('Too many lines in the bag');
  const items = input.items.map((i) => ({
    slug: str(i.id, { field: 'Product', max: 100, required: true }),
    colour: str(i.colour, { field: 'Colour', max: 60, required: true }),
    size: str(i.size, { field: 'Size', max: 30, required: true }),
    qty: int(i.qty, { field: 'Quantity', min: 1, max: 200 })
  }));
  return { customer, payment, items };
}

/* Prices, stock and delivery are always computed here from the database. Nothing the browser
 * sends about money is trusted. */
export async function priceItems(items, settings, db = { query }) {
  const slugs = [...new Set(items.map((i) => i.slug))];
  const { rows: products } = await db.query('SELECT * FROM products WHERE slug = ANY($1) AND active', [slugs]);
  const { rows: variants } = await db.query('SELECT * FROM variants WHERE product_id = ANY($1)', [products.map((p) => p.id)]);
  const merged = new Map();
  for (const i of items) {
    const p = products.find((x) => x.slug === i.slug);
    if (!p) throw new HttpError(409, 'An item in your bag is no longer available', { slug: i.slug, reason: 'unavailable' });
    if (p.quote_only) throw new HttpError(409, `${p.name} is made to order. Request a club quote instead.`, { slug: i.slug, reason: 'quote_only' });
    if (!p.colours.some((c) => c.name === i.colour) || !p.sizes.includes(i.size)) {
      throw new HttpError(409, `${p.name} in ${i.colour} / ${i.size} is no longer available`, { slug: i.slug, reason: 'unavailable' });
    }
    const key = `${p.id}|${i.colour}|${i.size}`;
    const line = merged.get(key) || { product: p, colour: i.colour, size: i.size, qty: 0 };
    line.qty += i.qty;
    merged.set(key, line);
  }
  const lines = [...merged.values()];
  for (const l of lines) {
    if (!l.product.track_stock) continue;
    const v = variants.find((x) => x.product_id === l.product.id && x.colour === l.colour && x.size === l.size);
    const available = v ? Math.max(0, v.stock) : 0;
    if (available < l.qty) {
      throw new HttpError(409, available
        ? `Only ${available} left of ${l.product.name} in ${l.colour} / ${l.size}`
        : `${l.product.name} in ${l.colour} / ${l.size} just sold out`, { slug: l.product.slug, colour: l.colour, size: l.size, available, reason: 'stock' });
    }
  }
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const pieces = lines.reduce((s, l) => s + l.qty, 0);
  return { lines, subtotal, pieces };
}

export function deliveryFee(fulfilment, pieces, settings) {
  if (pieces >= settings.freeDeliveryPieces) return 0;
  return fulfilment === 'courier' ? settings.courierFee : 0;
}

export async function createOrder(input, { siteUrl }) {
  const settings = await getSettings();
  const { customer, payment, items } = validateCheckout(input, settings);
  const online = paystackEnabled();

  const order = await transaction(async (db) => {
    const { lines, subtotal, pieces } = await priceItems(items, settings, db);
    const fee = deliveryFee(customer.fulfilment, pieces, settings);
    const o = (await db.query(
      `INSERT INTO orders (ref, access_token, status, payment_method, momo_network, customer_name, phone, email,
         fulfilment, campus, address, city, notes, updates_via, subtotal, delivery_fee, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [newRef(), crypto.randomBytes(18).toString('hex'), online ? 'pending_payment' : 'awaiting_manual_payment',
        payment.method, payment.network, customer.name, customer.phone, customer.email || null,
        customer.fulfilment, customer.campus || null, customer.address || null, customer.city || null, customer.notes || null,
        customer.updates, subtotal, fee, subtotal + fee])).rows[0];
    for (const l of lines) {
      await db.query(
        'INSERT INTO order_items (order_id, product_id, product_slug, product_name, colour, size, qty, unit_price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [o.id, l.product.id, l.product.slug, l.product.name, l.colour, l.size, l.qty, l.product.price]);
    }
    await logEvent(db, o.id, 'created', online ? `Checkout started (${payment.method})` : 'Order placed, awaiting manual MoMo payment');
    return o;
  });

  const orderUrl = `${siteUrl}/order?ref=${order.ref}&t=${order.access_token}`;
  if (!online) {
    await notify.orderAwaitingManualPayment(order, await getItems(order.id), siteUrl);
    return { ref: order.ref, token: order.access_token, total: order.total / 100, mode: 'manual', orderUrl };
  }

  try {
    const placeholderDomain = process.env.PAYSTACK_PLACEHOLDER_EMAIL_DOMAIN || 'customers.craf7ton.com';
    const tx = await paystack.initializeTransaction({
      email: order.email || `${order.phone}@${placeholderDomain}`,
      amount: order.total,
      reference: order.ref,
      callbackUrl: orderUrl,
      channels: payment.method === 'momo' ? ['mobile_money'] : ['card'],
      metadata: {
        order_ref: order.ref,
        custom_fields: [
          { display_name: 'Customer', variable_name: 'customer', value: order.customer_name },
          { display_name: 'Phone', variable_name: 'phone', value: `+${order.phone}` }
        ]
      }
    });
    await query('UPDATE orders SET paystack_reference = $1 WHERE id = $2', [tx.reference || order.ref, order.id]);
    return { ref: order.ref, token: order.access_token, total: order.total / 100, mode: 'paystack', authorizationUrl: tx.authorization_url, orderUrl };
  } catch (err) {
    console.error('[checkout] paystack init failed', err.message);
    await query("UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1", [order.id]);
    await logEvent({ query }, order.id, 'payment_init_failed', err.message);
    throw new HttpError(502, "We couldn't reach the payment provider. Please try again, or order on WhatsApp.");
  }
}

/* ---------- payment confirmation ----------
 * Called from the webhook, the return-page verify, and the admin "mark paid" button.
 * Idempotent: a paid order is never processed twice, and stock moves exactly once. */
export async function markPaid(ref, { amount, currency = 'GHS', source, siteUrl }) {
  const result = await transaction(async (db) => {
    const o = (await db.query('SELECT * FROM orders WHERE ref = $1 FOR UPDATE', [ref])).rows[0];
    if (!o) return { ok: false, reason: 'not_found' };
    if (o.payment_status === 'paid') return { ok: true, already: true, order: o };
    if (amount != null && (Number(amount) !== o.total || currency !== o.currency)) {
      await logEvent(db, o.id, 'amount_mismatch', `Expected ${o.total} ${o.currency}, got ${amount} ${currency} via ${source}`);
      return { ok: false, reason: 'amount_mismatch', order: o };
    }
    let stockIssue = false;
    if (!o.stock_applied) {
      const items = await getItems(o.id, db);
      for (const i of items) {
        const r = await db.query(
          `UPDATE variants v SET stock = v.stock - $1 FROM products p
           WHERE v.product_id = p.id AND p.id = $2 AND p.track_stock AND v.colour = $3 AND v.size = $4 RETURNING v.stock`,
          [i.qty, i.product_id, i.colour, i.size]);
        if (r.rows[0] && r.rows[0].stock < 0) stockIssue = true;
      }
    }
    const updated = (await db.query(
      `UPDATE orders SET payment_status = 'paid', status = CASE WHEN status IN ('pending_payment','awaiting_manual_payment','expired','cancelled') THEN 'paid' ELSE status END,
         paid_at = now(), stock_applied = true, stock_issue = stock_issue OR $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [o.id, stockIssue])).rows[0];
    await logEvent(db, o.id, 'paid', `Payment confirmed via ${source}${stockIssue ? ' (stock went negative)' : ''}`);
    return { ok: true, order: updated };
  });

  if (result.ok && !result.already) {
    await notify.orderPaid(result.order, await getItems(result.order.id), siteUrl);
  } else if (result.reason === 'amount_mismatch') {
    await notify.paymentProblem(result.order, `Payment amount didn't match the order total (${source}). The order was NOT marked paid.`);
  }
  return result;
}

/* Ask Paystack directly. Used when the customer lands back on the order page, so they see
 * "paid" even if the webhook is a few seconds behind. */
export async function refreshPayment(order, siteUrl) {
  if (!paystackEnabled() || order.payment_status === 'paid' || !['pending_payment', 'expired'].includes(order.status)) return order;
  try {
    const tx = await paystack.verifyTransaction(order.paystack_reference || order.ref);
    if (tx.status === 'success') {
      const r = await markPaid(order.ref, { amount: tx.amount, currency: tx.currency, source: 'verify', siteUrl });
      if (r.order) return r.order;
    } else if (['failed', 'abandoned', 'reversed'].includes(tx.status)) {
      return { ...order, last_payment_status: tx.status };
    }
  } catch (err) {
    // "Transaction reference not found" just means the customer never finished paying.
    if (!/not found/i.test(err.message)) console.error('[verify]', err.message);
  }
  return order;
}

export async function findOrderForCustomer(ref, token) {
  const o = await one('SELECT * FROM orders WHERE ref = $1', [ref]);
  if (!o || !token || o.access_token.length !== token.length || !crypto.timingSafeEqual(Buffer.from(o.access_token), Buffer.from(token))) return null;
  return o;
}

export async function publicOrder(o) {
  const items = await getItems(o.id);
  return {
    ref: o.ref,
    status: o.status,
    paymentStatus: o.payment_status,
    lastPaymentStatus: o.last_payment_status || null,
    paymentMethod: o.payment_method,
    customerName: o.customer_name,
    fulfilment: o.fulfilment,
    campus: o.campus,
    city: o.city,
    subtotal: o.subtotal / 100,
    deliveryFee: o.delivery_fee / 100,
    total: o.total / 100,
    createdAt: o.created_at,
    paidAt: o.paid_at,
    items: items.map((i) => ({ id: i.product_slug, name: i.product_name, colour: i.colour, size: i.size, qty: i.qty, price: i.unit_price / 100 }))
  };
}

/* ---------- admin actions ---------- */

export async function setStatus(ref, status, { notifyCustomer, note }) {
  const o = await one('UPDATE orders SET status = $2, updated_at = now() WHERE ref = $1 RETURNING *', [ref, status]);
  if (!o) throw new HttpError(404, 'Order not found');
  await logEvent({ query }, o.id, 'status', `Status set to ${status}${note ? `: ${note}` : ''}`);
  if (notifyCustomer && notify.hasStatusMessage(status)) {
    await notify.orderStatusChanged(o);
    await logEvent({ query }, o.id, 'notified', `Customer notified (${status})`);
  }
  return o;
}

/* Restock when a paid order is cancelled, so inventory stays honest. */
export async function cancelAndRestock(ref) {
  return transaction(async (db) => {
    const o = (await db.query('SELECT * FROM orders WHERE ref = $1 FOR UPDATE', [ref])).rows[0];
    if (!o) throw new HttpError(404, 'Order not found');
    if (o.stock_applied) {
      for (const i of await getItems(o.id, db)) {
        await db.query('UPDATE variants SET stock = stock + $1 WHERE product_id = $2 AND colour = $3 AND size = $4', [i.qty, i.product_id, i.colour, i.size]);
      }
      await db.query('UPDATE orders SET stock_applied = false WHERE id = $1', [o.id]);
      await logEvent(db, o.id, 'restocked', 'Items returned to stock');
    }
    return o;
  });
}

export async function expireStale(hours = 24) {
  const { rows } = await query(
    `UPDATE orders SET status = 'expired', updated_at = now()
     WHERE status = 'pending_payment' AND payment_status = 'unpaid' AND created_at < now() - ($1 || ' hours')::interval RETURNING id`, [String(hours)]);
  for (const r of rows) await logEvent({ query }, r.id, 'expired', `Unpaid after ${hours}h`);
  return rows.length;
}
