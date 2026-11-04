/**
 * Pay-range extraction from job descriptions.
 *
 * Pay-transparency laws (CA, CO, NY, WA, IL and more) put a stated range in a
 * large share of US postings: measured 27 Sep 2026, 16.5% of all indexed
 * descriptions and 24% of US Workday roles. Nobody publishes it as a field,
 * so we read it out of the text.
 *
 * PRECISION FIRST. A wrong salary is worse than none, so a match must look
 * like pay, not like the other money in a job ad -- revenue ("$86 billion in
 * sales"), funding ("raised $185 million"), insurance limits ("$25,000 bodily
 * injury"), benefits ("up to $25K reimbursement"), bonuses. Every rule below
 * exists because one of those showed up in a sample of our own index.
 */

export type Period = "hour" | "day" | "week" | "month" | "year";

export interface Salary {
  min: number;
  max: number;
  currency: string;
  period: Period;
  /** Annualised (hour x 2,080, day x 260, week x 52, month x 12), same currency. */
  annualMin: number;
  annualMax: number;
  /** The text it came from, for anyone who wants to check. */
  text: string;
  source: "structured" | "description";
}

const ANNUAL: Record<Period, number> = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };

// ------------------------------------------------------------------ tokens

/** Currency markers, longest first so "US$" wins over "$". */
const CURRENCY_TOKENS: Array<[RegExp, string | null]> = [
  [/^US\$/i, "USD"],
  [/^(?:CA|C)\$/i, "CAD"],
  [/^(?:AU|A)\$/i, "AUD"],
  [/^NZ\$/i, "NZD"],
  [/^S\$/i, "SGD"],
  [/^HK\$/i, "HKD"],
  [/^MX\$/i, "MXN"],
  [/^\$/, null], // resolved from the job's country
  [/^£/, "GBP"],
  [/^€/, "EUR"],
  [/^₹/, "INR"],
  [/^(USD|CAD|GBP|EUR|AUD|INR|CHF|SGD|NZD|HKD|MXN|JPY|SEK|NOK|DKK|PLN|ZAR|AED)\b/i, ""],
];
const CUR = String.raw`(?:US\$|CA\$|C\$|AU\$|A\$|NZ\$|S\$|HK\$|MX\$|\$|£|€|₹|(?:USD|CAD|GBP|EUR|AUD|INR|CHF|SGD|NZD|HKD|MXN|JPY|SEK|NOK|DKK|PLN|ZAR|AED)\s?)`;
const CODE_AFTER = String.raw`(?:\s?(?:USD|CAD|GBP|EUR|AUD|INR|CHF|SGD|NZD|HKD|MXN|JPY|SEK|NOK|DKK|PLN|ZAR|AED)\b)?`;
// US "120,000.00", European "61.500" / "79.104,00" / "56.867.20", plain "20.50",
// or a rate to four or five decimals "16.7106" (MGM Resorts, 4 Nov). "61.500" may also be a rate to
// three decimals: see threeDecimals().
const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:[.,]\d{1,2})?(?!\d)|\d+\.\d{4,5}(?!\d)|\d+(?:[.,]\d{1,2})?`;
const K = String.raw`(?:\s?[kK]\b)?`;
const SEP = String.raw`\s*(?:-|–|—|to|and)\s*`;

const RANGE_RE = new RegExp(`(${CUR})\\s?(${NUM})(${K})${CODE_AFTER}${SEP}(${CUR})?\\s?(${NUM})(${K})${CODE_AFTER}`, "gi");
/**
 * Code after each number, no symbol: "124,000 USD - 195,500 USD" (NVIDIA and
 * other Workday employers, 30 Sep). The code on the low end is required, so a
 * bare "20-50" never matches.
 */
const CODES = "USD|CAD|GBP|EUR|AUD|INR|CHF|SGD|NZD|HKD|MXN|JPY|SEK|NOK|DKK|PLN|ZAR|AED";
const RANGE_CODE_AFTER_RE = new RegExp(`(?<![\\d.,$£€₹])(${NUM})(${K})\\s?(${CODES})\\b${SEP}(${NUM})(${K})\\s?(${CODES})?\\b`, "gi");
/**
 * The third number of "Minimum - Midpoint - Maximum: $26.320 - $32.890 - $36.830"
 * (Sharp HealthCare, Baystate Health, 4 Nov). Without a currency it needs a
 * separator too, so "$34,880 - $40,980 - 401(k)" and "- 30 hours" are not read.
 */
const THIRD_RE = new RegExp(`^${SEP}(${CUR})?\\s?(${NUM})(${K})${CODE_AFTER}`, "i");
/** Single value only right after a pay word: "Hourly Base Pay: $20.50". */
const SINGLE_RE = new RegExp(
  String.raw`\b(?:pay(?: rate)?|salary|wage|compensation|hourly rate|base pay|starting (?:pay|rate|at))\s*(?:is|of|:)?\s*(${CUR})\s?(${NUM})(${K})${CODE_AFTER}`,
  "gi",
);

/** "Minimum Salary: $77,932.00 Maximum Salary: $97,388.00" (Jobvite postings, 29 Sep). */
const MINMAX_RE = new RegExp(
  String.raw`\bmin(?:imum)?\.?\s*(?:annual\s+|hourly\s+|base\s+)?(?:salary|pay|rate|wage|compensation)?\s*(?:rate\s*)?:?\s*(${CUR})\s?(${NUM})(${K})${CODE_AFTER}[^\d$£€]{0,40}?\bmax(?:imum)?\.?\s*(?:annual\s+|hourly\s+|base\s+)?(?:salary|pay|rate|wage|compensation)?\s*(?:rate\s*)?:?\s*(${CUR})\s?(${NUM})(${K})`,
  "gi",
);

// English plus the main European languages in the index (DE, FR, ES, IT, NL, PT, Nordics).
const PAY_CONTEXT =
  /\b(pay|paid|salary|salaries|compensation|wage|wages|rate|range|base|earn|earning|earnings|ote|remuneration|hourly|annual|annually|per annum|yearly|stipend|gehalt\w*|\w*gehalt|verg[üu]tung\w*|salaire|r[ée]mun[ée]ration|salario|sueldo|retribuzione|stipendio|salaris|loon|sal[áa]rio|l[öo]n|l[øo]nn)\b/i;
/** Words for money that is not pay. They only veto a number when they are closer to it than any pay word. */
const NOT_PAY_WORDS = /\b(bonus|sign[- ]on|signing|relocation|reimburse\w*|tuition|revenue|revenues|sales|funding|raised|valuation|budget|assets|insurance|injury|damage|coverage|donat\w*|grant|scholarship|referral|allowance|fee|fees|price|cost|savings|premiums?|deductible|contract value)\b/gi;
const PAY_WORDS = new RegExp(PAY_CONTEXT.source, "gi");

function lastIndex(re: RegExp, s: string): number {
  let last = -1;
  for (const m of s.matchAll(re)) last = m.index ?? last;
  return last;
}

/** True when the nearest money word before the number is a not-pay word. */
function vetoedBefore(before: string): boolean {
  const bad = lastIndex(NOT_PAY_WORDS, before);
  return bad >= 0 && bad > lastIndex(PAY_WORDS, before) && before.length - bad < 80;
}
/** ...or right after it. */
const NOT_PAY_AFTER = /^\s*(?:[kK]\s*)?(?:billion|million|bn|m\b|in (?:revenue|sales|funding|annual revenue|assets)|bodily|of (?:revenue|funding))/i;

const PERIOD_AFTER: Array<[RegExp, Period]> = [
  [/^[^.]{0,25}?(?:\/\s?(?:hr|hour)\b|per hour|an hour|hourly|\bhr\b|p\/h|pro stunde|stundenlohn|de l'heure|par heure|por hora|all'ora|per uur)/i, "hour"],
  [/^[^.]{0,25}?(?:per day|\/\s?day\b|daily)/i, "day"],
  [/^[^.]{0,25}?(?:per week|\/\s?week\b|weekly)/i, "week"],
  [/^[^.]{0,25}?(?:per month|\/\s?(?:mo|month)\b|monthly|a month|pro monat|monatlich|par mois|mensuel|al mes|mensual|al mese|mensile|per maand|per m[åa]ned|i m[åa]naden)/i, "month"],
  [/^[^.]{0,25}?(?:per year|\/\s?(?:yr|year)\b|annually|per annum|a year|annual|yearly|p\.a\.|\bpa\b|pro jahr|j[äa]hrlich|brutto(?:jahres)?|par an|annuel|por a[ñn]o|anual|all'anno|annuo|per jaar|per [åa]r|om [åa]ret)/i, "year"],
];
const PERIOD_BEFORE: Array<[RegExp, Period]> = [
  [/\b(hourly|per hour|hour)\b[^.]{0,60}$/i, "hour"],
  [/\b(monthly|per month)\b[^.]{0,60}$/i, "month"],
  [/\b(annual|annually|yearly|per year|salary)\b[^.]{0,60}$/i, "year"],
];

// ------------------------------------------------------------------ helpers

/** Decode the entities ATS descriptions still carry ("&mdash;" in Greenhouse). */
export function normaliseText(s: string): string {
  return s
    .replace(/&mdash;|&#8212;|&#x2014;/gi, "—")
    .replace(/&ndash;|&#8211;|&#x2013;/gi, "–")
    .replace(/&nbsp;|&#160;| /gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x?[0-9a-f]+;/gi, " ")
    .replace(/[ \t]+/g, " ");
}

function toNumber(raw: string, k: string, decimalPoint = false): number {
  let t = raw;
  if (decimalPoint) return Number(t);
  const dotted = t.match(/^(\d{1,3}(?:\.\d{3})+)(?:[.,](\d{1,2}))?$/); // 61.500 / 79.104,00 / 56.867.20
  if (dotted) t = dotted[1].replace(/\./g, "") + (dotted[2] ? `.${dotted[2]}` : "");
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); // 20,50
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return k.trim() ? n * 1000 : n;
}

/** Currencies that write a decimal point, so "$26.320" is not 26 thousand. */
const DECIMAL_POINT = new Set(["USD", "CAD", "AUD", "NZD", "SGD", "HKD"]);
const ONE_DOT_GROUP = /^\d{1,3}\.\d{3}$/;
const HOURLY_BEFORE = /\b(hourly|per hour)\b[^.]{0,60}$/i;
const YEARLY_BEFORE = /\b(annual|annually|yearly|per year)\b[^.]{0,60}$/i;

/**
 * Whether "$26.320" is a rate to three decimals rather than a typed-European
 * 26,320. Both are real: "$36.160 to $38.720" is a Canadian nurse's hourly band
 * and "$165.000 - $185.000" is a New York salary (samples of our index, 4 Nov),
 * so a stated period decides first, then the shape of the numbers.
 */
function threeDecimals(nums: string[], k: string, currency: string, before: string, after: string): boolean {
  if (k.trim() || !DECIMAL_POINT.has(currency)) return false;
  const dotted = nums.filter((n) => ONE_DOT_GROUP.test(n));
  if (!dotted.length) return false;
  // The other end shows how this posting writes numbers: "$176,800 - $239.200".
  if (nums.some((n) => !ONE_DOT_GROUP.test(n) && toNumber(n, "") >= 1000)) return false;
  const low = Math.min(...nums.map((n) => toNumber(n, "", ONE_DOT_GROUP.test(n))));
  if (low < 5 || low >= 200) return false;
  if (PERIOD_AFTER[0][0].test(after)) return true;
  if (PERIOD_AFTER[4][0].test(after)) return false;
  if (HOURLY_BEFORE.test(before)) return true;
  if (YEARLY_BEFORE.test(before)) return false;
  // No stated period. Nobody writes a whole rate as $90.000, though the top of a
  // band can be round ("$27.990 to $30.000"), and rates rarely end in 00 at both ends.
  if (dotted.every((n) => n.endsWith("000"))) return false;
  if (low >= 30 && (dotted.some((n) => n.endsWith("000")) || dotted.every((n) => n.endsWith("00")))) return false;
  return low < 100;
}

function currencyOf(token: string | undefined, countryHint: string | null): string | null {
  if (!token) return null;
  const t = token.trim();
  for (const [re, code] of CURRENCY_TOKENS) {
    const m = t.match(re);
    if (!m) continue;
    if (code === "") return m[1].toUpperCase();
    if (code) return code;
    return dollarFor(countryHint);
  }
  return null;
}

/** A bare "$" means the local dollar. */
function dollarFor(country: string | null): string {
  switch ((country ?? "").toUpperCase()) {
    case "CA": case "CANADA": return "CAD";
    case "AU": case "AUSTRALIA": return "AUD";
    case "NZ": case "NEW ZEALAND": return "NZD";
    case "SG": case "SINGAPORE": return "SGD";
    case "HK": case "HONG KONG": return "HKD";
    case "MX": case "MEXICO": return "MXN";
    default: return "USD";
  }
}

/**
 * The pay period: an explicit word after the number, then one before it, then
 * magnitude. A word-based guess that makes the pay implausible ("salary range
 * $17.13 - $30.10" is not $30 a year) falls through to magnitude. Null when
 * nothing yields plausible pay.
 */
function periodFor(before: string, after: string, max: number, min: number, currency: string): Period | null {
  const guesses: Period[] = [];
  for (const [re, p] of PERIOD_AFTER) if (re.test(after)) { guesses.push(p); break; }
  for (const [re, p] of PERIOD_BEFORE) if (re.test(before)) { guesses.push(p); break; }
  // Magnitude last; the ambiguous middle is dropped ("$2,000 - $3,000" is as
  // often a stipend or bonus as a monthly wage).
  if (max < 300) guesses.push("hour");
  else if (max >= 15_000) guesses.push("year");
  return guesses.find((p) => plausible(min, max, p, currency)) ?? null;
}

/** Plausible pay, in the job's own currency, once annualised. */
function plausible(min: number, max: number, period: Period, currency: string): boolean {
  if (!(min > 0) || max < min) return false;
  if (max / min > 6) return false; // two unrelated numbers, not a range
  // Currencies with many units to the dollar get proportionally larger limits.
  const scale = ["INR", "JPY", "MXN", "ZAR", "SEK", "NOK", "DKK", "PLN", "HKD"].includes(currency) ? 200 : 1;
  const annual = max * ANNUAL[period];
  if (annual < 5_000 || annual > 5e6 * scale) return false;
  // Per-period ceilings: "$83,000 - $90,000 ... 40 hours per week" is a yearly
  // salary, not $90,000 a week (found in a Centria Autism posting, 28 Sep).
  // Monthly pay above 15,000 is really a yearly figure next to "per month" text
  // ("salary of £28,000 ... per month" commission, 28 Sep sample).
  const CEILING: Record<Period, number> = { hour: 2_000, day: 10_000, week: 20_000, month: 15_000, year: 5e6 };
  if (max > CEILING[period] * scale) return false;
  if (period === "hour" && min < 5) return false;
  return true;
}

// ------------------------------------------------------------------ main

/**
 * The first plausible pay range (or single pay figure) in a description, or
 * null. The first is taken on purpose: postings that list one range per state
 * lead with the primary one.
 */
export function extractSalary(description: string | null | undefined, countryHint: string | null = null): Salary | null {
  if (!description) return null;
  const text = normaliseText(description);

  const candidates: Array<{ index: number; s: Salary }> = [];

  const considerRange = (whole: string, index: number, cur1: string | undefined, n1: string, k1: string, cur2: string | undefined, n2: string, k2: string) => {
    const before = text.slice(Math.max(0, index - 250), index);
    let after = text.slice(index + whole.length, index + whole.length + 60);
    // An hourly rate right after the range outweighs a stray word before it
    // ("Retail Sales Associate ... $15.00 – $18.00 per hour", 29 Sep).
    if ((vetoedBefore(before) && !PERIOD_AFTER[0][0].test(after)) || NOT_PAY_AFTER.test(after)) return;
    // "$120-150k": the k on the high end applies to both.
    const kk1 = k1 || (!k1 && k2 && Number(n1.replace(/,/g, "")) < 1000 ? k2 : "");
    const currency = currencyOf(cur1, countryHint) ?? currencyOf(cur2, countryHint) ?? dollarFor(countryHint);
    // Min - midpoint - max: the top of the range is the third number. It has to
    // look like one, or it is the next bullet ("$65,000 - $70,000 - $2,000 Sign-On Bonus").
    const third = after.match(THIRD_RE);
    let high = n2;
    if (third && (third[1] || /[.,]/.test(third[2]))) {
      const afterThird = after.slice(third[0].length);
      const candidate = third[2];
      const usesPoint = threeDecimals([n1, n2, candidate], kk1 + k2 + third[3], currency, before, afterThird);
      const value = (n: string) => toNumber(n, third[3], usesPoint && ONE_DOT_GROUP.test(n));
      const middle = toNumber(n2, k2, usesPoint && ONE_DOT_GROUP.test(n2));
      if (value(candidate) > middle && value(candidate) <= middle * 1.8 && !NOT_PAY_AFTER.test(afterThird) && afterThird.slice(0, 30).search(NOT_PAY_WORDS) < 0) {
        high = candidate;
        whole += third[0];
        k2 = third[3];
        after = afterThird;
      }
    }
    const nums = high === n2 ? [n1, n2] : [n1, n2, high];
    const usesPoint = threeDecimals(nums, kk1 + k2, currency, before, after);
    const read = (n: string, k: string) => toNumber(n, k, usesPoint && ONE_DOT_GROUP.test(n));
    const min = read(n1, kk1);
    const max = read(high, k2);
    const trailingCode = whole.match(/(USD|CAD|GBP|EUR|AUD|INR|CHF|SGD|NZD|HKD|MXN|JPY|SEK|NOK|DKK|PLN|ZAR|AED)\s*$/i)?.[1];
    const cur = trailingCode && currency === dollarFor(countryHint) ? trailingCode.toUpperCase() : currency;
    const hasContext = PAY_CONTEXT.test(before) || PERIOD_AFTER.some(([re]) => re.test(after)) || /\/\s?(hr|hour|yr|year)/i.test(whole);
    if (!hasContext) return;
    const period = periodFor(before, after, max, min, cur);
    if (!period) return;
    candidates.push({ index, s: build(min, max, cur, period, whole) });
  };

  for (const m of text.matchAll(RANGE_RE)) {
    const [whole, cur1, n1, k1, cur2, n2, k2] = m;
    considerRange(whole, m.index ?? 0, cur1, n1, k1, cur2, n2, k2);
  }
  for (const m of text.matchAll(RANGE_CODE_AFTER_RE)) {
    const [whole, n1, k1, code1, n2, k2, code2] = m;
    considerRange(whole, m.index ?? 0, code1, n1, k1, code2 ?? code1, n2, k2);
  }

  for (const m of text.matchAll(SINGLE_RE)) {
    const [whole, cur1, n1, k1] = m;
    const index = m.index ?? 0;
    const numStart = index + whole.length;
    const after = text.slice(numStart, numStart + 60);
    // A range starting here was already considered above.
    if (/^\s*(?:-|–|—|to)\s*\S?\d/i.test(after) || NOT_PAY_AFTER.test(after)) continue;
    const currency = currencyOf(cur1, countryHint) ?? dollarFor(countryHint);
    const beforeNumber = text.slice(Math.max(0, index - 60), index + whole.lastIndexOf(n1));
    const value = toNumber(n1, k1, threeDecimals([n1], k1, currency, beforeNumber, after) && ONE_DOT_GROUP.test(n1));
    const period = periodFor(text.slice(Math.max(0, index - 60), index + whole.length), after, value, value, currency);
    if (!period) continue;
    candidates.push({ index, s: build(value, value, currency, period, whole.trim()) });
  }

  for (const m of text.matchAll(MINMAX_RE)) {
    const [whole, cur1, n1, k1, cur2, n2, k2] = m;
    const index = m.index ?? 0;
    const before = text.slice(Math.max(0, index - 250), index);
    const after = text.slice(index + whole.length, index + whole.length + 60);
    if (vetoedBefore(before) || NOT_PAY_AFTER.test(after)) continue;
    const currency = currencyOf(cur1, countryHint) ?? currencyOf(cur2, countryHint) ?? dollarFor(countryHint);
    const usesPoint = threeDecimals([n1, n2], k1 + k2, currency, before + whole.slice(0, whole.indexOf(n1)), after);
    const min = toNumber(n1, k1, usesPoint && ONE_DOT_GROUP.test(n1));
    const max = toNumber(n2, k2, usesPoint && ONE_DOT_GROUP.test(n2));
    const period = periodFor(before + whole, after, max, min, currency);
    if (!period) continue;
    candidates.push({ index, s: build(min, max, currency, period, whole.replace(/\s+/g, " ").trim()) });
  }

  candidates.sort((a, b) => a.index - b.index);
  return candidates[0]?.s ?? null;
}

function build(min: number, max: number, currency: string, period: Period, text: string): Salary {
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    min: round(min),
    max: round(max),
    currency,
    period,
    annualMin: Math.round(min * ANNUAL[period]),
    annualMax: Math.round(max * ANNUAL[period]),
    text: text.trim().slice(0, 120),
    source: "description",
  };
}

/** Ashby publishes pay as data: `compensation.compensationTiers[].components[]`. */
export function fromAshbyCompensation(comp: unknown): Salary | null {
  const tiers = (comp as { compensationTiers?: Array<{ components?: unknown[] }> } | null)?.compensationTiers ?? [];
  for (const tier of tiers) {
    for (const c of (tier.components ?? []) as Array<{
      compensationType?: string;
      interval?: string;
      currencyCode?: string | null;
      minValue?: number | null;
      maxValue?: number | null;
      summary?: string;
    }>) {
      if (c.compensationType !== "Salary" || !c.currencyCode || !(c.minValue || c.maxValue)) continue;
      const period = ({ "1 HOUR": "hour", "1 DAY": "day", "1 WEEK": "week", "1 MONTH": "month", "1 YEAR": "year" } as Record<string, Period>)[
        c.interval ?? ""
      ];
      if (!period) continue;
      const min = c.minValue ?? c.maxValue!;
      const max = c.maxValue ?? c.minValue!;
      return { ...build(min, max, c.currencyCode, period, c.summary ?? ""), source: "structured" };
    }
  }
  return null;
}

/**
 * Greenhouse's pay-transparency field (`pay_input_ranges`, returned with
 * `?pay_transparency=true`): used by about 1 in 6 Greenhouse roles, often
 * with no pay in the description text (sampled 30 Sep). It has no period, so
 * the size decides: yearly from 15,000 up, hourly below 300, else unused.
 */
export function fromGreenhousePay(comp: unknown): Salary | null {
  const r = (comp as { payInputRanges?: Array<{ min_cents?: number | null; max_cents?: number | null; currency_type?: string | null }> } | null)
    ?.payInputRanges?.[0];
  if (!r?.currency_type || !(r.min_cents || r.max_cents)) return null;
  const min = (r.min_cents ?? r.max_cents!) / 100;
  const max = (r.max_cents ?? r.min_cents!) / 100;
  const period: Period | null = max >= 15_000 ? "year" : max < 300 ? "hour" : null;
  const currency = r.currency_type.toUpperCase();
  if (!period || !plausible(min, max, period, currency)) return null;
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return { ...build(min, max, currency, period, `${currency} ${fmt(min)} - ${fmt(max)}`), source: "structured" };
}

/** Lever's `salaryRange`: { min, max, currency, interval: "per-year-salary" | "per-hour-wage" | ... } (1 in 5 Lever roles, 30 Sep). */
export function fromLeverSalaryRange(comp: unknown): Salary | null {
  const r = (comp as { leverSalaryRange?: { min?: number; max?: number; currency?: string; interval?: string } } | null)?.leverSalaryRange;
  if (!r?.currency || !(r.min || r.max)) return null;
  const period = ({ year: "year", hour: "hour", month: "month", week: "week", day: "day" } as Record<string, Period>)[
    r.interval?.match(/per-(year|hour|month|week|day)/)?.[1] ?? ""
  ];
  const min = r.min || r.max!;
  const max = r.max || r.min!;
  const currency = r.currency.toUpperCase();
  if (!period || !plausible(min, max, period, currency)) return null;
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return { ...build(min, max, currency, period, `${currency} ${fmt(min)} - ${fmt(max)} ${r.interval}`), source: "structured" };
}

/** A company's own structured pay, from whichever system published it (Ashby, Greenhouse or Lever). */
export function fromStructuredPay(comp: unknown): Salary | null {
  return fromAshbyCompensation(comp) ?? fromGreenhousePay(comp) ?? fromLeverSalaryRange(comp);
}
