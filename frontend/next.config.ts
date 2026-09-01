import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",       // required for the Docker build
  eslint: {
    ignoreDuringBuilds: true, // lint locally, not on Vercel
  },
  typescript: {
    ignoreBuildErrors: true,  // tsc runs in CI separately
  },
};

export default nextConfig;
