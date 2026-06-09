export class ThunderPluginManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThunderPluginManifestError";
  }
}
