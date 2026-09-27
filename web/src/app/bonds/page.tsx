import { BondsScreen } from "@/components/BondsScreen";
import { demoEnabled } from "@/lib/demo-signer";

export const dynamic = "force-dynamic";

export default function BondsPage() {
  return <BondsScreen demo={demoEnabled()} />;
}
