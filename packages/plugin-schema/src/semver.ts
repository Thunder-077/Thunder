/**
 * Lightweight semver utilities for plugin manifest validation.
 *
 * Supports a practical subset of semver:
 *   - Version format: MAJOR.MINOR.PATCH with optional -prerelease
 *   - Range operators: ^, ~, >=, >, <=, <, = (bare version means =)
 *   - Space-separated ranges are ANDed (intersection)
 *   - "||" splits into alternative ranges (union)
 *   - "*" matches anything
 *
 * Does NOT support: build metadata (+build), complex npm range syntax
 * like hyphen ranges (1.0.0 - 2.0.0), or x-ranges (1.x).
 */

export interface SemverTuple {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
}

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*))?$/;

/**
 * Returns true if `version` is a valid semver string (MAJOR.MINOR.PATCH[-prerelease]).
 */
export function isValidSemver(version: string): boolean {
  return SEMVER_PATTERN.test(version);
}

export function parseSemver(version: string): SemverTuple | null {
  const match = SEMVER_PATTERN.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? "",
  };
}

function compareSemver(a: SemverTuple, b: SemverTuple): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  // No prerelease > any prerelease (1.0.0 > 1.0.0-alpha).
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  if (a.prerelease && b.prerelease) {
    return a.prerelease < b.prerelease ? -1 : a.prerelease > b.prerelease ? 1 : 0;
  }
  return 0;
}

function gte(v: SemverTuple, t: SemverTuple): boolean { return compareSemver(v, t) >= 0; }
function gt(v: SemverTuple, t: SemverTuple): boolean { return compareSemver(v, t) > 0; }
function lte(v: SemverTuple, t: SemverTuple): boolean { return compareSemver(v, t) <= 0; }
function lt(v: SemverTuple, t: SemverTuple): boolean { return compareSemver(v, t) < 0; }
function eq(v: SemverTuple, t: SemverTuple): boolean { return compareSemver(v, t) === 0; }

interface RangeComparator {
  op: ">=" | ">" | "<=" | "<" | "=";
  target: SemverTuple;
}

/**
 * Expand ^ and ~ operators into one or two comparators.
 *
 * ^MAJOR.MINOR.PATCH  →  >= MAJOR.MINOR.PATCH  AND  < (MAJOR+1).0.0
 *   (if MAJOR > 0)
 * ^0.MINOR.PATCH      →  >= 0.MINOR.PATCH      AND  < 0.(MINOR+1).0
 *   (if MAJOR === 0 && MINOR > 0)
 * ^0.0.PATCH           →  >= 0.0.PATCH           AND  < 0.0.(PATCH+1)
 *
 * ~MAJOR.MINOR.PATCH  →  >= MAJOR.MINOR.PATCH  AND  < MAJOR.(MINOR+1).0
 */
function expandOperator(op: string, target: SemverTuple): RangeComparator[] {
  if (op === "^") {
    if (target.major > 0) {
      return [
        { op: ">=", target },
        { op: "<", target: { major: target.major + 1, minor: 0, patch: 0, prerelease: "" } },
      ];
    }
    if (target.minor > 0) {
      return [
        { op: ">=", target },
        { op: "<", target: { major: 0, minor: target.minor + 1, patch: 0, prerelease: "" } },
      ];
    }
    return [
      { op: ">=", target },
      { op: "<", target: { major: 0, minor: 0, patch: target.patch + 1, prerelease: "" } },
    ];
  }
  if (op === "~") {
    return [
      { op: ">=", target },
      { op: "<", target: { major: target.major, minor: target.minor + 1, patch: 0, prerelease: "" } },
    ];
  }
  return [{ op: op as RangeComparator["op"], target }];
}

const RANGE_TOKEN_PATTERN = /([~^]|>=|>|<=|<|=)?\s*(\d+\.\d+\.\d+(?:-[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*)?)/g;

function parseRangeAlternative(range: string): RangeComparator[] {
  const comparators: RangeComparator[] = [];
  let match: RegExpExecArray | null;
  RANGE_TOKEN_PATTERN.lastIndex = 0;
  while ((match = RANGE_TOKEN_PATTERN.exec(range)) !== null) {
    const op = match[1] || "=";
    const target = parseSemver(match[2]);
    if (!target) continue;
    comparators.push(...expandOperator(op, target));
  }
  return comparators;
}

function satisfiesComparators(version: SemverTuple, comparators: RangeComparator[]): boolean {
  return comparators.every(({ op, target }) => {
    switch (op) {
      case ">=": return gte(version, target);
      case ">": return gt(version, target);
      case "<=": return lte(version, target);
      case "<": return lt(version, target);
      case "=": return eq(version, target);
      default: return false;
    }
  });
}

/**
 * Returns true if `version` satisfies the semver `range`.
 *
 * Examples:
 *   satisfiesSemverRange("2.1.0", "^2.0.0")   → true
 *   satisfiesSemverRange("3.0.0", "^2.0.0")   → false
 *   satisfiesSemverRange("1.0.0", "*")         → true
 *   satisfiesSemverRange("1.2.3", ">=1.0.0 <2.0.0 || >=3.0.0") → true
 */
export function satisfiesSemverRange(version: string, range: string): boolean {
  if (range.trim() === "*") return true;
  const parsed = parseSemver(version);
  if (!parsed) return false;

  const alternatives = range.split("||").map((alt) => alt.trim());
  return alternatives.some((alt) => {
    const comparators = parseRangeAlternative(alt);
    return comparators.length > 0 && satisfiesComparators(parsed, comparators);
  });
}
