# Craf7ton store

The Craf7ton online store: a mobile-first storefront, an admin dashboard, and an API. It runs on **Vercel** with **Postgres** for data and **Vercel Blob** for product photos. Payments go through **Paystack** (Mobile Money first, then cards).

## What's in it

**Storefront** (`public/`)
- Home, shop (filter by stack, category and colour, plus search), product pages at `/products/<slug>`, clubs, story, contact, size guide, and delivery and returns.
- A three-step checkout (Bag → Details → Pay) with no account needed. Customers choose campus pickup or courier delivery, then pay through Paystack's hosted page with Mobile Money (MTN, Telecel, AirtelTigo) or a card.
- An order tracking page at `/order?ref=…&t=…`. It confirms payment with Paystack directly, so customers see "Payment received" even when the webhook is late.
- Stock aware: sold-out sizes are disabled, low stock shows "only N left", and the bag corrects itself if stock changes.
- Product pages are rendered on the server with title, description, Open Graph tags and Product JSON-LD, so links shared on WhatsApp show the product. `/sitemap.xml` and `/robots.txt` are generated.

**Admin** (`/admin`, password protected)
- **Dashboard:** sales today, 7 days and 30 days; orders to pack; low-stock alerts; inbox counts.
- **Orders:** search and filter. Update the status (paid → processing → ready for pickup or shipped → completed), with an optional SMS or email to the customer. Mark manual MoMo orders as paid. Cancelling an order restocks it. Each order has a timeline and admin notes.
- **Products:** add, edit and archive. Edit colours, sizes, stock per colour and size, photo uploads (front, back, close-up print, on body), and the "New in" and quote-only flags.
- Club quote requests, contact messages, drop subscribers (with CSV export), and store settings (announcement bar, contact details, delivery fee, free-delivery threshold, pickup campuses).

**API** (`server/`, served by the single function `api/index.js`)
- **Prices and stock:** prices, stock and delivery fees are always recalculated on the server. The browser never decides what a customer pays.
- **Paystack webhook:** checked with an HMAC-SHA512 signature, then confirmed again with Paystack's verify API. Duplicate webhooks are safe: stock is taken exactly once, and a payment for the wrong amount is never marked paid.
- **Notifications:** SMS through Arkesel and email through Resend, for order confirmations, status updates and store alerts.
- **Daily cron:** unpaid orders expire after 24 hours.
- **Security:** an admin session cookie (HttpOnly, SameSite=Strict, signed) plus a CSRF header on admin changes; security headers and a CSP; honeypot and rate limits on public forms.

## Deploy to Vercel

1. **Import the repo** in Vercel (Add New → Project). Leave Framework Preset as **Other**; `vercel.json` handles the rest.
2. **Add a database:** Project → Storage → Marketplace → **Neon** (Postgres). This sets `DATABASE_URL`.
3. **Add photo storage:** Project → Storage → **Blob** → create a store. This sets `BLOB_READ_WRITE_TOKEN`.
4. **Set environment variables** (Settings → Environment Variables). See `.env.example` for all of them:
   - `SITE_URL`: your live address, e.g. `https://craf7ton.com`
   - `ADMIN_PASSWORD`: a long password
   - `SESSION_SECRET`: run `openssl rand -hex 32`
   - `CRON_SECRET`: any random string
   - `PAYSTACK_SECRET_KEY`: from the Paystack dashboard. Start with `sk_test_…`, switch to `sk_live_…` at launch.
   - `RESEND_API_KEY`, `MAIL_FROM`, `STORE_EMAIL`: order emails
   - `ARKESEL_API_KEY`, `SMS_SENDER`, `STORE_PHONE`: order SMS
5. **Deploy** (or redeploy after adding the database). Each build creates or updates the database tables and adds any starter products that are missing, so nothing needs to run on your computer. Starter products start with 0 stock (set `SEED_STOCK` to change that). Existing products and stock are never overwritten.
6. **Set up the Paystack webhook:** in Paystack → Settings → API Keys & Webhooks, set the webhook URL to `https://YOUR-DOMAIN/api/paystack/webhook`.
7. Open `/admin`, log in, and fill in **Settings** and real stock counts.

### Before taking real money
- [ ] Replace `public/assets/img/logo.svg` with the supplied wordmark (keep the filename).
- [ ] Set real prices, stock and photos in **Admin → Products**. Starter prices and the size chart are placeholders.
- [ ] Set the WhatsApp number, email, social links, delivery fee and campuses in **Admin → Settings**.
- [ ] Verify your sending domain in Resend and get your Arkesel sender ID approved.
- [ ] Do one real Paystack **test** payment end to end (MoMo and card), then switch to live keys.
- [ ] Have the brand team approve the delivery, returns and story copy (`public/*.html`).
- [ ] Optional: add analytics. `app.js` already sends `add_to_cart`, `begin_checkout`, `purchase` and `club_form_submit` to `dataLayer`, `gtag`, `plausible` and `fbq`. Allow the analytics domain in the CSP in `vercel.json`.
- [ ] Optional: turn on Vercel Firewall rate limiting for `/api/checkout` and `/api/admin/login`.

### Without Paystack
If `PAYSTACK_SECRET_KEY` is empty, checkout still works in **manual MoMo mode**. The order is saved as "awaiting manual payment", and the customer and store are both notified. You then send the customer your MoMo number on WhatsApp, and once the money arrives you press **Mark as paid** in the admin. That takes the items out of stock and texts the customer.

## Run locally

Needs Node 22+ and a Postgres database (local, Docker, or a free Neon branch).

```sh
npm install
cp .env.example .env          # set DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET
npm run migrate && npm run seed
npm run dev                   # http://localhost:3000, admin at /admin
```

Without a Blob token, local uploads are saved to `public/uploads/`.

## Tests

```sh
createdb crafton_test         # the tests wipe this database
npm test                      # uses DATABASE_URL from .env.test
```

The integration tests run the real API against Postgres, with a mock Paystack server. They cover price tampering, stock limits, webhook signatures, idempotent payment, amount mismatches, manual mode, restocking on cancel, admin auth and CSRF, product CRUD and the cron. CI runs them on every push (`.github/workflows/test.yml`).

## Project layout

```
api/index.js          Vercel function: routes every /api/* request to server/app.js
server/
  app.js              API routes (public, webhook, admin, SEO)
  orders.js           checkout, payment confirmation, stock, status changes
  catalog.js          product shaping for the storefront
  paystack.js         Paystack API + webhook signature check
  notify.js           SMS (Arkesel) and email (Resend)
  auth.js             admin login and sessions
  settings.js         store settings with defaults
  taxonomy.js         stacks, categories, statuses
  schema.sql          database schema
  seed-products.js    starter catalogue
scripts/              migrate, seed, local dev server
public/               storefront and admin (static)
tests/                API integration tests
```

## Not in v1 (per the brief)
Customer accounts and loyalty, live social feed, AI chatbot, comparison tool, app. Automated WhatsApp messages need Meta's WhatsApp Business API and approved templates, so v1 sends SMS and email automatically and uses WhatsApp links for conversations.
