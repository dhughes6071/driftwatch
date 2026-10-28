/**
 * Input clean-up shared by every run of this Actor.
 *
 * Apify's input check lets null and blank entries through in string lists, and
 * a single null keyword failed the run ("Cannot read properties of null",
 * confirmed live on all six index and Workday Actors, 28 Oct 2026). Dropping
 * them here means no filter ever sees one.
 */
export function cleanLists<T extends object>(input: T): T {
  const out = { ...input } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (Array.isArray(v)) out[k] = v.filter((e) => e != null && !(typeof e === "string" && !e.trim()));
  }
  return out as T;
}

/** The status message for a run that delivered nothing, so it never ends as a bare "0 results". */
export function noResultsNote(noun: string, repeatRun: boolean): string {
  return repeatRun
    ? `0 ${noun}: nothing new matched since this search last ran.`
    : `0 ${noun} matched your filters. Try fewer or broader keywords, or a wider date range.`;
}
