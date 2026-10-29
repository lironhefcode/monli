import type { TargetStatus, TargetSummary } from "~/types/targets";
import { matchesSearch } from "./search";

// The name the UI shows for a resource: its alias when set, else the hostname.
export function displayName(target: { name: string; alias: string | null }) {
  return target.alias ?? target.name;
}

type SearchableTarget = Pick<
  TargetSummary,
  "name" | "alias" | "ipAddress" | "os" | "distro" | "responsibleTeam" | "status"
>;

// Resources matching the search on name, alias, IP, OS or team (see
// matchesSearch), and whose status matches when one is given.
export function filterTargets<T extends SearchableTarget>(targets: T[], search: string, status: TargetStatus | null) {
  return targets.filter(
    (target) =>
      (!status || target.status === status) &&
      matchesSearch(search, [
        target.name,
        target.alias,
        target.ipAddress,
        target.os,
        target.distro,
        target.responsibleTeam,
      ])
  );
}
