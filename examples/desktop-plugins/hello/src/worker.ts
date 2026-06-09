import { defineWorker } from "@thunder/plugin-sdk/worker"

export default defineWorker({
  handlers: {
    async "hello.greet"(payload: unknown) {
      const name = typeof payload === "string" ? payload : "World"
      return { greeting: `Hello, ${name}!` }
    },
  },
})
