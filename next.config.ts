import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // data/ holds the local demo database; keep it out of the file watcher's way.
  outputFileTracingIncludes: { "/**": ["./data/seed.json"] },
};

export default nextConfig;
