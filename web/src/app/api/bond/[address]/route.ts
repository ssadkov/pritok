import { NextResponse } from "next/server";
import { loadBond } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  try {
    return NextResponse.json(await loadBond(address));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 404 });
  }
}
