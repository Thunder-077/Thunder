import { notFound, redirect } from "next/navigation"
import { enabledModules, moduleLoaders } from "@/generated/enabled-modules"

interface ModulePageProps {
  params: Promise<{
    moduleId: string
  }>
}

export default async function ModulePage({ params }: ModulePageProps) {
  const { moduleId } = await params
  const manifest = enabledModules.find((module) => module.id === moduleId)
  const isDesktopBuild = process.env.NEXT_PUBLIC_PLATFORM === "desktop"

  if (isDesktopBuild && manifest?.platforms && !manifest.platforms.includes("desktop")) {
    if (moduleId === "teleprompter") {
      redirect("/plugins/teleprompter")
    }
    notFound()
  }

  const loader = moduleLoaders[moduleId as keyof typeof moduleLoaders]

  if (!loader) {
    notFound()
  }

  const mod = await loader()
  const Page = mod.default
  return <Page />
}
