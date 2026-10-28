/**
 * Result cap for users on Apify's free plan.
 *
 * Apify pays developers only for runs by paying users, and in October 2026
 * free-plan users took ~99.6% of this Actor's results (247,531 results, $1.53
 * revenue). Free users still get a real sample on every run; past it, the
 * SUMMARY and the run's status message explain how to lift the cap.
 */
export const FREE_PLAN_MAX_JOBS = 200;

export const FREE_PLAN_NOTE =
  `Apify free plan: this run returns up to ${FREE_PLAN_MAX_JOBS} jobs. ` +
  "Any paid Apify plan removes the cap (still $1.50 per 1,000 jobs): https://apify.com/pricing";

/**
 * The job limit for this run. Only runs on the Apify platform by a user that
 * Apify reports as not paying (APIFY_USER_IS_PAYING is "1" only for paying
 * users) are capped; local runs never are.
 */
export function jobLimit(maxJobs: number, env: { atHome: boolean; userIsPaying: string | null | undefined }) {
  const freePlan = env.atHome && env.userIsPaying !== "1";
  return freePlan && maxJobs > FREE_PLAN_MAX_JOBS
    ? { limit: FREE_PLAN_MAX_JOBS, freePlanCapped: true }
    : { limit: maxJobs, freePlanCapped: false };
}
