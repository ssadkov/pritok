import { NextResponse } from "next/server";
import { loadPortfolio } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  try {
    return NextResponse.json(await loadPortfolio(owner));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 });
  }
}
