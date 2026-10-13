/*
 * Customer and store notifications.
 *  - Email: Resend (RESEND_API_KEY, MAIL_FROM). Store alerts go to STORE_EMAIL.
 *  - SMS: Arkesel (ARKESEL_API_KEY, SMS_SENDER). Store alerts go to STORE_PHONE.
 * Every channel is optional; a missing key just skips that channel. Failures never break checkout.
 */
import { cedis } from './http.js';

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const log = (...a) => { if (process.env.NODE_ENV !== 'test') console.log('[notify]', ...a); };

export const sent = []; // captured in tests

export async function sendEmail({ to, subject, text, html }) {
  if (!to) return false;
  if (process.env.NOTIFY_CAPTURE === '1') { sent.push({ channel: 'email', to, subject, text }); return true; }
  if (!process.env.RESEND_API_KEY) { log('email skipped (no RESEND_API_KEY):', subject); return false; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM || 'Craf7ton <orders@craf7ton.com>', to: [to], subject, text, html: html || `<pre style="font:14px/1.5 system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>` }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return true;
  } catch (err) {
    console.error('[notify] email failed', err.message);
    return false;
  }
}

export async function sendSms(to, message) {
  if (!to) return false;
  if (process.env.NOTIFY_CAPTURE === '1') { sent.push({ channel: 'sms', to, text: message }); return true; }
  if (!process.env.ARKESEL_API_KEY) { log('sms skipped (no ARKESEL_API_KEY):', message.slice(0, 60)); return false; }
  try {
    const res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: { 'api-key': process.env.ARKESEL_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: (process.env.SMS_SENDER || 'Craf7ton').slice(0, 11), message, recipients: [to] }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`Arkesel ${res.status}: ${await res.text()}`);
    return true;
  } catch (err) {
    console.error('[notify] sms failed', err.message);
    return false;
  }
}

const storeEmail = () => process.env.STORE_EMAIL;
const storePhone = () => process.env.STORE_PHONE;

function itemLines(items) {
  return items.map((i) => `- ${i.product_name} (${i.colour}, ${i.size}) x${i.qty}  ${cedis(i.unit_price * i.qty)}`).join('\n');
}

function whereText(o) {
  return o.fulfilment === 'courier' ? `Courier to ${o.address}, ${o.city}` : `Campus pickup: ${o.campus}`;
}

export function orderSummaryText(o, items) {
  return `Order ${o.ref}\n\n${itemLines(items)}\n\nSubtotal: ${cedis(o.subtotal)}\nDelivery: ${o.delivery_fee ? cedis(o.delivery_fee) : 'Free'}\nTotal: ${cedis(o.total)}\n\n${whereText(o)}`;
}

/* Customer gets an SMS (they asked for WhatsApp/SMS updates, and SMS is the channel we can
 * automate without Meta template approval) and an email when they gave one. */
async function toCustomer(o, smsText, subject, emailText) {
  const jobs = [sendSms(o.phone, smsText)];
  if (o.email) jobs.push(sendEmail({ to: o.email, subject, text: emailText }));
  return Promise.all(jobs);
}

export async function orderPaid(o, items, siteUrl) {
  const link = `${siteUrl}/order?ref=${o.ref}&t=${o.access_token}`;
  await Promise.all([
    toCustomer(o,
      `Craf7ton: payment received for order ${o.ref} (${cedis(o.total)}). We'll message you when it's ${o.fulfilment === 'courier' ? 'on the way' : 'ready for pickup'}. Track: ${link}`,
      `Order ${o.ref} confirmed`,
      `Hi ${o.customer_name},\n\nThanks for your order. Payment received.\n\n${orderSummaryText(o, items)}\n\nTrack your order: ${link}\n\nQuestions? Reply to this email or message us on WhatsApp.\n\nCraf7ton`),
    sendEmail({ to: storeEmail(), subject: `New paid order ${o.ref}, ${cedis(o.total)}`, text: `${orderSummaryText(o, items)}\n\nCustomer: ${o.customer_name}, +${o.phone}${o.email ? `, ${o.email}` : ''}\nPaid by: ${o.payment_method}${o.momo_network ? ` (${o.momo_network})` : ''}${o.stock_issue ? '\n\nWARNING: stock went negative on at least one item. Check inventory.' : ''}${o.notes ? `\nNotes: ${o.notes}` : ''}` }),
    sendSms(storePhone(), `New paid order ${o.ref}: ${cedis(o.total)} from ${o.customer_name}. ${whereText(o)}`)
  ]);
}

export async function orderAwaitingManualPayment(o, items, siteUrl) {
  const link = `${siteUrl}/order?ref=${o.ref}&t=${o.access_token}`;
  await Promise.all([
    toCustomer(o,
      `Craf7ton: we got order ${o.ref} (${cedis(o.total)}). We'll WhatsApp you the MoMo number to pay. Track: ${link}`,
      `Order ${o.ref} received`,
      `Hi ${o.customer_name},\n\nWe've received your order. We'll message you on WhatsApp with the Mobile Money number to pay.\n\n${orderSummaryText(o, items)}\n\nTrack your order: ${link}\n\nCraf7ton`),
    sendEmail({ to: storeEmail(), subject: `New order ${o.ref} awaiting MoMo payment`, text: `${orderSummaryText(o, items)}\n\nCustomer: ${o.customer_name}, +${o.phone}\nSend them the MoMo number on WhatsApp: https://wa.me/${o.phone}` }),
    sendSms(storePhone(), `New order ${o.ref} awaiting MoMo: ${cedis(o.total)} from ${o.customer_name} +${o.phone}`)
  ]);
}

const STATUS_MESSAGES = {
  processing: (o) => `Craf7ton: order ${o.ref} is being packed.`,
  ready_for_pickup: (o) => `Craf7ton: order ${o.ref} is ready for pickup at ${o.campus}. Bring your order number.`,
  shipped: (o) => `Craf7ton: order ${o.ref} is on the way to ${o.city}. The courier will call you.`,
  completed: (o) => `Craf7ton: order ${o.ref} is complete. Thanks for wearing your passion! Tag @craf7ton to be featured.`,
  cancelled: (o) => `Craf7ton: order ${o.ref} has been cancelled. Questions? Reply on WhatsApp.`
};

export function hasStatusMessage(status) { return status in STATUS_MESSAGES; }

export async function orderStatusChanged(o) {
  const msg = STATUS_MESSAGES[o.status];
  if (!msg) return;
  const text = msg(o);
  await toCustomer(o, text, `Order ${o.ref} update`, `Hi ${o.customer_name},\n\n${text.replace(/^Craf7ton: /, '')}\n\nCraf7ton`);
}

export async function paymentProblem(o, problem) {
  await sendEmail({ to: storeEmail(), subject: `Check payment on order ${o.ref}`, text: `${problem}\n\nOrder ${o.ref}, total ${cedis(o.total)}, customer ${o.customer_name} +${o.phone}.` });
}

export async function newQuote(q) {
  await Promise.all([
    sendEmail({ to: storeEmail(), subject: `Club quote request: ${q.club} (${q.pieces} pieces)`, text: `Club: ${q.club}\nContact: ${q.contact_name || '-'}\nPieces: ${q.pieces}\nItem: ${q.garment || '-'}\nWhatsApp: +${q.whatsapp} (https://wa.me/${q.whatsapp})\nEmail: ${q.email || '-'}\nNotes: ${q.notes || '-'}` }),
    sendSms(storePhone(), `New club quote: ${q.club}, ${q.pieces} pcs. WhatsApp +${q.whatsapp}`)
  ]);
}

export async function newMessage(m) {
  await sendEmail({ to: storeEmail(), subject: `Website message from ${m.name}`, text: `${m.message}\n\nFrom: ${m.name} (${m.contact})` });
}
