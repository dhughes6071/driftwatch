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

test("hourly pay written to three or four decimals is not thousands (Sharp and others, 4 Nov)", () => {
  assert.deepEqual(pick("Hourly Pay Range (Minimum - Midpoint - Maximum): $26.320 - $32.890 - $36.830 The stated pay scale"), { min: 26.32, max: 36.83, currency: "USD", period: "hour" });
  assert.deepEqual(pick("Hourly Pay Range (Minimum - Midpoint - Maximum): $80.440 - $103.790 - $116.240"), { min: 80.44, max: 116.24, currency: "USD", period: "hour" });
  assert.deepEqual(pick("Salary or Pay Band: Pay Band 16 $36.160 to $38.720 (3 step range)", "CA"), { min: 36.16, max: 38.72, currency: "CAD", period: "hour" });
  assert.deepEqual(pick("Salary: $40.911 to $57.695 per hour", "CA"), { min: 40.91, max: 57.7, currency: "CAD", period: "hour" });
  assert.deepEqual(pick("Pay Rate: $36.706 - $37.967 per hour Eligible for"), { min: 36.71, max: 37.97, currency: "USD", period: "hour" });
  assert.deepEqual(pick("Salary Range: $23.331-$23.755. Click here"), { min: 23.33, max: 23.76, currency: "USD", period: "hour" });
  assert.deepEqual(pick("The compensation for the position is: $29.64 - $34.873 Cushman"), { min: 29.64, max: 34.87, currency: "USD", period: "hour" });
  assert.deepEqual(pick("THE STARTING RATE: $26.683 + tips"), { min: 26.68, max: 26.68, currency: "USD", period: "hour" });
  assert.deepEqual(pick("Starting wage $50.000/hour. Additional $3/hour"), { min: 50, max: 50, currency: "USD", period: "hour" });
  assert.deepEqual(pick("Compensation: Salary: $51.4543 an hour What we Offer"), { min: 51.45, max: 51.45, currency: "USD", period: "hour" });
  assert.deepEqual(pick("Hourly Rate:$31.0584"), { min: 31.06, max: 31.06, currency: "USD", period: "hour" });
  assert.deepEqual(pick("Our consultants earn between $16.9375 - $20.825 per hour plus commissions"), { min: 16.94, max: 20.83, currency: "USD", period: "hour" });
  assert.deepEqual(pick("Pay Band 13 $27.990 to $30.000 (3 step range)", "CA"), { min: 27.99, max: 30, currency: "CAD", period: "hour" });
  assert.deepEqual(pick("Job Types: Full-time Salary: $15.000 TO $18.00 /hour"), { min: 15, max: 18, currency: "USD", period: "hour" });
  assert.deepEqual(pick("Compensation $22.81875/hour Why"), { min: 22.82, max: 22.82, currency: "USD", period: "hour" });
  const s = extractSalary("Hourly Pay Range (Minimum - Midpoint - Maximum): $26.320 - $32.890 - $36.830");
  assert.equal(s?.annualMin, 54746);
  assert.equal(s?.annualMax, 76606);
});

test("a dollar salary typed with dots stays a salary", () => {
  const year = (min: number, max: number) => ({ min, max, currency: "USD", period: "year" });
  assert.deepEqual(pick("What We Offer Salary: $165.000 - $185.000 + Bonus"), year(165000, 185000));
  assert.deepEqual(pick("The base salary range for this role is $120.000 - $140.000 per year."), year(120000, 140000));
  assert.deepEqual(pick("The pay range is $176,800 - $239.200 based on experience"), year(176800, 239200));
  assert.deepEqual(pick("The salary range for this role is $65.000 to $85,000"), year(65000, 85000));
  assert.deepEqual(pick("salary range for the Account Manager opportunity in the U.S. is $ 145.311 to $ 196.597. This range"), year(145311, 196597));
  assert.deepEqual(pick("SALARY RANGE IS FROM $93.150 TO $155.250 (ANNUAL) At Diageo"), year(93150, 155250));
  assert.deepEqual(pick("The anticipated range is $74.600,00 - $124.700,00 base salary"), year(74600, 124700));
  assert.deepEqual(pick("Annual Salary: $72.404 = base + commission"), year(72404, 72404));
  assert.deepEqual(pick("Salary: $144.633/yr. Standard company benefits"), year(144633, 144633));
  assert.deepEqual(pick("Grade: 25 Salary: $56.867.20 - $79.747.20/Annually Location"), year(56867.2, 79747.2));
  assert.deepEqual(pick("Annual Salary: $40.934.40 Position Summary"), year(40934.4, 40934.4));
  assert.deepEqual(pick("Salary: $3,657.33 - $5.250.00 per month commensurate"), { min: 3657.33, max: 5250, currency: "USD", period: "month" });
  assert.deepEqual(pick("40 hour position. Salary: $85.000 - $95.000 plus benefits"), year(85000, 95000));
});

test("European amounts in other currencies still read as thousands", () => {
  assert.deepEqual(pick("Salary: €26.320 - €36.830 per year"), { min: 26320, max: 36830, currency: "EUR", period: "year" });
  assert.deepEqual(pick("La fascia retributiva: €30.560 - €46.310 annual"), { min: 30560, max: 46310, currency: "EUR", period: "year" });
  assert.deepEqual(pick("Salary: 45.320 EUR - 65.840 EUR brutto pro Jahr"), { min: 45320, max: 65840, currency: "EUR", period: "year" });
  assert.deepEqual(pick("role based in United Kingdom compensation is GBP 63.800 - 95.600."), { min: 63800, max: 95600, currency: "GBP", period: "year" });
  assert.deepEqual(pick("Salary: 45.320 CHF - 65.840 CHF per year"), { min: 45320, max: 65840, currency: "CHF", period: "year" });
});

test("minimum, midpoint and maximum: the top of the range is the third number", () => {
  const year = (min: number, max: number) => ({ min, max, currency: "USD", period: "year" });
  assert.deepEqual(pick("Hiring Range: $83,400 - $116,800 - $150,000- USD/ Austin, TX"), year(83400, 150000));
  assert.deepEqual(pick("Base Salary Range: $124,500.00 – $155,500.00 – $186,000.00 annually"), year(124500, 186000));
  assert.deepEqual(pick("expected to range between: $225,400.00 - 322,000.00 - 418,600.00 USD Annual"), year(225400, 418600));
  assert.deepEqual(pick("The expected base pay for this position at hiring is $22.40 - $29.86 - $37.33. Please note"), { min: 22.4, max: 37.33, currency: "USD", period: "hour" });
  assert.deepEqual(pick("Pay range is $56,539 - 73,501 - 90,462.00 CAD Annual"), { min: 56539, max: 90462, currency: "CAD", period: "year" });
  // the next bullet is not the top of the range
  assert.deepEqual(pick("Base Salary: $65,000 - $70,000 - 5% Annual Incentive"), year(65000, 70000));
  assert.deepEqual(pick("Competitive base salary $34,880 - $40,980 - 401(k) retirement"), year(34880, 40980));
  assert.deepEqual(pick("Pay Range $25.51 to $30.39 - $2,500 Stay Bonus"), { min: 25.51, max: 30.39, currency: "USD", period: "hour" });
  assert.deepEqual(pick("The salary range is $65,000 - $70,000 - $75,000 sign-on bonus available"), year(65000, 70000));
  assert.deepEqual(pick("Hourly Compensation Range $29.00-$36.00 - 30 hours"), { min: 29, max: 36, currency: "USD", period: "hour" });
});
