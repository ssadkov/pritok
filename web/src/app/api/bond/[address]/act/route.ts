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
    // web3.js gives up waiting after 30 s on a slow devnet, but the transaction is
    // usually landed: report it as pending with its signature instead of a failure.
    const text = String((e as Error)?.message ?? e);
    const pending = text.match(/not confirmed in [\d.]+ seconds.*?signature ([1-9A-HJ-NP-Za-km-z]{64,88})/s);
    if (pending) {
      invalidate(address);
      return NextResponse.json({ sig: pending[1], pending: true });
    }
    return NextResponse.json({ error: explain(e) }, { status: 400 });
  }
}
