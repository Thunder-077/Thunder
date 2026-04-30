import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { CommandPaletteProvider } from "@/components/command-palette"
import { DialogProvider } from "@/components/dialog-provider"
import { AppShell } from "@/components/app-shell"
import { BootSplashController } from "@/components/boot-splash-controller"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Thunder",
  description: "模块化的个人工作空间应用",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/favicon-192.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <div
          id="thunder-boot-splash"
          className="thunder-splash-screen thunder-boot-splash"
          aria-label="应用启动中"
          role="status"
        >
          <div className="thunder-splash-mark">
            <span className="thunder-splash-glow" aria-hidden="true" />
            <span className="thunder-splash-flash" aria-hidden="true" />
            <span className="thunder-splash-idle-flash" aria-hidden="true" />
            <img
              src="/logo.png"
              alt="Thunder"
              className="thunder-splash-logo"
              draggable="false"
            />
          </div>
        </div>
        <ThemeProvider>
          <DialogProvider>
            <CommandPaletteProvider>
              <TooltipProvider>
                <BootSplashController />
                <AppShell>{children}</AppShell>
              </TooltipProvider>
            </CommandPaletteProvider>
          </DialogProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
