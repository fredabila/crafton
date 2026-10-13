/* Runs on every Vercel build: creates/updates the database tables and adds any starter
 * products that don't exist yet (existing products and stock are never touched).
 * New starter variants get SEED_STOCK units (default 0, so nothing is sold that isn't on the shelf). */
import { execFileSync } from 'node:child_process';

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.warn('[build] No DATABASE_URL yet. Add a Neon database in Vercel (Storage tab), then redeploy.');
  process.exit(0);
}
const env = { ...process.env, SEED_STOCK: process.env.SEED_STOCK ?? '0' };
execFileSync('node', ['scripts/migrate.js'], { stdio: 'inherit', env });
execFileSync('node', ['scripts/seed.js'], { stdio: 'inherit', env });
