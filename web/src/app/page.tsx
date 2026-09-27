import { redirect } from "next/navigation";
import { DEFAULT_BOND } from "@/lib/demo";
import { latestDemoBond } from "@/lib/demo-bond";
import { demoEnabled } from "@/lib/demo-signer";

export const dynamic = "force-dynamic";

/** Opens the newest demo issue when demo signing is on, otherwise the configured bond. */
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = new URLSearchParams(await searchParams).toString();
  const bond = (demoEnabled() && (await latestDemoBond().catch(() => null))) || DEFAULT_BOND;
  redirect(`/bond/${bond}${q ? `?${q}` : ""}`);
}
