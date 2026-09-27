import { NextResponse } from "next/server";
import { listBonds } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listBonds());
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
