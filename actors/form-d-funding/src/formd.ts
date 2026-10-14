/**
 * Form D: the notice a US company (or fund) files with the SEC within 15 days
 * of first selling securities in a private raise -- seed rounds, SAFEs,
 * Series A, real-estate syndications, VC and hedge funds.
 *
 * Each filing is a small XML document (primary_doc.xml). This file parses it
 * into one flat, spreadsheet-friendly record. No XML dependency: the schema is
 * shallow and machine-written, so a tiny tokenizer is enough and keeps the
 * image to the apify SDK alone.
 */

// ------------------------------------------------------------------ minimal XML

export interface XNode {
  name: string;
  children: XNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Parses well-formed, attribute-light XML into a tree. Namespace prefixes are dropped. */
export function parseXml(xml: string): XNode {
  const root: XNode = { name: "#root", children: [], text: "" };
  const stack: XNode[] = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<[?!][\s\S]*?>|<(\/?)([A-Za-z_][\w.:-]*)[^>]*?(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[5] !== undefined) top.text += decode(m[5]);
    else if (m[3]) {
      const name = m[3].replace(/^.*:/, "");
      if (m[2]) {
        // Close the nearest matching open tag (tolerates a stray unclosed one).
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].name === name) {
            stack.length = i;
            break;
          }
        }
      } else {
        const node: XNode = { name, children: [], text: "" };
        top.children.push(node);
        if (!m[4]) stack.push(node);
      }
    }
  }
  return root;
}

/** First descendant at this path, e.g. q(doc, "offeringData", "industryGroup"). */
export function q(n: XNode | undefined, ...path: string[]): XNode | undefined {
  let cur = n;
  for (const p of path) {
    if (!cur) return undefined;
    cur = cur.children.find((c) => c.name === p) ?? findDeep(cur, p);
  }
  return cur;
}

function findDeep(n: XNode, name: string): XNode | undefined {
  for (const c of n.children) {
    if (c.name === name) return c;
    const d = findDeep(c, name);
    if (d) return d;
  }
  return undefined;
}

/** Direct children with this name. */
export const all = (n: XNode | undefined, name: string) => (n ? n.children.filter((c) => c.name === name) : []);

/** Trimmed text of the node at this path, or null when missing or blank. */
export function t(n: XNode | undefined, ...path: string[]): string | null {
  const v = q(n, ...path)?.text.trim();
  return v ? v : null;
}

// ------------------------------------------------------------------ vocabularies

/** Form D industry groups (as written in the XML) -> the sector they sit under on the form. */
export const INDUSTRY_SECTOR: Record<string, string> = {
  Agriculture: "Agriculture",
  "Commercial Banking": "Financial Services",
  Insurance: "Financial Services",
  Investing: "Financial Services",
  "Investment Banking": "Financial Services",
  "Pooled Investment Fund": "Financial Services",
  "Other Banking and Financial Services": "Financial Services",
  "Business Services": "Business Services",
  "Coal Mining": "Energy",
  "Electric Utilities": "Energy",
  "Energy Conservation": "Energy",
  "Environmental Services": "Energy",
  "Oil and Gas": "Energy",
  "Other Energy": "Energy",
  Biotechnology: "Health Care",
  "Health Insurance": "Health Care",
  "Hospitals and Physicians": "Health Care",
  Pharmaceuticals: "Health Care",
  "Other Health Care": "Health Care",
  Manufacturing: "Manufacturing",
  Commercial: "Real Estate",
  Construction: "Real Estate",
  "REITS and Finance": "Real Estate",
  Residential: "Real Estate",
  "Other Real Estate": "Real Estate",
  Retailing: "Retail",
  Restaurants: "Restaurants",
  Computers: "Technology",
  Telecommunications: "Technology",
  "Other Technology": "Technology",
  "Airlines and Airports": "Travel",
  "Lodging and Conventions": "Travel",
  "Tourism and Travel Services": "Travel",
  "Other Travel": "Travel",
  Other: "Other",
};

export const SECTORS = [...new Set(Object.values(INDUSTRY_SECTOR))];

/** Federal exemption codes -> the rule a filing relies on. */
const EXEMPTIONS: Record<string, string> = {
  "04": "Rule 504(b)(1)",
  "04a": "Rule 504(b)(1)(i)",
  "04b": "Rule 504(b)(1)(ii)",
  "04c": "Rule 504(b)(1)(iii)",
  "06": "Rule 506",
  "06b": "Rule 506(b)",
  "06c": "Rule 506(c)",
  "4a5": "Securities Act Section 4(a)(5)",
  "3C": "Investment Company Act Section 3(c)",
};
export function exemptionName(code: string): string {
  if (EXEMPTIONS[code]) return EXEMPTIONS[code];
  const m = /^3C\.(\d+)$/.exec(code);
  return m ? `Investment Company Act Section 3(c)(${m[1]})` : code;
}

const SECURITY_TYPES: Array<[string, string]> = [
  ["isEquityType", "Equity"],
  ["isDebtType", "Debt"],
  ["isOptionToAcquireType", "Option, warrant or other right to acquire"],
  ["isSecurityToBeAcquiredType", "Security to be acquired on exercise"],
  ["isPooledInvestmentFundType", "Pooled investment fund interests"],
  ["isTenantInCommonType", "Tenant-in-common securities"],
  ["isMineralPropertyType", "Mineral property securities"],
];

// ------------------------------------------------------------------ record

export interface Person {
  name: string;
  /** "Executive Officer", "Director", "Promoter". */
  roles: string[];
  /** Their title when the filer gave one, e.g. "Chief Executive Officer". */
  title: string | null;
  city: string | null;
  state: string | null;
}

export interface Filing {
  companyName: string;
  cik: string;
  accessionNumber: string;
  /** "New" for a first notice, "Amendment" for a D/A (annual renewal or correction). */
  filingType: "New" | "Amendment";
  filedAt: string | null;
  firstSaleDate: string | null;
  /** True when the filer said the first sale has not happened yet. */
  firstSaleYetToOccur: boolean;
  sector: string | null;
  industry: string | null;
  isFund: boolean;
  /** Hedge Fund, Private Equity Fund, Venture Capital Fund, Other Investment Fund. */
  fundType: string | null;
  entityType: string | null;
  yearOfIncorporation: number | null;
  /** "Within five years", "Over five years" or "Yet to be formed", when no exact year is given. */
  incorporatedWithin: string | null;
  jurisdiction: string | null;
  street: string | null;
  city: string | null;
  /** Two-letter US state, or the SEC's code for a foreign country (see stateOrCountryName). */
  state: string | null;
  stateOrCountryName: string | null;
  zipCode: string | null;
  phone: string | null;
  /** The total the round aims to raise, in USD. Null when "indefinite" (common for funds). */
  totalOfferingAmount: number | null;
  offeringAmountIndefinite: boolean;
  /** Raised so far, in USD. */
  totalAmountSold: number | null;
  totalRemaining: number | null;
  minimumInvestment: number | null;
  investorCount: number | null;
  nonAccreditedInvestorCount: number | null;
  securitiesOffered: string[];
  exemptions: string[];
  revenueRange: string | null;
  executives: Person[];
  /** The people as one readable line, e.g. "Dena Neek (President and Chief Executive Officer); ...". */
  executivesText: string;
  /** Brokers or finders paid commissions on the raise. */
  salesBrokers: string[];
  salesCommissions: number | null;
  findersFees: number | null;
  /** Spent or to be spent on payments to executives, directors or promoters. */
  proceedsToExecutives: number | null;
  /** The filer's own footnotes on amounts and investors, when they gave any. */
  notes: string | null;
  previousAccessionNumber: string | null;
  otherIssuers: string[];
  signedBy: string | null;
  signerTitle: string | null;
  filingUrl: string;
  formUrl: string;
  companyFilingsUrl: string;
}

export interface FilingRef {
  accessionNumber: string;
  cik: string;
  /** primary_doc.xml normally. */
  fileName: string;
  filedAt: string | null;
}

const num = (s: string | null): number | null => {
  if (s == null) return null;
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const yes = (s: string | null) => s?.toLowerCase() === "true";

/** "STEPHEN DOE" -> "Stephen Doe"; mixed-case names are left alone. */
export function tidyName(s: string): string {
  const v = s.replace(/\s+/g, " ").trim();
  if (v !== v.toUpperCase() || !/[A-Z]/.test(v)) return v;
  return v.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase()).replace(/\b(Ii|Iii|Iv|Llc|Lp|Inc)\b/g, (w) => w.toUpperCase());
}

function phone(s: string | null): string | null {
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return `+1 ${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `+1 ${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  return s.trim();
}

const NONE = /^(none|n\/a|na|-+|\.)$/i;

export function parseFiling(xml: string, ref: FilingRef): Filing {
  const doc = q(parseXml(xml), "edgarSubmission") ?? parseXml(xml);
  const issuer = q(doc, "primaryIssuer");
  const addr = q(issuer, "issuerAddress");
  const off = q(doc, "offeringData");
  const industry = t(off, "industryGroup", "industryGroupType");
  const fundType = t(off, "industryGroup", "investmentFundInfo", "investmentFundType");
  const year = q(issuer, "yearOfInc");
  const yearValue = num(t(year, "value"));
  const filingType = yes(t(off, "typeOfFiling", "newOrAmendment", "isAmendment")) || t(doc, "submissionType") === "D/A" ? "Amendment" : "New";

  const executives: Person[] = all(q(doc, "relatedPersonsList"), "relatedPersonInfo").map((p) => {
    const n = q(p, "relatedPersonName");
    // Entities (a fund's general partner) are filed with "-" or "N/A" as the first name.
    const name = tidyName([t(n, "firstName"), t(n, "middleName"), t(n, "lastName")].filter((s) => s && !NONE.test(s)).join(" "));
    const clar = t(p, "relationshipClarification");
    return {
      name,
      roles: all(q(p, "relatedPersonRelationshipList"), "relationship").map((r) => r.text.trim()).filter(Boolean),
      title: clar && !NONE.test(clar) ? clar : null,
      city: t(p, "relatedPersonAddress", "city") ? tidyName(t(p, "relatedPersonAddress", "city")!) : null,
      state: t(p, "relatedPersonAddress", "stateOrCountry"),
    };
  }).filter((p) => p.name);

  const securities = SECURITY_TYPES.filter(([tag]) => yes(t(off, "typesOfSecuritiesOffered", tag))).map(([, label]) => label);
  const other = t(off, "typesOfSecuritiesOffered", "descriptionOfOtherType");
  if (yes(t(off, "typesOfSecuritiesOffered", "isOtherType"))) securities.push(other ? `Other: ${other}` : "Other");

  const offering = t(off, "offeringSalesAmounts", "totalOfferingAmount");
  const investors = q(off, "investors");
  const notes = [
    t(off, "offeringSalesAmounts", "clarificationOfResponse"),
    t(off, "investors", "clarificationOfResponse"),
  ].filter((s): s is string => !!s && !NONE.test(s));

  const brokers = all(q(off, "salesCompensationList"), "recipient")
    .map((r) => {
      const who = t(r, "recipientName");
      const bd = t(r, "associatedBDName");
      const a = who && !NONE.test(who) ? tidyName(who) : null;
      const b = bd && !NONE.test(bd) ? bd : null;
      return a && b && a !== b ? `${a} (${b})` : (a ?? b);
    })
    .filter((s): s is string => !!s);

  const cik = (t(issuer, "cik") ?? ref.cik).replace(/^0+/, "");
  const folder = ref.accessionNumber.replace(/-/g, "");
  const sig = q(off, "signatureBlock", "signature");
  const sector = industry ? (INDUSTRY_SECTOR[industry] ?? "Other") : null;
  const isFund = industry === "Pooled Investment Fund" || !!fundType || yes(t(off, "typesOfSecuritiesOffered", "isPooledInvestmentFundType"));

  return {
    companyName: t(issuer, "entityName") ?? "",
    cik,
    accessionNumber: ref.accessionNumber,
    filingType,
    filedAt: ref.filedAt,
    firstSaleDate: t(off, "typeOfFiling", "dateOfFirstSale", "value"),
    firstSaleYetToOccur: yes(t(off, "typeOfFiling", "dateOfFirstSale", "yetToOccur")),
    sector,
    industry,
    isFund,
    fundType,
    entityType: t(issuer, "entityType") === "Other" ? (t(issuer, "entityTypeOtherDesc") ?? "Other") : t(issuer, "entityType"),
    yearOfIncorporation: yearValue,
    incorporatedWithin: yes(t(year, "withinFiveYears"))
      ? "Within five years"
      : yes(t(year, "overFiveYears"))
        ? "Over five years"
        : yes(t(year, "yetToBeFormed"))
          ? "Yet to be formed"
          : null,
    jurisdiction: t(issuer, "jurisdictionOfInc"),
    street: [t(addr, "street1"), t(addr, "street2")].filter(Boolean).join(", ") || null,
    city: t(addr, "city") ? tidyName(t(addr, "city")!) : null,
    state: t(addr, "stateOrCountry"),
    stateOrCountryName: t(addr, "stateOrCountryDescription") ? tidyName(t(addr, "stateOrCountryDescription")!) : null,
    zipCode: t(addr, "zipCode"),
    phone: phone(t(issuer, "issuerPhoneNumber")),
    totalOfferingAmount: num(offering),
    offeringAmountIndefinite: /indefinite/i.test(offering ?? ""),
    totalAmountSold: num(t(off, "offeringSalesAmounts", "totalAmountSold")),
    totalRemaining: num(t(off, "offeringSalesAmounts", "totalRemaining")),
    minimumInvestment: num(t(off, "minimumInvestmentAccepted")),
    investorCount: num(t(investors, "totalNumberAlreadyInvested")),
    nonAccreditedInvestorCount: yes(t(investors, "hasNonAccreditedInvestors")) ? num(t(investors, "numberNonAccreditedInvestors")) : 0,
    securitiesOffered: securities,
    exemptions: all(q(off, "federalExemptionsExclusions"), "item").map((i) => exemptionName(i.text.trim())),
    revenueRange: t(off, "issuerSize", "revenueRange") ?? t(off, "issuerSize", "aggregateNetAssetValueRange"),
    executives,
    executivesText: executives.map((p) => `${p.name} (${p.title ?? p.roles.join(", ")})`).join("; "),
    salesBrokers: [...new Set(brokers)],
    salesCommissions: num(t(off, "salesCommissionsFindersFees", "salesCommissions", "dollarAmount")),
    findersFees: num(t(off, "salesCommissionsFindersFees", "findersFees", "dollarAmount")),
    proceedsToExecutives: num(t(off, "useOfProceeds", "grossProceedsUsed", "dollarAmount")),
    notes: notes.length ? notes.join(" ") : null,
    previousAccessionNumber: t(off, "typeOfFiling", "newOrAmendment", "previousAccessionNumber") ?? t(doc, "previousAccessionNumber"),
    otherIssuers: all(q(doc, "issuerList"), "issuer").map((i) => t(i, "entityName") ?? "").filter(Boolean),
    signedBy: t(sig, "nameOfSigner") ?? t(sig, "signatureName"),
    signerTitle: t(sig, "signatureTitle"),
    filingUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${folder}/${ref.accessionNumber}-index.htm`,
    formUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${folder}/xslFormDX01/${ref.fileName}`,
    companyFilingsUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=D&dateb=&owner=include&count=40`,
  };
}
