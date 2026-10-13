/* Load the starter catalogue (server/seed-products.js). Existing products with the same slug are
 * left alone unless you pass --force. New variants start with SEED_STOCK units (default 20).
 * Usage: npm run seed [-- --force] */
import { query, closePool } from '../server/db.js';
import { PRODUCTS } from '../server/seed-products.js';

const force = process.argv.includes('--force');
const stock = Number(process.env.SEED_STOCK ?? 20);
let added = 0;

for (const [i, p] of PRODUCTS.entries()) {
  const existing = (await query('SELECT id FROM products WHERE slug = $1', [p.id])).rows[0];
  if (existing && !force) continue;
  const cols = [p.id, p.name, p.type, p.category, p.stacks, Math.round(p.price * 100), JSON.stringify(p.colours), JSON.stringify(p.sizes),
    p.front || '', p.back || '', p.tagline || '', p.description || '', JSON.stringify(p.details || []), JSON.stringify(p.images || {}),
    Boolean(p.isNew), Boolean(p.quoteOnly), !p.quoteOnly, i * 10];
  const { rows } = await query(
    `INSERT INTO products (slug, name, type, category, stacks, price, colours, sizes, front_print, back_print, tagline, description, details, images, is_new, quote_only, track_stock, sort)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, type=EXCLUDED.type, category=EXCLUDED.category, stacks=EXCLUDED.stacks, price=EXCLUDED.price,
       colours=EXCLUDED.colours, sizes=EXCLUDED.sizes, front_print=EXCLUDED.front_print, back_print=EXCLUDED.back_print, tagline=EXCLUDED.tagline,
       description=EXCLUDED.description, details=EXCLUDED.details, is_new=EXCLUDED.is_new, quote_only=EXCLUDED.quote_only, sort=EXCLUDED.sort, updated_at=now()
     RETURNING id`, cols);
  for (const c of p.colours) {
    for (const s of p.sizes) {
      await query('INSERT INTO variants (product_id, colour, size, stock) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [rows[0].id, c.name, s, stock]);
    }
  }
  added += 1;
}
console.log(`Seeded ${added} product(s).`);
await closePool();
