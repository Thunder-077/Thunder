import type { NextConfig } from "next"

// 在编译期最顶层，尝试从构建进程的 argv 中解析命令行排除参数
// 支持 --exclude=... 或 --exclude-modules=... 格式，防止与 turbo build --exclude 保留命令冲突
for (let i = 0; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (arg.startsWith("--exclude=") || arg.startsWith("--exclude-modules=")) {
    process.env.NEXT_PUBLIC_EXCLUDE_MODULES = arg.split("=")[1]
  } else if ((arg === "--exclude" || arg === "--exclude-modules") && i + 1 < process.argv.length) {
    process.env.NEXT_PUBLIC_EXCLUDE_MODULES = process.argv[i + 1]
  }
}

if (process.env.NEXT_PUBLIC_EXCLUDE_MODULES) {
  console.log(`[Next.js Build] 自动识别到需要排除的模块环境变量: ${process.env.NEXT_PUBLIC_EXCLUDE_MODULES}`)
}

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ['198.18.0.1'],
  transpilePackages: [
    "@thunder/core",
    "@thunder/api-client",
    "@thunder/platform",
    "@thunder/plugin-devtools",
    "@thunder/plugin-sdk",
    "@thunder/vault",
    "@thunder/contracts",
    "@thunder/ui",
    "@thunder/teleprompter-ui",
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
