import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  const id = parseInt(params.id);
  await sql`
    UPDATE profiles SET
      name=${b.name}, first_name=${b.first_name||''}, last_name=${b.last_name||''},
      email=${b.email||''}, phone=${b.phone||''}, address1=${b.address1||''},
      address2=${b.address2||''}, city=${b.city||''}, postcode=${b.postcode||''},
      card_name=${b.card_name||''}, card_number=${b.card_number||''},
      card_expiry=${b.card_expiry||''}, card_cvv=${b.card_cvv||''}
    WHERE id=${id}
  `;
  const result = await sql`SELECT * FROM profiles WHERE id=${id}`;
  return NextResponse.json(result[0]);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await sql`DELETE FROM profiles WHERE id=${parseInt(params.id)}`;
  return NextResponse.json({ ok: true });
}
