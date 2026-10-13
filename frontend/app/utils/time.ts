// "just now", "4 min ago", "2 h ago", "3 d ago"
export function formatAgo(date: Date | string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(date).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
