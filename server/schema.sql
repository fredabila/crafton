-- Craf7ton schema. Safe to run repeatedly (npm run migrate).
-- Money is stored in pesewas (GHS x 100) as integers.

CREATE TABLE IF NOT EXISTS products (
  id           SERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'tee',
  category     TEXT NOT NULL,
  stacks       TEXT[] NOT NULL DEFAULT '{}',
  price        INTEGER NOT NULL CHECK (price >= 0),
  colours      JSONB NOT NULL DEFAULT '[]',
  sizes        JSONB NOT NULL DEFAULT '[]',
  front_print  TEXT NOT NULL DEFAULT '',
  back_print   TEXT NOT NULL DEFAULT '',
  tagline      TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  details      JSONB NOT NULL DEFAULT '[]',
  images       JSONB NOT NULL DEFAULT '{}',
  is_new       BOOLEAN NOT NULL DEFAULT false,
  quote_only   BOOLEAN NOT NULL DEFAULT false,
  track_stock  BOOLEAN NOT NULL DEFAULT true,
  active       BOOLEAN NOT NULL DEFAULT true,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS variants (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  colour      TEXT NOT NULL,
  size        TEXT NOT NULL,
  stock       INTEGER NOT NULL DEFAULT 0,
  sku         TEXT,
  UNIQUE (product_id, colour, size)
);

CREATE TABLE IF NOT EXISTS orders (
  id                  SERIAL PRIMARY KEY,
  ref                 TEXT UNIQUE NOT NULL,
  access_token        TEXT NOT NULL,
  status              TEXT NOT NULL,
  payment_status      TEXT NOT NULL DEFAULT 'unpaid',
  payment_method      TEXT NOT NULL,
  momo_network        TEXT,
  customer_name       TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT,
  fulfilment          TEXT NOT NULL,
  campus              TEXT,
  address             TEXT,
  city                TEXT,
  notes               TEXT,
  updates_via         TEXT NOT NULL DEFAULT 'WhatsApp',
  subtotal            INTEGER NOT NULL,
  delivery_fee        INTEGER NOT NULL,
  total               INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'GHS',
  paystack_reference  TEXT,
  paid_at             TIMESTAMPTZ,
  stock_applied       BOOLEAN NOT NULL DEFAULT false,
  stock_issue         BOOLEAN NOT NULL DEFAULT false,
  admin_notes         TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_phone_idx ON orders (phone);

CREATE TABLE IF NOT EXISTS order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_slug  TEXT NOT NULL,
  product_name  TEXT NOT NULL,
  colour        TEXT NOT NULL,
  size          TEXT NOT NULL,
  qty           INTEGER NOT NULL CHECK (qty > 0),
  unit_price    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  message     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id            SERIAL PRIMARY KEY,
  club          TEXT NOT NULL,
  contact_name  TEXT,
  pieces        INTEGER NOT NULL,
  garment       TEXT,
  whatsapp      TEXT NOT NULL,
  email         TEXT,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'new',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  contact     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscribers (
  id          SERIAL PRIMARY KEY,
  contact     TEXT UNIQUE NOT NULL,
  kind        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL
);
