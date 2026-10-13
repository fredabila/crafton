import { query, one } from './db.js';

/* Shape a product row (plus its variants) for the storefront. Prices go out in GHS. */
export function publicProduct(row, variants = []) {
  const stock = row.track_stock && !row.quote_only
    ? Object.fromEntries(variants.map((v) => [`${v.colour}|${v.size}`, Math.max(0, v.stock)]))
    : null;
  return {
    id: row.slug,
    name: row.name,
    type: row.type,
    category: row.category,
    stacks: row.stacks,
    price: row.price / 100,
    colours: row.colours,
    sizes: row.sizes,
    front: row.front_print,
    back: row.back_print,
    tagline: row.tagline,
    description: row.description,
    details: row.details,
    images: row.images || {},
    isNew: row.is_new,
    quoteOnly: row.quote_only,
    stock
  };
}

export async function listPublicProducts() {
  const [{ rows: products }, { rows: variants }] = await Promise.all([
    query('SELECT * FROM products WHERE active ORDER BY sort, id'),
    query('SELECT v.* FROM variants v JOIN products p ON p.id = v.product_id WHERE p.active')
  ]);
  return products.map((p) => publicProduct(p, variants.filter((v) => v.product_id === p.id)));
}

export async function getPublicProduct(slug) {
  const row = await one('SELECT * FROM products WHERE slug = $1 AND active', [slug]);
  if (!row) return null;
  const { rows } = await query('SELECT * FROM variants WHERE product_id = $1', [row.id]);
  return publicProduct(row, rows);
}

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80);
}
