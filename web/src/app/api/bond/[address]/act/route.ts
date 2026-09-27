import { NextResponse } from "next/server";
import { invalidate, loadBond } from "@/lib/chain";
import { demoEnabled, explain, perform, type Action } from "@/lib/demo-signer";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ address: string }> }) {
  if (!demoEnabled()) return NextResponse.json({ error: "Демо-подписание выключено" }, { status: 403 });
  const { address } = await params;
  const action = (await req.json()) as Action;
  try {
    const bond = await loadBond(address);
    const sig = await perform(bond, action);
    invalidate(address);
    return NextResponse.json({ sig });
  } catch (e) {
    return NextResponse.json({ error: explain(e) }, { status: 400 });
  }
}
