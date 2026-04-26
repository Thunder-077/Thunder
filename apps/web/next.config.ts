import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: [
    "@thunder/core",
    "@thunder/api-client",
    "@thunder/vault",
    "@thunder/contracts",
  ],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.API_URL || "http://localhost:3001"}/api/v1/:path*`,
      },
    ]
  },
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      syncWebAssembly: true,
    }
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    })
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    }
    return config
  },
}

export default nextConfig
