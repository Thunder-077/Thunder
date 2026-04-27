"use client"

import { useState } from "react"
import { AppSidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar
        className={cn(
          "hidden shrink-0 transition-all duration-200 md:flex"
        )}
      />

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[240px] border-r border-border p-0 sm:max-w-[240px]"
        >
          <AppSidebar onNavigate={() => setMobileSidebarOpen(false)} className="border-r-0" />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onToggleSidebar={() => setMobileSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
