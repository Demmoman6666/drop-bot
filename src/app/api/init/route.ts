export const dynamic = "force-dynamic";
import { initDB } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  await initDB();
  return NextResponse.json({ ok: true });
}
