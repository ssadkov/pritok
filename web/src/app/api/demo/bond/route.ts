import { NextResponse } from "next/server";
import { createDemoBond } from "@/lib/demo-bond";
import { demoEnabled, explain } from "@/lib/demo-signer";

export const dynamic = "force-dynamic";
// Bond creation, admission and placement take several devnet round trips.
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!demoEnabled()) return NextResponse.json({ error: "Демо-подписание выключено" }, { status: 403 });
  try {
    const terms = await req.json().catch(() => undefined);
    return NextResponse.json(await createDemoBond(terms));
  } catch (e) {
    return NextResponse.json({ error: explain(e) }, { status: 500 });
  }
}
