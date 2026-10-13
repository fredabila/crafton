/* Create or update the database schema. Safe to re-run. Usage: npm run migrate */
import fs from 'node:fs/promises';
import { query, closePool } from '../server/db.js';

const sql = await fs.readFile(new URL('../server/schema.sql', import.meta.url), 'utf8');
await query(sql);
console.log('Schema is up to date.');
await closePool();
