import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  cacheComponents: true,
  transpilePackages: [
    "@paidaid/shared",
    "@paidaid/near",
    "@near-wallet-selector/core",
    "@near-wallet-selector/react-hook",
    "@near-wallet-selector/modal-ui",
    "@near-wallet-selector/intear-wallet",
  ],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
