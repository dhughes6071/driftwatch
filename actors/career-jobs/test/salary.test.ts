import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSalary, fromAshbyCompensation } from "../src/salary.ts";

/** Every case here is taken from a real description in the 27 Sep 2026 index. */
const pick = (text: string, country: string | null = null) => {
  const s = extractSalary(text, country);
  return s && { min: s.min, max: s.max, currency: s.currency, period: s.period };
};

test("common US range formats", () => {
  assert.deepEqual(pick("Base Salary Range: $135,000&mdash;$216,000 USD What We Offer"), { min: 135000, max: 216000, currency: "USD", period: "year" });
  assert.deepEqual(pick("The pay range for the role is $78,100 to $105,000. The specific offer"), { min: 78100, max: 105000, currency: "USD", period: "year" });
  assert.deepEqual(pick("Pay Range: $17.56-$26.70 /HR Visa Sponsorship"), { min: 17.56, max: 26.7, currency: "USD", period: "hour" });
  assert.deepEqual(pick("The annual base salary range for this position is USD 109,700.00 To USD 175,500.00"), { min: 109700, max: 175500, currency: "USD", period: "year" });
  assert.deepEqual(pick("The salary range for this position is $30 -$31/hourly. In addition"), { min: 30, max: 31, currency: "USD", period: "hour" });
  assert.deepEqual(pick("starting in the range of $20 - $27 USD per hour."), { min: 20, max: 27, currency: "USD", period: "hour" });
  assert.deepEqual(pick("The hourly range for the position is $23.00 - $25.00 Additional Compensation"), { min: 23, max: 25, currency: "USD", period: "hour" });
  assert.deepEqual(pick("Total Base Pay Range for this Position: $17.25 - $20.30 This position"), { min: 17.25, max: 20.3, currency: "USD", period: "hour" });
});

test("k suffixes, including one k for both ends", () => {
  assert.deepEqual(pick("Compensation: $120k - $150k per year"), { min: 120000, max: 150000, currency: "USD", period: "year" });
  assert.deepEqual(pick("Salary range $120-150K"), { min: 120000, max: 150000, currency: "USD", period: "year" });
});

test("other currencies, and a bare $ in Canada is CAD", () => {
  assert.deepEqual(pick("Salary: £29,071 - £30,515 (for Level 1 AAT) per annum"), { min: 29071, max: 30515, currency: "GBP", period: "year" });
  assert.deepEqual(pick("Salary range: $70,000 - $85,000 annually", "CA"), { min: 70000, max: 85000, currency: "CAD", period: "year" });
  assert.deepEqual(pick("Gehalt: €55,000 - €65,000 pro Jahr, salary negotiable"), { min: 55000, max: 65000, currency: "EUR", period: "year" });
});

test("single pay figure right after a pay word", () => {
  assert.deepEqual(pick("Safety Sensitive Position (Yes/No): No Hourly Base Pay: $20.50, plus $5.00 per hour training pay."), {
    min: 20.5, max: 20.5, currency: "USD", period: "hour",
  });
});

test("money that is not pay is ignored", () => {
  assert.equal(pick("with total fiscal year 2025 sales of more than $86 billion. Lowe's employs"), null);
  assert.equal(pick("has raised $185 million in capital since 2018"), null);
  assert.equal(pick("or $25,000 bodily injury per person/$25,000 bodily injury per event /$10,000 for property damage"), null);
  assert.equal(pick("Up to $25K reimbursement for fertility, adoption, and parental planning"), null);
  assert.equal(pick("closing fiscal 2026 with $3.7 billion in revenue"), null);
  assert.equal(pick("Advocate Health provides more than $6 billion in annual community benefits."), null);
  assert.equal(pick("a $2,000 - $5,000 signing bonus is available"), null);
  assert.equal(pick("Tuition assistance of $1,000 to $5,250 per year"), null);
});

test("the first range wins when a posting lists one per state", () => {
  assert.deepEqual(pick("Minnesota Range: $76,000 - $82,000 Massachusetts Range: $88,000 - $105,000"), {
    min: 76000, max: 82000, currency: "USD", period: "year",
  });
});

test("annualised values", () => {
  const s = extractSalary("Pay Range: $20.00 - $25.00 per hour");
  assert.equal(s?.annualMin, 41600);
  assert.equal(s?.annualMax, 52000);
});

test("Ashby structured compensation", () => {
  const s = fromAshbyCompensation({
    compensationTiers: [
      {
        components: [
          { compensationType: "EquityPercentage", interval: "NONE", currencyCode: null, minValue: null, maxValue: null },
          { compensationType: "Salary", interval: "1 YEAR", currencyCode: "USD", minValue: 211400, maxValue: 290600, summary: "$211.4K – $290.6K" },
        ],
      },
    ],
  });
  assert.deepEqual(s && { min: s.min, max: s.max, currency: s.currency, period: s.period, source: s.source }, {
    min: 211400, max: 290600, currency: "USD", period: "year", source: "structured",
  });
  assert.equal(fromAshbyCompensation(null), null);
});

test("fixes from the missed-range review (27 Sep sample)", () => {
  assert.deepEqual(pick("What We Offer The salary range for this role is $17.13 - $30.10. The salary range"), { min: 17.13, max: 30.1, currency: "USD", period: "hour" });
  assert.deepEqual(pick("Pay Range: $19.32 - $24.13 Scheduled Weekly Hours: 40"), { min: 19.32, max: 24.13, currency: "USD", period: "hour" });
  assert.deepEqual(pick("Annual Base Salary Range or Hourly Base Pay Range: $98,293.33 - $137,900.00Compensation Type"), { min: 98293.33, max: 137900, currency: "USD", period: "year" });
  assert.deepEqual(pick("Our new Retail Sales Consultant's earn between $53,500 – $75,000, including hourly rate"), { min: 53500, max: 75000, currency: "USD", period: "year" });
  assert.deepEqual(pick("- Tuition Reimbursement - Transit Zone 1 Reimbursement Compensation: Salary Pay Range: $50,000 to $60,000 per year."), { min: 50000, max: 60000, currency: "USD", period: "year" });
  assert.deepEqual(pick("Austria Pay Ranges: - Austria: €61.500 - €102.400 EUR Annual"), { min: 61500, max: 102400, currency: "EUR", period: "year" });
  assert.deepEqual(pick("Die Gehaltsspanne für diese Position ist:€79.104,00 - €118.656,00Final compensation"), { min: 79104, max: 118656, currency: "EUR", period: "year" });
  assert.deepEqual(pick("we bieden je: - € 3.700 - € 5.300 bruto per maand op basis van 40 uur"), { min: 3700, max: 5300, currency: "EUR", period: "month" });
  // still refused
  assert.equal(pick("Hourly plus bonus averaging $1,000-$1,350 a week"), null);
  assert.equal(pick("annual revenues of $20-50 million and helps companies"), null);
});

test("a yearly range next to 'hours per week' stays yearly", () => {
  assert.deepEqual(pick("Salary Range: $83,000–$90,000 based on 40 hours per week"), { min: 83000, max: 90000, currency: "USD", period: "year" });
});

test("large figures next to 'per month' are yearly", () => {
  assert.deepEqual(pick("Base salary: $50,000-$80,000 plus commission paid per month"), { min: 50000, max: 80000, currency: "USD", period: "year" });
  assert.deepEqual(pick("Microbiologist 2 salary $5,111 to $6,870 per month"), { min: 5111, max: 6870, currency: "USD", period: "month" });
  assert.deepEqual(pick("Salary ₹20,000 - ₹25,000 per month"), { min: 20000, max: 25000, currency: "INR", period: "month" });
});

test("minimum/maximum pairs and an hourly range after a job title (Jobvite, 29 Sep)", () => {
  assert.deepEqual(pick("Hours & Days of Work: 35 hours per week Minimum Salary: $77,932.00 Maximum Salary: $97,388.00 Target Start Date"), {
    min: 77932, max: 97388, currency: "USD", period: "year",
  });
  assert.deepEqual(pick("Full-Time Retail Sales Associate $15.00 – $18.00 per hour + Unlimited Commission"), {
    min: 15, max: 18, currency: "USD", period: "hour",
  });
});

test("currency code after each number, no symbol (NVIDIA on Workday, 30 Sep)", () => {
  assert.deepEqual(pick("The base salary range is 124,000 USD - 195,500 USD for Level 4, and 148,000 USD - 235,750 USD for Level 5."), {
    min: 124000, max: 195500, currency: "USD", period: "year",
  });
  assert.deepEqual(pick("Salary: 55.000 EUR - 65.000 EUR brutto pro Jahr"), { min: 55000, max: 65000, currency: "EUR", period: "year" });
  // still refused: no pay context, or not pay
  assert.equal(pick("Reported revenue of 400 USD - 500 USD million this quarter"), null);
  assert.equal(pick("Teams of 20-50 people across 3 sites"), null);
  // a symbol-prefixed range is read once, not twice
  assert.deepEqual(pick("Pay range: $98,000 USD - $125,000 USD per year"), { min: 98000, max: 125000, currency: "USD", period: "year" });
});

test("Greenhouse pay ranges (no period given: size decides)", async () => {
  const { fromGreenhousePay, fromStructuredPay } = await import("../src/salary.ts");
  const r = (min: number, max: number, cur = "USD") => ({ payInputRanges: [{ min_cents: min * 100, max_cents: max * 100, currency_type: cur, title: "Range" }] });
  const y = fromGreenhousePay(r(130000, 150000));
  assert.deepEqual(y && [y.min, y.max, y.currency, y.period, y.source], [130000, 150000, "USD", "year", "structured"]);
  const h = fromGreenhousePay(r(24, 31.5, "CAD"));
  assert.deepEqual(h && [h.period, h.currency, h.annualMax], ["hour", "CAD", 65520]);
  assert.equal(fromGreenhousePay(r(2000, 5000)), null, "the ambiguous middle is not guessed");
  assert.equal(fromGreenhousePay({ payInputRanges: [] }), null);
  assert.equal(fromStructuredPay(r(90000, 110000))?.min, 90000);
  assert.equal(fromStructuredPay(null), null);
});

test("Lever salaryRange", async () => {
  const { fromLeverSalaryRange, fromStructuredPay } = await import("../src/salary.ts");
  const y = fromLeverSalaryRange({ leverSalaryRange: { min: 110000, max: 180000, currency: "USD", interval: "per-year-salary" } });
  assert.deepEqual(y && [y.min, y.max, y.currency, y.period, y.source], [110000, 180000, "USD", "year", "structured"]);
  const h = fromStructuredPay({ leverSalaryRange: { min: 22, max: 26, currency: "usd", interval: "per-hour-wage" } });
  assert.deepEqual(h && [h.period, h.currency], ["hour", "USD"]);
  assert.equal(fromLeverSalaryRange({ leverSalaryRange: { min: 1, max: 2, currency: "USD", interval: "per-year-salary" } }), null, "implausible");
  assert.equal(fromLeverSalaryRange({ leverSalaryRange: { min: 100, max: 200, currency: "USD", interval: "one-time" } }), null);
});
