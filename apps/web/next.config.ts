import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The metadata scraper is a plain Node.js package (undici + cheerio).
  // Load it from node_modules at runtime instead of bundling it.
  serverExternalPackages: ["@justlink/metadata"],
  experimental: {
    serverActions: {
      // Browser bookmark exports can be a few MB (default limit is 1 MB).
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
