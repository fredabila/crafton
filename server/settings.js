import { query } from './db.js';

/* Store settings editable in the admin. Defaults apply until a value is saved. */
export const DEFAULT_SETTINGS = {
  announcement: 'Free delivery on club orders over 10 pieces',
  whatsapp: '233000000000',
  email: 'hello@craf7ton.com',
  socialHandle: 'craf7ton',
  instagram: 'https://instagram.com/craf7ton',
  tiktok: 'https://www.tiktok.com/@craf7ton',
  courierFee: 3500, // pesewas
  freeDeliveryPieces: 10,
  pickupEnabled: true,
  courierEnabled: true,
  campuses: ['UMaT, Tarkwa', 'KNUST, Kumasi', 'University of Ghana, Legon', 'UCC, Cape Coast', 'Ashesi, Berekuso', 'Other campus (tell us in notes)'],
  lowStockThreshold: 3
};

export async function getSettings() {
  const { rows } = await query('SELECT key, value FROM settings');
  const out = { ...DEFAULT_SETTINGS };
  rows.forEach((r) => { if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value; });
  return out;
}

export async function saveSettings(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    await query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, JSON.stringify(value)]);
  }
  return getSettings();
}

export const paystackEnabled = () => Boolean(process.env.PAYSTACK_SECRET_KEY);
