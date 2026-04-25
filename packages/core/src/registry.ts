import type { ModuleManifest } from "./types/module"

export class ModuleRegistry {
  private modules: Map<string, ModuleManifest> = new Map()

  register(manifest: ModuleManifest): void {
    if (this.modules.has(manifest.id)) {
      console.warn(`Module "${manifest.id}" is already registered. Overwriting.`)
    }
    this.modules.set(manifest.id, manifest)
  }

  unregister(id: string): boolean {
    return this.modules.delete(id)
  }

  get(id: string): ModuleManifest | undefined {
    return this.modules.get(id)
  }

  getAll(): ModuleManifest[] {
    return Array.from(this.modules.values()).sort((a, b) => a.order - b.order)
  }

  getEnabled(): ModuleManifest[] {
    return this.getAll().filter((m) => m.enabled)
  }

  getByCategory(category: string): ModuleManifest[] {
    return this.getEnabled().filter((m) => m.category === category)
  }

  has(id: string): boolean {
    return this.modules.has(id)
  }
}
