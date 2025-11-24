import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Enable standalone output for Docker deployment
  eslint: {
    //prevent ESLint from failing the Docker / production build
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
