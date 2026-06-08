import { definePlugin } from "@thunder/plugin-sdk"
import { TeleprompterPanel } from "./features/teleprompter-panel"

export default definePlugin({
  setup(app) {
    app.panels.register("main", {
      title: "提词器",
      component: TeleprompterPanel,
    })

    app.commands.register("teleprompter.open", async () => {
      await app.navigation.openPanel("main")
    })
  },
})
