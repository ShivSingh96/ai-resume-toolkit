import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone",       // required for the Docker build(The output: "standalone" setting conflicts with Vercel's build system — it's only for Docker. Vercel manages its own output format.)
  typescript: {
    ignoreBuildErrors: true,  // tsc runs in CI separately
  },
};

export default nextConfig;
