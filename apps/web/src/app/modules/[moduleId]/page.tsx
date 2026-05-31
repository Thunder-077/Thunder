import { notFound } from "next/navigation"
import { moduleLoaders } from "@/generated/enabled-modules"

interface ModulePageProps {
  params: Promise<{
    moduleId: string
  }>
}

export default async function ModulePage({ params }: ModulePageProps) {
  const { moduleId } = await params
  const loader = moduleLoaders[moduleId as keyof typeof moduleLoaders]

  if (!loader) {
    notFound()
  }

  const mod = await loader()
  const Page = mod.default
  return <Page />
}
