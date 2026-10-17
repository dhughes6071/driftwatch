import { test } from "node:test";
import assert from "node:assert/strict";
import { bonusAmount, clinicalTags } from "../src/clinical.ts";

const role = (title: string) => {
  const t = clinicalTags({ title });
  return t.roleType ? `${t.roleFamily} / ${t.roleType}` : t.roleFamily;
};

test("role: nursing titles, in the order that matters", () => {
  assert.equal(role("Registered Nurse (RN) - ICU"), "Registered nurse");
  assert.equal(role("New Grad RN Resident – Heart Failure ICU"), "Registered nurse");
  assert.equal(role("Oncology Infusion Nurse | BWH"), "Registered nurse");
  assert.equal(role("Assistant Nurse Manager Med Surg Tele"), "Nursing leadership / Nurse manager");
  assert.equal(role("Nurse Technician, PRN - Med Surg"), "Nursing support / Nursing assistant");
  assert.equal(role("CNA Med/Surg Float Pool"), "Nursing support / Nursing assistant");
  assert.equal(role("Patient Care Technician (PCT) - ICU"), "Nursing support / Patient care technician");
  assert.equal(role("CMA or LPN - Internal Medicine - FT"), "LPN / LVN");
  assert.equal(role("Medical Assistant (MA) | Family Practice | Full Time"), "Nursing support / Medical assistant");
  assert.equal(role("Float Scheduler- Registration-MA"), "Non-clinical / Patient access");
});

test("role: providers, and look-alikes that are not physicians", () => {
  assert.equal(role("Hospitalist Physician"), "Physician");
  assert.equal(role("BE/BC General Surgeon - INTEGRIS Health Canadian Valley Hospital"), "Physician");
  assert.equal(role("Advanced Practice Provider, APRN or PA-C, Physical Medicine and Rehabilitation"), "Advanced practice provider / Nurse practitioner");
  assert.equal(role("Endocrinology CRNP"), "Advanced practice provider / Nurse practitioner");
  assert.equal(role("Speech-Language Pathologist (SLP) - Pediatric Acute Care"), "Allied health / Speech-language pathology");
  assert.equal(role("Pathologists' Assistant - Copley Lab - Day Shift - Per Diem"), "Allied health / Laboratory");
  assert.equal(role("Physician Services Coder II - ED Remote"), "Non-clinical / Business and administration");
  assert.equal(role("Medical Office Coordinator 32 hours Core Physician Epping Pediatrics"), "Non-clinical / Business and administration");
});

test("role: allied health and non-clinical", () => {
  assert.equal(role("Registered Respiratory Therapist"), "Allied health / Respiratory therapy");
  assert.equal(role("Physical Therapist Assistant - PRN"), "Allied health / Physical therapy");
  assert.equal(role("Cat Scan Technologist (CT) - 40hrs"), "Allied health / Imaging");
  assert.equal(role("Phlebotomist, UofL Hospital, Lab, PRN"), "Allied health / Laboratory");
  assert.equal(role("Sterilizing Technician-Full-time Evening Shift"), "Allied health / Surgical technology");
  assert.equal(role("Behavioral Health Tech"), "Allied health / Behavioral health");
  assert.equal(role("Financial Counselor"), "Non-clinical / Patient access");
  assert.equal(role("Floor Technician, Environmental Services, FT, 07A-3:30P"), "Non-clinical / Environmental services");
  assert.equal(role("Patient Access Specialist, PT, 3rd Shift"), "Non-clinical / Patient access");
  assert.equal(role("Director Finance - Hybrid"), "Non-clinical / Leadership");
});

test("specialties: units in capitals and in words; ICU step-down is not an ICU", () => {
  assert.deepEqual(clinicalTags({ title: "RN - Emergency Services - Full Time Evening" }).specialties, ["Emergency"]);
  assert.deepEqual(clinicalTags({ title: "RN Seasonal Trauma PCU" }).specialties, ["Emergency", "Telemetry / step-down"]);
  assert.deepEqual(clinicalTags({ title: "Registered Nurse ICU Stepdown" }).specialties, ["Telemetry / step-down"]);
  assert.deepEqual(clinicalTags({ title: "RN NICU Nights" }).specialties, ["NICU"]);
  assert.deepEqual(clinicalTags({ title: "RN OR Circulator" }).specialties, ["Perioperative"]);
  // "or" as a word is not the OR.
  assert.deepEqual(clinicalTags({ title: "CMA or LPN - Internal Medicine" }).specialties, []);
  // Non-clinical roles get no specialty even when the unit is named.
  assert.deepEqual(clinicalTags({ title: "Patient Service Coordinator- Cardiology" }).specialties, []);
});

test("shift and hours: from the title, or explicit phrases in the description", () => {
  assert.deepEqual(clinicalTags({ title: "RN Labor and Delivery FT Nights" }).shift, ["nights"]);
  assert.deepEqual(clinicalTags({ title: "Radiology Technologist, FT, 7:30A-4P" }).shift, ["days"]);
  assert.deepEqual(clinicalTags({ title: "Clinical Partner 2, Med/Surg, PT, 7P-7:30A" }).shift, ["nights"]);
  assert.deepEqual(clinicalTags({ title: "Patient Access Specialist, FT, 2nd Shift" }).shift, ["evenings"]);
  assert.deepEqual(clinicalTags({ title: "OB Tech- Casual Rotating" }).shift, ["rotating"]);
  assert.deepEqual(clinicalTags({ title: "RN Med Surg", description: "This is a night shift position, 12-hour shifts." }).shift, ["nights"]);
  assert.equal(clinicalTags({ title: "RN Med Surg", description: "Three 12-hour shifts per week." }).shiftHours, 12);
  // "30 days" is not a day shift.
  assert.deepEqual(clinicalTags({ title: "RN Med Surg - start within 30 days" }).shift, []);
});

test("employment: locum, travel, per diem, contract, part and full time", () => {
  const emp = (title: string, employmentType?: string) => clinicalTags({ title, employmentType }).employment;
  assert.equal(emp("Locum Tenens Hospitalist"), "locum");
  assert.equal(emp("Registered Nurse Med Surg Travel", "Full time"), "travel");
  assert.equal(emp("RN MICU Seasonal/PRN Nights", "Part time"), "per diem");
  assert.equal(emp("Respiratory Therapist (RT) Casual"), "per diem");
  assert.equal(emp("Pharmacy Technician - Hospital Contract $30/hr", "Full time"), "contract");
  assert.equal(emp("Emergency Technician 0.6 FTE Night"), "part time");
  assert.equal(emp("RN Ambulatory - Rheumatology - FT"), "full time");
  // PT on a physical therapist is the job, not part time.
  assert.equal(emp("PT - Physical Therapist Outpatient", "Full time"), "full time");
});

test("sign-on bonus: the amount next to the phrase, not other figures nearby", () => {
  const t = clinicalTags({ title: "RN Labor and Delivery FT Nights 10k Sign on bonus" });
  assert.equal(t.signOnBonus, true);
  assert.equal(t.signOnBonusAmount, 10_000);
  assert.equal(clinicalTags({ title: "Radiology Technologist, Surgical Orthopedics, $25,000 Bonus, FT" }).signOnBonusAmount, 25_000);
  assert.equal(bonusAmount("- $315,000 Base Salary\n- Up to $20,000 Quality bonus per year\n- $12,000 tenure bonus\n- $30,000 Sign-on bonus\n- Quarterly RVUs"), 30_000);
  assert.equal(bonusAmount("- $750K Two-Year Guaranteed Salary - $50,000 Signing Bonus - Up to $100,000 Student Loan Repayment"), 50_000);
  assert.equal(bonusAmount("Up to $7,500 Sign-On Bonus - Competitive Pay"), 7_500);
  // Offered but no amount stated.
  const plain = clinicalTags({ title: "New Graduate Nurse", description: "Available Benefits: - Sign On Bonus for Eligible Areas" });
  assert.equal(plain.signOnBonus, true);
  assert.equal(plain.signOnBonusAmount, null);
  // A quality or annual bonus is not a sign-on bonus.
  assert.equal(clinicalTags({ title: "Hospitalist", description: "Annual quality bonus of $20,000." }).signOnBonus, false);
});

test("licenses and certifications", () => {
  const t = clinicalTags({
    title: "RN ICU",
    description: "Requirements: current RN license in Missouri or a compact (multistate) license. BLS and ACLS required within 90 days. CCRN preferred.",
  });
  assert.deepEqual(t.licenses, ["RN license", "Compact (NLC) license", "BLS", "ACLS", "CCRN"]);
  assert.deepEqual(clinicalTags({ title: "Radiologic Technologist", description: "ARRT registered." }).licenses, ["ARRT"]);
});
