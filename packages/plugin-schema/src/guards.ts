/**
 * Type guard for plain objects (non-null, non-array).
 *
 * Shared across plugin packages to eliminate duplication.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
