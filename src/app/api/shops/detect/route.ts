export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  const clean = url.replace(/\/$/, '');
  try {
    const res = await fetch(`${clean}/products.json?limit=1`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.products) {
        return NextResponse.json({ is_shopify: true });
      }
    }
  } catch {}
  return NextResponse.json({ is_shopify: false });
}
