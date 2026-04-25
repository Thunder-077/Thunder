export type ModuleCategory =
  | "productivity"
  | "security"
  | "ai"
  | "notes"
  | "tools"
  | "dashboard"
  | "other"

export interface ModuleManifest {
  id: string
  name: string
  description: string
  icon: string
  route: string
  category: ModuleCategory
  order: number
  enabled: boolean
  component?: string
  settingsSchema?: Record<string, unknown>
}
