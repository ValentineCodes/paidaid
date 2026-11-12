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
    "@hot-labs/near-connect",
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
