const byteUnits = ["B", "KB", "MB", "GB", "TB"];

function trim(value: number, digits: number) {
  return Number(value.toFixed(digits)).toString();
}

function formatBytes(value: number, suffix: string) {
  let scaled = Math.abs(value);
  let index = 0;
  while (scaled >= 1024 && index < byteUnits.length - 1) {
    scaled /= 1024;
    index++;
  }
  return `${trim(Math.sign(value) * scaled, scaled < 10 ? 1 : 0)} ${byteUnits[index]}${suffix}`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

// Readable value for a metric unit: B/s scales to KB/s, MB/s, ...; seconds
// become a duration; other units are appended as-is.
export function formatMetricValue(value: number, unit: string | null): string {
  if (unit === "B/s") return formatBytes(value, "/s");
  if (unit === "s") return formatDuration(value);
  if (unit === "%") return `${trim(value, 1)}%`;
  const number = Math.abs(value) >= 100 ? trim(value, 0) : trim(value, 2);
  return unit ? `${number} ${unit}` : number;
}
