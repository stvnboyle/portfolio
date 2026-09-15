import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site: prerendered HTML + assets, no server at runtime.
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
