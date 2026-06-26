export const dynamic = "force-dynamic";
import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  const id = parseInt(params.id);
  if (b.status !== undefined && Object.keys(b).length === 1) {
    await sql`UPDATE drops SET status=${b.status} WHERE id=${id}`;
  } else {
    await sql`
      UPDATE drops SET
        name=${b.name}, url=${b.url||''}, shop_id=${b.shop_id||null},
        search_term=${b.search_term||''}, drop_mode=${b.drop_mode||'url'},
        monitor_interval=${b.monitor_interval||3}, quantity=${b.quantity||1},
        profile_id=${b.profile_id||null}, use_proxy=${b.use_proxy||false},
        keyword=${b.keyword||''}, atc_selector=${b.atc_selector||''},
        checkout_mode=${b.checkout_mode||'browser'}
      WHERE id=${id}
    `;
  }
  const result = await sql`SELECT * FROM drops WHERE id=${id}`;
  return NextResponse.json(result[0]);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await sql`DELETE FROM drops WHERE id=${parseInt(params.id)}`;
  return NextResponse.json({ ok: true });
}
