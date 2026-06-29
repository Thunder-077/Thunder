import type { PropsWithChildren } from "react"
import "./app.css"

function App({ children }: PropsWithChildren) {
  // Taro 会把当前页面作为 children 注入，这里只保留应用壳职责。
  return children
}

export default App
