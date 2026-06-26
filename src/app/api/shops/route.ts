export const dynamic = "force-dynamic";
import { sql, initDB } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  await initDB();
  const shops = await sql`SELECT * FROM shops ORDER BY created_at DESC`;
  return NextResponse.json(shops);
}

export async function POST(req: NextRequest) {
  await initDB();
  const b = await req.json();
  const url = b.url.replace(/\/$/, '');
  const result = await sql`
    INSERT INTO shops (name, url, is_shopify, search_selector, login_email, login_password)
    VALUES (${b.name}, ${url}, ${b.is_shopify||false}, ${b.search_selector||''}, ${b.login_email||''}, ${b.login_password||''})
    RETURNING *
  `;
  return NextResponse.json(result[0]);
}
