"use client"

import { createContext, useContext, useState } from "react"
import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type AppShellFooterContextValue = {
  footer: React.ReactNode
  setFooter: (footer: React.ReactNode) => void
}

const AppShellFooterContext = createContext<AppShellFooterContextValue | null>(null)

export function useAppShellFooter() {
  const ctx = useContext(AppShellFooterContext)
  if (!ctx) {
    throw new Error("useAppShellFooter must be used within <AppShell>")
  }
  return ctx
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [footer, setFooter] = useState<React.ReactNode>(null)

  if (pathname === "/login") {
    return <>{children}</>
  }

  return (
    <AppShellFooterContext.Provider value={{ footer, setFooter }}>
      <div className="surface-shell relative flex h-screen overflow-hidden bg-background">
        <AppSidebar
          className={cn(
            "hidden shrink-0 md:flex"
          )}
        />

        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-[240px] border-r border-panel-border bg-transparent p-0 shadow-none sm:max-w-[240px]"
          >
            <AppSidebar onNavigate={() => setMobileSidebarOpen(false)} className="border-r-0" />
          </SheetContent>
        </Sheet>

        <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto">
            <div className="w-full px-4 sm:px-6 xl:px-8">
              <Topbar onToggleSidebar={() => setMobileSidebarOpen(true)} />
              <div className="pb-5 pt-1">
                {children}
              </div>
            </div>
          </main>
          {footer && (
            <div className="shrink-0 px-4 pb-4 sm:px-6 xl:px-8 bg-background">
              {footer}
            </div>
          )}
        </div>
      </div>
    </AppShellFooterContext.Provider>
  )
}
