import { definePlugin } from "@thunder/plugin-sdk"

function __PLUGIN_NAME__Panel() {
  return null
}

export default definePlugin({
  setup(app) {
    app.panels.register("main", {
      title: "__PLUGIN_NAME__",
      component: __PLUGIN_NAME__Panel,
    })

    app.commands.register("__PLUGIN_ID__.open", async () => {
      await app.navigation.openPanel("main")
    })
  },
})
