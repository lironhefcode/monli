import { describe, expect, it } from "vitest";
import type { TargetSummary } from "../../app/types/targets";
import { filterTargets } from "../../app/utils/targets";

const target = (overrides: Partial<TargetSummary>): TargetSummary => ({
  id: 1,
  name: "host",
  alias: null,
  ipAddress: null,
  os: null,
  distro: null,
  status: "up",
  responsibleTeam: null,
  lastSeenAt: null,
  ...overrides,
});

const web = target({
  name: "web-01",
  alias: "Frontend",
  ipAddress: "10.0.0.5",
  os: "linux",
  distro: "Ubuntu 22.04",
  responsibleTeam: "Platform",
});
const db = target({ name: "db-01", ipAddress: "10.0.1.7", os: "windows", responsibleTeam: "Data", status: "down" });
const fresh = target({ name: "new-box", status: "unknown" });
const all = [web, db, fresh];

describe("filterTargets", () => {
  it("returns everything for a blank search and no status", () => {
    expect(filterTargets(all, "  ", null)).toEqual(all);
  });

  it.each([
    ["web", web],
    ["frontend", web],
    ["10.0.1", db],
    ["WINDOWS", db],
    ["ubuntu", web],
    ["platform", web],
  ])("matches %s", (search, expected) => {
    expect(filterTargets(all, search, null)).toEqual([expected]);
  });

  it("requires every word to match", () => {
    expect(filterTargets(all, "linux data", null)).toEqual([]);
    expect(filterTargets(all, "linux platform", null)).toEqual([web]);
  });

  it("filters by status, alone or with a search", () => {
    expect(filterTargets(all, "", "down")).toEqual([db]);
    expect(filterTargets(all, "01", "up")).toEqual([web]);
  });
});
