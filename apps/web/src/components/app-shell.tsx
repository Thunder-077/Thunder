"use client"

import { useState } from "react"
import { AppSidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
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
        <Topbar onToggleSidebar={() => setMobileSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[var(--content-max-width)] flex-col px-4 py-5 sm:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
