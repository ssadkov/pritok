import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Anchor and web3.js are used only in server routes.
  serverExternalPackages: ["@coral-xyz/anchor", "@solana/web3.js"],
};

export default nextConfig;
