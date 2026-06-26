export const dynamic = "force-dynamic";
import { sql, initDB } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  await initDB();
  const logs = await sql`SELECT * FROM logs ORDER BY created_at DESC LIMIT 200`;
  return NextResponse.json(logs);
}
