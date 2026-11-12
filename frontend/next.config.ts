import type { NextConfig } from "next";

const backendInternal = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendInternal}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
