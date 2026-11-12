import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  cacheComponents: true,
  // Request create uploads up to 10 MB photos via `createRequest` (see MAX_PHOTO_BYTES).
  experimental: {
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },
  transpilePackages: [
    "@base-ui/react",
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
