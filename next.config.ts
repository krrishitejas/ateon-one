import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: `output: "standalone"` is intentionally NOT set — it emits Next's own
  // server.js and would bypass the custom Socket.IO server in ./server.js.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ateonlabs.com" },
      { protocol: "https", hostname: "**.ateonlabs.com" },
    ],
  },
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "framer-motion"],
  },
  allowedDevOrigins: ["192.168.1.26"],
};

export default nextConfig;
