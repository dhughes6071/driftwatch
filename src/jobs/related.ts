/**
 * One line at the end of each run pointing to our other job Actors: the
 * hospital one for clinical searches, the all-in-one index for everything
 * else. Shown in the log and the SUMMARY record; never affects results.
 */
const CLINICAL = /\b(nurse|nursing|rn|lpn|lvn|cna|physician|hospital|clinical|medical|therapist|pharmac|radiolog|sonograph|phlebotom|surgical|paramedic|caregiver|healthcare|health care)\b/i;

export function relatedTip(titleKeywords: string[] = []): string {
  if (titleKeywords.some((k) => CLINICAL.test(k))) {
    return "For hospital roles, US Hospital & Nurse Jobs covers 113,000+ openings at 68 large US health systems, with unit, shift, per diem and sign-on bonus filters: https://apify.com/viridian_layout_ea2/us-hospital-jobs";
  }
  return "To search 1.8M jobs from 19,000+ companies (Workday, Oracle and 15 more systems) in one run, try the Career Site Jobs API: https://apify.com/viridian_layout_ea2/career-site-jobs-api";
}
