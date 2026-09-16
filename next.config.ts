import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site: prerendered HTML + assets, no server at runtime.
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,

  // Shaders live in their own .wgsl files; vgpu's loader resolves their
  // imports at build time. Turbopack for `next dev`/`next build`, webpack
  // when either runs with --webpack.
  turbopack: {
    rules: {
      "*.wgsl": { loaders: ["@vgpu/wgsl/loader-webpack"], as: "*.js" },
    },
  },
  webpack(config) {
    config.module.rules.push({ test: /\.wgsl$/, loader: "@vgpu/wgsl/loader-webpack" });
    return config;
  },
};

export default nextConfig;
