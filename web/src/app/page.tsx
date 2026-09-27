import { redirect } from "next/navigation";
import { DEFAULT_BOND } from "@/lib/demo";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = new URLSearchParams(await searchParams).toString();
  redirect(`/bond/${DEFAULT_BOND}${q ? `?${q}` : ""}`);
}
