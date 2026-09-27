import { NextResponse } from "next/server";
import { loadBond } from "@/lib/chain";
import { demoInfo } from "@/lib/demo-signer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  try {
    const bond = await loadBond(address);
    const demo = await demoInfo(bond).catch(() => ({ enabled: false }));
    return NextResponse.json({ ...bond, demo });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 404 });
  }
}
