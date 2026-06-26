import { sql, initDB } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  await initDB();
  const drops = await sql`SELECT * FROM drops ORDER BY created_at DESC`;
  return NextResponse.json(drops);
}

export async function POST(req: NextRequest) {
  await initDB();
  const b = await req.json();
  const result = await sql`
    INSERT INTO drops (name, url, monitor_interval, quantity, profile_id, use_proxy, keyword, atc_selector, checkout_mode, status)
    VALUES (${b.name}, ${b.url}, ${b.monitor_interval||3}, ${b.quantity||1}, ${b.profile_id||null}, ${b.use_proxy||false}, ${b.keyword||''}, ${b.atc_selector||''}, ${b.checkout_mode||'browser'}, 'idle')
    RETURNING *
  `;
  return NextResponse.json(result[0]);
}
