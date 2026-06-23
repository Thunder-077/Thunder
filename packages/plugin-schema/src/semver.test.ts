import assert from "node:assert/strict";
import { isValidSemver, satisfiesSemverRange, parseSemver } from "./semver.js";

// ---- isValidSemver ----
assert.equal(isValidSemver("1.0.0"), true);
assert.equal(isValidSemver("0.0.1"), true);
assert.equal(isValidSemver("2.10.300"), true);
assert.equal(isValidSemver("1.0.0-alpha"), true);
assert.equal(isValidSemver("1.0.0-beta.1"), true);
assert.equal(isValidSemver(""), false);
assert.equal(isValidSemver("1.0"), false);
assert.equal(isValidSemver("1"), false);
assert.equal(isValidSemver("v1.0.0"), false);
assert.equal(isValidSemver("1.0.0.0"), false);
assert.equal(isValidSemver("🎉"), false);
assert.equal(isValidSemver("abc"), false);
assert.equal(isValidSemver("01.0.0"), false, "leading zeros should be invalid");

// ---- parseSemver ----
assert.deepEqual(parseSemver("1.2.3"), { major: 1, minor: 2, patch: 3, prerelease: "" });
assert.deepEqual(parseSemver("0.0.0-alpha"), { major: 0, minor: 0, patch: 0, prerelease: "alpha" });
assert.equal(parseSemver("invalid"), null);

// ---- satisfiesSemverRange: caret (^) ----
assert.equal(satisfiesSemverRange("2.0.0", "^2.0.0"), true);
assert.equal(satisfiesSemverRange("2.1.0", "^2.0.0"), true);
assert.equal(satisfiesSemverRange("2.99.99", "^2.0.0"), true);
assert.equal(satisfiesSemverRange("3.0.0", "^2.0.0"), false);
assert.equal(satisfiesSemverRange("1.9.9", "^2.0.0"), false);

// ^0.y.z — minor-locked
assert.equal(satisfiesSemverRange("0.1.0", "^0.1.0"), true);
assert.equal(satisfiesSemverRange("0.1.5", "^0.1.0"), true);
assert.equal(satisfiesSemverRange("0.2.0", "^0.1.0"), false);

// ^0.0.z — patch-locked
assert.equal(satisfiesSemverRange("0.0.3", "^0.0.3"), true);
assert.equal(satisfiesSemverRange("0.0.4", "^0.0.3"), false);

// ---- satisfiesSemverRange: tilde (~) ----
assert.equal(satisfiesSemverRange("1.2.3", "~1.2.0"), true);
assert.equal(satisfiesSemverRange("1.2.9", "~1.2.0"), true);
assert.equal(satisfiesSemverRange("1.3.0", "~1.2.0"), false);

// ---- satisfiesSemverRange: comparison operators ----
assert.equal(satisfiesSemverRange("2.0.0", ">=2.0.0"), true);
assert.equal(satisfiesSemverRange("1.9.9", ">=2.0.0"), false);
assert.equal(satisfiesSemverRange("2.0.1", ">2.0.0"), true);
assert.equal(satisfiesSemverRange("2.0.0", ">2.0.0"), false);
assert.equal(satisfiesSemverRange("1.9.9", "<2.0.0"), true);
assert.equal(satisfiesSemverRange("2.0.0", "<2.0.0"), false);
assert.equal(satisfiesSemverRange("2.0.0", "<=2.0.0"), true);
assert.equal(satisfiesSemverRange("2.0.1", "<=2.0.0"), false);
assert.equal(satisfiesSemverRange("2.0.0", "=2.0.0"), true);
assert.equal(satisfiesSemverRange("2.0.1", "=2.0.0"), false);

// Bare version means exact match
assert.equal(satisfiesSemverRange("2.0.0", "2.0.0"), true);
assert.equal(satisfiesSemverRange("2.0.1", "2.0.0"), false);

// ---- satisfiesSemverRange: AND (space-separated) ----
assert.equal(satisfiesSemverRange("1.5.0", ">=1.0.0 <2.0.0"), true);
assert.equal(satisfiesSemverRange("2.0.0", ">=1.0.0 <2.0.0"), false);

// ---- satisfiesSemverRange: OR (||) ----
assert.equal(satisfiesSemverRange("1.0.0", "^1.0.0 || ^2.0.0"), true);
assert.equal(satisfiesSemverRange("2.5.0", "^1.0.0 || ^2.0.0"), true);
assert.equal(satisfiesSemverRange("3.0.0", "^1.0.0 || ^2.0.0"), false);

// ---- satisfiesSemverRange: wildcard ----
assert.equal(satisfiesSemverRange("0.0.1", "*"), true);
assert.equal(satisfiesSemverRange("99.99.99", "*"), true);

// ---- satisfiesSemverRange: prerelease ----
assert.equal(satisfiesSemverRange("1.0.0-alpha", "^1.0.0-alpha"), true);
assert.equal(satisfiesSemverRange("1.0.0", "^1.0.0-alpha"), true, "release > prerelease");

// ---- satisfiesSemverRange: invalid input ----
assert.equal(satisfiesSemverRange("not-a-version", "^1.0.0"), false);

console.log("[plugin-schema] semver tests passed");
