import { redirect } from "next/navigation";
import { DEMO_INVESTORS } from "@/lib/demo";

export default function PortfolioIndex() {
  redirect(`/portfolio/${DEMO_INVESTORS[0].address}`);
}
