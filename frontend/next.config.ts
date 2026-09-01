import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // required for the multi-stage Docker build
};

export default nextConfig;
