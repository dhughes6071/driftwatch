/**
 * Clinical tags for hospital jobs, read from the title (first), the job
 * category and the description: what kind of role it is, the unit or
 * specialty, the shift, per diem / travel / locum, a sign-on bonus, and the
 * licenses and certifications it asks for.
 *
 * Plain rules, tuned on a week of real postings from 67 US health systems
 * (17 Oct 2026). Precision first: a tag is left empty rather than guessed.
 * Abbreviations that are also ordinary words (RN, OR, ED, PT, MA) only count
 * in capitals; everything else is case-insensitive.
 */

export type RoleFamily =
  | "Registered nurse"
  | "LPN / LVN"
  | "Nursing support"
  | "Nursing leadership"
  | "Advanced practice provider"
  | "Physician"
  | "Allied health"
  | "Non-clinical"
  | "Other";

export type Employment = "locum" | "travel" | "per diem" | "contract" | "part time" | "full time";

export interface ClinicalTags {
  roleFamily: RoleFamily;
  /** A finer role, e.g. "Respiratory therapist"; null when only the family is known. */
  roleType: string | null;
  /** Units and specialties named in the title or category, e.g. ["ICU", "Cardiac"]. */
  specialties: string[];
  shift: Array<"days" | "nights" | "evenings" | "rotating" | "weekends">;
  /** Hours per shift when stated (8, 10, 12). */
  shiftHours: number | null;
  employment: Employment | null;
  /** True when a sign-on (or hiring) bonus is offered. */
  signOnBonus: boolean;
  /** The largest bonus amount stated, in dollars, or null. */
  signOnBonusAmount: number | null;
  licenses: string[];
}

export interface ClinicalInput {
  title: string;
  department?: string | null;
  employmentType?: string | null;
  description?: string | null;
}

// ------------------------------------------------------------------ roles

/** A rule matches when any of its patterns does (case-insensitive words and capitals-only abbreviations are kept apart). */
type Rule = [family: RoleFamily, type: string | null, any: RegExp[], unless?: RegExp];

const ADMIN = /\b(coder|coding|billing|biller|scheduler|recruiter|liaison|credentialing|receptionist|secretary|analyst|representative|coordinator|office|executive|compensation|enterprise|speech|language|assistant)\b/i;

/** First match wins, so the order matters: "Assistant Nurse Manager" is leadership, "Nursing Assistant" is support. */
const ROLES: Rule[] = [
  ["Nursing leadership", "Nurse manager", [/\b(assistant |associate )?nurse manager|nursing (director|supervisor|manager)|director,? (of )?nursing|chief nursing|nurse (director|supervisor)|house supervisor/i, /\bCNO\b/]],
  ["Advanced practice provider", "Nurse anesthetist", [/nurse anesthetist/i, /\bCRNA\b/]],
  ["Advanced practice provider", "Nurse practitioner", [/nurse practitioner/i, /\b(APRN|NP|FNP|DNP|CRNP)\b/]],
  ["Advanced practice provider", "Physician assistant", [/physician assistant/i, /\bPA-C\b/]],
  ["Advanced practice provider", "Nurse midwife", [/nurse[- ]midwife/i, /\bCNM\b/]],
  ["Advanced practice provider", null, [/advanced practice/i]],
  ["Registered nurse", null, [/registered nurse/i, /\b(RN|BSN)\b/]],
  ["LPN / LVN", null, [/licensed (practical|vocational) nurse/i, /\b(LPN|LVN)\b/]],
  ["Nursing support", "Nursing assistant", [/nurs(e|ing) (aide|assistant|tech(nician)?|extern)|nurse aide|medication aide/i, /\b(C?NA|QMA|CMA-?M)\b/]],
  ["Nursing support", "Patient care technician", [/patient care (tech|assistant|associate|partner)|clinical partner|multi[- ]?skill(ed)? tech|care partner|sitter|patient (safety )?(monitor|observer|attendant)|monitor aide/i, /\b(PCT|PCA)\b/]],
  ["Nursing support", "Medical assistant", [/medical assistant|clinical assistant/i, /\bC?MA\b/], /scheduler|registration|access|office/i],
  ["Registered nurse", null, [/\bnurse\b|\bnursing\b(?! (home|facility))/i], /\b(aide|assistant|tech|technician|coordinator|scheduler|recruiter)\b/i],
  ["Allied health", "Speech-language pathology", [/speech|language patholog/i, /\bSLP\b/]],
  ["Physician", null, [/physician|hospitalist|surgeon|anesthesiologist|psychiatrist|radiologist|pathologist(?!s?'? assistant)|intensivist|neonatologist|nocturnist|oncologist|cardiologist|gastroenterologist|urologist|neurologist|pediatrician|obstetrician|ob\/?gyn|internist|dermatologist|ophthalmologist|medical director|locum/i, /\b(MD|DO)\b/], ADMIN],
  ["Allied health", "Physical therapy", [/physical therap/i, /\b(PTA|DPT)\b/]],
  ["Allied health", "Occupational therapy", [/occupational therap/i, /\bCOTA\b/]],
  ["Allied health", "Respiratory therapy", [/respiratory/i, /\b(RRT|RT)\b/]],
  ["Allied health", "Imaging", [/radiolog|x-?ray|sonograph|ultrasound|mammograph|nuclear med|imaging|multimodality|interventional|echocardiograph|\becho\b|cat scan|dosimetr|radiation therap/i, /\b(CT|MRI|IR)\b/]],
  ["Allied health", "Cardiovascular technology", [/cath(eterization)? lab|cardiovascular tech|telemetry tech|monitor(ing)? tech/i, /\b(EKG|ECG)\b/]],
  ["Allied health", "Laboratory", [/laborator|medical (lab|technologist)|phlebotom|histotech|histolog|cytotech|blood bank|specimen|pathologists?'? assistant/i, /\b(MLS|MLT)\b/]],
  ["Allied health", "Pharmacy", [/pharmac/i]],
  ["Allied health", "Surgical technology", [/surgical tech|scrub tech|steriliz|sterile (processing|supply)|central (sterile|processing)|anesthesia tech/i, /\bCST\b/]],
  ["Allied health", "EMS", [/paramedic|emergency medical tech/i, /\bEMT\b/]],
  ["Allied health", "Behavioral health", [/behavioral health|mental health|counselor|therapist|psycholog|social work/i, /\b(LCSW|LMSW|LICSW|BHT)\b/], /financial|admissions?|enrollment|benefits/i],
  ["Allied health", "Dietitian", [/dietitian|nutritionist/i]],
  ["Allied health", "Case management", [/case manag|care coordinat|utilization review/i]],
  ["Allied health", "Infection prevention", [/infection (prevent|control)/i]],
  ["Allied health", "Other clinical", [/rehab aide|therapy aide|lactation|orthotist|prosthetist|chaplain|spiritual care/i]],
  ["Allied health", null, [/dialysis tech|exercise physiolog|perfusion|audiolog|optometr|ophthalmic|dental (hygien|assistant)|athletic trainer|community health worker|rehab tech|EEG|technologist|\btech(nician)?\b/i], /\b(IT|information|systems?|software|network|maintenance|facilit|engineer|utility|service tech|pharmacy|environmental|floor|supply|chain|housekeep|food|building)/i],
  ["Non-clinical", "Leadership", [/\b(manager|director|vice president|chief|supervisor|administrator|executive)\b/i, /\bVP\b/]],
  ["Non-clinical", "Patient access", [/patient (access|service|registration)|registrar|registration|admitting|scheduler|front desk|receptionist|financial counselor/i]],
  ["Non-clinical", "Environmental services", [/environmental (serv|attendant)|housekeep|custodian|janitor|laundry|linen/i, /\bEVS\b/]],
  ["Non-clinical", "Food and nutrition", [/food|dietary|diet aide|cook|chef|culinary|nutrition serv|dishwasher/i]],
  ["Non-clinical", "Patient transport", [/transport/i]],
  ["Non-clinical", "Security", [/security|public safety|protective services|officer|parking|valet/i], /chief|compliance|privacy|financial|information|loan/i],
  ["Non-clinical", "Facilities and supply chain", [/maintenance|locksmith|plumb|electrician|hvac|carpenter|painter|grounds|material|supply|warehouse|courier|driver|utility tech|service tech|biomed/i]],
  ["Non-clinical", "Research", [/research|scientist|postdoc|fellow\b|laboratory manager/i]],
  ["Non-clinical", "IT", [/software|developer|engineer|system administrator|network|epic|data|informatics/i, /\bIT\b/]],
  ["Non-clinical", "Business and administration", [/analyst|account|finance|billing|coder|coding|revenue|payroll|human resources|recruit|marketing|administrative|secretary|clerk|coordinator|assistant|specialist|representative|operator|buyer|advisor|associate|underwriter|teller|auditor|strategist/i, /\bHR\b/]],
];

// ------------------------------------------------------------------ specialties

const SPECIALTIES: Array<[string, RegExp, RegExp?]> = [
  ["NICU", /\bNICU\b|neonatal intensive/i],
  ["PICU", /\bPICU\b|pediatric intensive/i],
  ["ICU", /\b(ICU|MICU|SICU|CVICU|TICU|NSICU|CCU)\b|critical care|intensive care/i],
  ["Emergency", /emergency|trauma/i, /\b(ED|ER)\b/],
  ["Perioperative", /operating room|peri-?op|surgical services|surgery|\bPACU\b|pre-?op|post-?op|endoscopy|\bGI lab\b|\bCVOR\b/i, /\bOR\b/],
  ["Med-surg", /med[\s/-]?surg|medical[\s/-]surgical/i],
  ["Telemetry / step-down", /\btele(metry)?\b|\bPCU\b|progressive care|step[\s-]?down|intermediate care|\bIMCU\b/i],
  ["Labor and delivery", /labor (and|&) delivery|\bL ?& ?D\b|birthing|\bLDRP\b/i],
  ["Mother-baby / postpartum", /postpartum|mother[\s/-]?baby|women'?s services|obstetric/i, /\bOB\b/],
  ["Pediatrics", /pediatric|\bpeds\b|children'?s/i],
  ["Oncology", /oncolog|cancer|infusion|hematolog|chemo/i],
  ["Cardiac", /cardiac|cardio|cath lab|heart|electrophysiolog/i],
  ["Behavioral health", /behavioral|psych|mental health/i],
  ["Dialysis", /dialysis|nephrolog|renal/i],
  ["Home health / hospice", /home health|home care|hospice|palliative/i],
  ["Rehabilitation", /rehab/i],
  ["Ambulatory", /ambulatory|clinic\b|primary care|physician practice|urgent care|outpatient/i],
  ["Float pool", /\bfloat\b|resource pool|staffing pool/i],
  ["Case management", /case manag|care coordinat|utilization/i],
  ["Neuro", /neuro|stroke/i],
  ["Orthopedics", /ortho/i],
  ["Long-term care", /long[\s-]term care|\bLTC\b|skilled nursing|\bSNF\b/i],
];

// ------------------------------------------------------------------ the rest

const LICENSES: Array<[string, RegExp]> = [
  ["RN license", /\bRN licen|registered nurse licen|licensed (as a )?registered nurse|licensure as a registered nurse|current (state )?RN\b/i],
  ["Compact (NLC) license", /\bcompact\b|multi-?state licen|\bNLC\b/i],
  ["LPN / LVN license", /\b(LPN|LVN) licen|licensed (practical|vocational) nurse/i],
  ["BLS", /\bBLS\b|basic life support|\bBCLS\b/],
  ["ACLS", /\bACLS\b|advanced cardiac life support/],
  ["PALS", /\bPALS\b|pediatric advanced life support/],
  ["NRP", /\bNRP\b|neonatal resuscitation/],
  ["TNCC", /\bTNCC\b|trauma nursing core/],
  ["CCRN", /\bCCRN\b/],
  ["CEN", /\bCEN\b/],
  ["ARRT", /\bARRT\b/],
  ["ARDMS", /\bARDMS\b/],
  ["ASCP", /\bASCP\b/],
  ["RRT / CRT", /\b(RRT|CRT|NBRC)\b/],
  ["CNA certification", /\bCNA\b (certif|licen)|certified nurs(e|ing) assistant/i],
  ["Pharmacy technician certification", /\b(CPhT|PTCB)\b/],
  ["Board certified", /board[\s-](certified|eligible|certification)/i],
  ["DEA", /\bDEA\b/],
];

const SIGN_ON = /(sign[\s-]?on|signing|hiring|new[\s-]hire)[\s-]+bonus/gi;
const AMOUNT = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([kK])?\b|\b(\d{1,3})\s?[kK]\b/g;

/**
 * The sign-on bonus amount: the dollar figure closest to a "sign-on bonus"
 * phrase, within a few words of it ("Up to $7,500 Sign-On Bonus", "sign-on
 * bonus of $10,000"). Other figures nearby (quality bonuses, loan repayment,
 * salary) are further away and lose. The largest such bonus in the text wins.
 */
export function bonusAmount(text: string, inTitle = false): number | null {
  const phrases = [...text.matchAll(SIGN_ON)];
  // "$25,000 Bonus" in a title is a sign-on bonus; in a description a bare "bonus" could be anything.
  if (inTitle) phrases.push(...text.matchAll(/\bbonus\b/gi));
  let best: number | null = null;
  for (const m of phrases) {
    const from = Math.max(0, m.index! - 45);
    const near = text.slice(from, m.index! + m[0].length + 35);
    let pick: { n: number; dist: number } | null = null;
    for (const a of near.matchAll(AMOUNT)) {
      const n = a[1] ? Number(a[1].replace(/,/g, "")) * (a[2] ? 1000 : 1) : Number(a[3]) * 1000;
      // A sign-on bonus is hundreds to tens of thousands; anything else here is a wage or a year.
      if (n < 500 || n > 100_000) continue;
      const at = from + a.index!;
      const dist = at < m.index! ? m.index! - (at + a[0].length) : at - (m.index! + m[0].length);
      if (!pick || dist < pick.dist) pick = { n, dist };
    }
    if (pick && (best === null || pick.n > best)) best = pick.n;
  }
  return best;
}

export function clinicalTags(j: ClinicalInput): ClinicalTags {
  const title = j.title ?? "";
  const dept = j.department ?? "";
  const desc = j.description ?? "";
  const label = `${title} | ${dept}`;

  let roleFamily: RoleFamily = "Other";
  let roleType: string | null = null;
  for (const [family, type, any, unless] of ROLES) {
    if (any.some((re) => re.test(title)) && !(unless && unless.test(title))) {
      roleFamily = family;
      roleType = type;
      break;
    }
  }
  const clinical = !["Non-clinical", "Other"].includes(roleFamily);
  const specialties = clinical ? SPECIALTIES.filter(([, re, caps]) => re.test(label) || !!caps?.test(label)).map(([s]) => s) : [];
  // "ICU Stepdown" is a step-down unit, not an ICU.
  if (/\bICU[\s-]*step[\s-]?down/i.test(label) && !/\bICU\b/i.test(label.replace(/\bICU[\s-]*step[\s-]?down/gi, ""))) {
    const i = specialties.indexOf("ICU");
    if (i >= 0) specialties.splice(i, 1);
  }
  // NICU and PICU are also ICUs; listing "ICU" again would only add noise.
  if (specialties.includes("ICU") && /\b(NICU|PICU)\b/i.test(label) && !/\b(ICU|MICU|SICU|CVICU)\b/.test(label.replace(/\b(NICU|PICU)\b/gi, ""))) {
    specialties.splice(specialties.indexOf("ICU"), 1);
  }

  // Shift: the title says it plainly ("RN NICU Nights", "7p-7a"); the description only counts in explicit phrases.
  const shiftText = `${title} ${desc.match(/\b(day|night|evening|rotating|weekend)s? shifts?\b/gi)?.join(" ") ?? ""}`;
  const shift: ClinicalTags["shift"] = [];
  if (/\bdays?\b|day shift|\b0?[5-8](:?\d\d)?\s?a(m)?\s?[-–]/i.test(shiftText) && !/\d+\s+days\b/i.test(title)) shift.push("days");
  if (/\bnights?\b|night shift|\bNOC\b|\b(0?[6-9]|1[01])(:?\d\d)?\s?p(m)?\s?[-–]\s?0?[5-8](:?\d\d)?\s?a|\b(3rd|third) shift/i.test(shiftText)) shift.push("nights");
  if (/\bevenings?\b|evening shift|\b(2nd|second) shift|\bPM shift\b|\b0?[2-4](:?\d\d)?\s?p(m)?\s?[-–]\s?(1[01]|12)(:?\d\d)?\s?(p|a)/i.test(shiftText)) shift.push("evenings");
  if (/rotat/i.test(shiftText)) shift.push("rotating");
  if (/weekend/i.test(shiftText)) shift.push("weekends");
  const hours = `${title} ${desc}`.match(/\b(8|10|12)[\s-]?(hour|hr)s?\b/i);

  const emp = `${title} | ${j.employmentType ?? ""}`;
  const employment: Employment | null = /locum/i.test(emp)
    ? "locum"
    : /\btravel(er|ing)?\b/i.test(title) || /travel/i.test(j.employmentType ?? "")
      ? "travel"
      : /per[\s-]?diem|\bPRN\b|\bcasual\b|as needed/i.test(emp)
        ? "per diem"
        : /\bcontract\b|temporary|\btemp\b|seasonal/i.test(emp)
          ? "contract"
          : (/part[\s-]?time/i.test(emp) || /\bPT\b(?!A)|\b0?\.[1-7]\d? FTE\b/.test(emp)) && !/physical therap/i.test(title)
            ? "part time"
            : /full[\s-]?time|\bFT\b/i.test(emp)
              ? "full time"
              : null;

  const signOnBonus = new RegExp(SIGN_ON.source, "i").test(`${title}\n${desc}`) || /\bbonus\b/i.test(title);
  const licenses = LICENSES.filter(([, re]) => re.test(`${title}\n${desc}`)).map(([l]) => l);

  return {
    roleFamily,
    roleType,
    specialties,
    shift,
    shiftHours: hours ? Number(hours[1]) : null,
    employment,
    signOnBonus,
    signOnBonusAmount: signOnBonus ? Math.max(bonusAmount(title, true) ?? 0, bonusAmount(desc) ?? 0) || null : null,
    licenses,
  };
}
