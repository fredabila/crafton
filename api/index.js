/* Vercel entry point. vercel.json rewrites every /api/* request here, so the whole API is a
 * single function (keeps cold starts shared and stays well under plan function limits). */
import { handle } from '../server/app.js';

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
