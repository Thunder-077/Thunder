import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ['198.18.0.1'],
  transpilePackages: [
    "@thunder/core",
    "@thunder/api-client",
    "@thunder/vault",
    "@thunder/contracts",
  ],
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
