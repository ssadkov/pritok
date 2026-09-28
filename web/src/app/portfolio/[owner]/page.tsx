import { PortfolioScreen } from "@/components/PortfolioScreen";
import { demoEnabled } from "@/lib/demo-signer";

export const dynamic = "force-dynamic";

export default async function PortfolioPage({ params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  return <PortfolioScreen owner={owner} demo={demoEnabled()} />;
}
