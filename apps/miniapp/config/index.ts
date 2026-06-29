import { defineConfig, type UserConfigExport } from "@tarojs/cli"
import { resolve } from "node:path"

const config = defineConfig<"webpack5">((merge) => {
  const baseConfig: UserConfigExport<"webpack5"> = {
    projectName: "thunder-miniapp",
    date: "2026-06-29",
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      828: 1.81 / 2,
    },
    sourceRoot: "src",
    outputRoot: "dist",
    framework: "react",
    alias: {
      // 与 tsconfig paths 保持一致，让 Taro webpack 能解析小程序模块入口。
      "@": resolve(__dirname, "..", "src"),
    },
    compiler: {
      type: "webpack5",
      prebundle: {
        enable: false,
      },
    },
    cache: {
      enable: false,
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
        },
      },
    },
    h5: {
      publicPath: "/",
      staticDirectory: "static",
    },
  }

  // 按 Taro 当前构建环境合并 dev/prod 配置，避免各平台脚本重复维护配置。
  if (process.env.NODE_ENV === "development") {
    return merge({}, baseConfig, require("./dev").default)
  }

  return merge({}, baseConfig, require("./prod").default)
})

export default config
