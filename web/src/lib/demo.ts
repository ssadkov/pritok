// Display names for the devnet demo wallets (keys live in client/.keys).
// Unknown addresses are shown shortened.
export const LABELS: Record<string, string> = {
  "2Yk6W29NqwrH67ZeP1CRpuA2ZXVWNXTzmPBVsnikr2yq": "Айгерим С.",
  DXspRf1H6TF1QNsWKDHfLpmT66rZZmok8eLgJF46pbpi: "Болат Н.",
  "4azBzg3HAXb5cZTB8FQvbLuEuCFcrfgbEWtTjW4VqhXh": "Фонд «Жібек»",
  H4qMo3WbqVE9oREDMAHEYypVMamCzUjcwy6fb5zuRir: "ТОО «СтепьЛогистик»",
  DiFbdAWGJX85yZFbwAE44MfJdi53AVGvG7Y5hdDMZ3ad: "Регистратор",
};

export const ISSUER_NAME: Record<string, string> = {
  H4qMo3WbqVE9oREDMAHEYypVMamCzUjcwy6fb5zuRir: "ТОО «СтепьЛогистик»",
};

export const DEFAULT_BOND =
  process.env.NEXT_PUBLIC_DEFAULT_BOND ?? "2dwYhfHkJCpuwrhYBCvZpLYEzrbkVHzW2tyjzMNXu8RG";

export const label = (addr: string) => LABELS[addr] ?? `${addr.slice(0, 4)}…${addr.slice(-4)}`;

const COLORS = ["#028a29", "#45464f", "#1e212b", "#3cbd0d", "#6b6d76"];
export const colorFor = (addr: string) =>
  COLORS[[...addr].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
