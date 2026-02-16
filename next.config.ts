import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use standalone for offline packaging: STANDALONE=1 node scripts/package-offline.js
  ...(process.env.STANDALONE === "1" ? { output: "standalone" as const } : {}),
  // Allow fetching external HTML for research
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Needed for sharp and fs usage in API routes
  serverExternalPackages: ["sharp", "pdfkit", "pdf-lib"],
  // Webpack config for pdfjs-dist (canvas is not needed in browser)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias.canvas = false;
    }
    return config;
  },
};

export default nextConfig;
