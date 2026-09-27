import { redirect } from "next/navigation";
import { DEFAULT_BOND } from "@/lib/demo";

export default function Home() {
  redirect(`/bond/${DEFAULT_BOND}`);
}
