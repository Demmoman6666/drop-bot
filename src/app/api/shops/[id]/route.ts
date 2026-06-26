export const dynamic = "force-dynamic";
import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  const id = parseInt(params.id);
  await sql`
    UPDATE shops SET
      name=${b.name}, url=${b.url}, is_shopify=${b.is_shopify||false},
      search_selector=${b.search_selector||''},
      login_email=${b.login_email||''},
      login_password=${b.login_password||''}
    WHERE id=${id}
  `;
  const result = await sql`SELECT * FROM shops WHERE id=${id}`;
  return NextResponse.json(result[0]);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await sql`DELETE FROM shops WHERE id=${parseInt(params.id)}`;
  return NextResponse.json({ ok: true });
}
