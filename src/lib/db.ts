import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS shops (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      is_shopify BOOLEAN DEFAULT false,
      search_selector TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS drops (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT DEFAULT '',
      shop_id INTEGER DEFAULT NULL,
      search_term TEXT DEFAULT '',
      drop_mode TEXT DEFAULT 'url',
      monitor_interval INTEGER DEFAULT 3,
      quantity INTEGER DEFAULT 1,
      profile_id INTEGER,
      use_proxy BOOLEAN DEFAULT false,
      keyword TEXT DEFAULT '',
      atc_selector TEXT DEFAULT '',
      checkout_mode TEXT DEFAULT 'browser',
      status TEXT DEFAULT 'idle',
      found_url TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS profiles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      address1 TEXT DEFAULT '',
      address2 TEXT DEFAULT '',
      city TEXT DEFAULT '',
      postcode TEXT DEFAULT '',
      country TEXT DEFAULT 'GB',
      card_name TEXT DEFAULT '',
      card_number TEXT DEFAULT '',
      card_expiry TEXT DEFAULT '',
      card_cvv TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      drop_id INTEGER,
      level TEXT DEFAULT 'info',
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export { sql };
