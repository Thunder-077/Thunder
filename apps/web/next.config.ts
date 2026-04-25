import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@thunder/core", "@thunder/config", "@thunder/ui"],
}

export default nextConfig
