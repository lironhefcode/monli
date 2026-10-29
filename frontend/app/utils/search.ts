// True when every word of the search appears in at least one of the fields
// (case-insensitive). A blank search matches everything.
export function matchesSearch(search: string, fields: (string | null | undefined)[]) {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
}
