import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Ensure Next uses this package folder as the output tracing root
  // so it doesn't try to infer the workspace root and repeatedly
  // patch lockfiles for platform-specific `@next/swc` packages.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
