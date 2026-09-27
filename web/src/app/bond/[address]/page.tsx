import { BondScreen } from "@/components/BondScreen";

export default async function BondPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return <BondScreen address={address} />;
}
