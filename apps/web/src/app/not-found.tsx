import Link from "next/link"
import { Home } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-6xl font-light text-muted-foreground">404</p>
      <h1 className="mt-4 text-lg font-medium">页面未找到</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        你访问的页面不存在或已被移除
      </p>
      <Link href="/" className="mt-6">
        <Button variant="outline" className="gap-2">
          <Home className="h-4 w-4" />
          返回首页
        </Button>
      </Link>
    </div>
  )
}
