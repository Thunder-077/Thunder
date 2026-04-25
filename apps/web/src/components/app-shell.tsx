"use client"

import { useState } from "react"
import { AppSidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { cn } from "@/lib/utils"

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar
        className={cn(
          "shrink-0 transition-all duration-200",
          !sidebarOpen && "hidden md:flex"
        )}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
