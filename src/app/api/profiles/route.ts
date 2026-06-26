export const dynamic = "force-dynamic";
export const dynamic = "force-dynamic";
import { sql, initDB } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  await initDB();
  const profiles = await sql`SELECT * FROM profiles ORDER BY created_at DESC`;
  return NextResponse.json(profiles);
}

export async function POST(req: NextRequest) {
  await initDB();
  const b = await req.json();
  const result = await sql`
    INSERT INTO profiles (name, first_name, last_name, email, phone, address1, address2, city, postcode, country, card_name, card_number, card_expiry, card_cvv)
    VALUES (${b.name}, ${b.first_name||''}, ${b.last_name||''}, ${b.email||''}, ${b.phone||''}, ${b.address1||''}, ${b.address2||''}, ${b.city||''}, ${b.postcode||''}, ${b.country||'GB'}, ${b.card_name||''}, ${b.card_number||''}, ${b.card_expiry||''}, ${b.card_cvv||''})
    RETURNING *
  `;
  return NextResponse.json(result[0]);
}
