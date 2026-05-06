"use client"

import { createContext, useContext, useState } from "react"
import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/sidebar"
import { AppChrome } from "@/components/topbar"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type AppShellFooterContextValue = {
  footer: React.ReactNode
  setFooter: (footer: React.ReactNode) => void
  hasPageHeader: boolean
  setHasPageHeader: (value: boolean) => void
  onToggleSidebar: () => void
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
  const [hasPageHeader, setHasPageHeader] = useState(false)

  if (pathname === "/login") {
    return <>{children}</>
  }

  return (
    <AppShellFooterContext.Provider
      value={{
        footer,
        setFooter,
        hasPageHeader,
        setHasPageHeader,
        onToggleSidebar: () => setMobileSidebarOpen(true),
      }}
    >
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
            <div className="w-full py-4 sm:py-5">
              <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
                <div className="relative">
                  {!hasPageHeader && (
                    <div className="mb-6 flex justify-end md:absolute md:top-0 md:right-0 md:z-[var(--z-sticky)] md:mb-0">
                      <AppChrome onToggleSidebar={() => setMobileSidebarOpen(true)} />
                    </div>
                  )}
                  <div className="pb-5">
                    {children}
                    {footer && (
                      <div className="pt-6">
                        {footer}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </AppShellFooterContext.Provider>
  )
}
