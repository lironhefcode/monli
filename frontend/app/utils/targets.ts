// The name the UI shows for a resource: its alias when set, else the hostname.
export function displayName(target: { name: string; alias: string | null }) {
  return target.alias ?? target.name;
}
