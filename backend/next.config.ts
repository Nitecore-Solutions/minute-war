import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: `output: "standalone"` is deliberately NOT enabled. It conflicts with
  // `next start`, which is what the deploy unit runs.
  poweredByHeader: false,
};

export default nextConfig;