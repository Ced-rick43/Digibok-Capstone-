// BIR compliance reference data for NON-VAT taxpayers (annual gross receipts below P3,000,000).
// VAT-registered taxpayers (above P3,000,000) file a different set of forms and are out of scope here.

export interface RegistrationStep {
  step: number;
  agency: string;
  title: string;
  description: string;
}

export interface ScheduleItem {
  form: string;
  label: string;
  category: "Percentage Tax" | "Income Tax" | "Annual Income Tax";
  dueDate: string; // YYYY-MM-DD
  status: "overdue" | "urgent" | "upcoming";
}

// One-time setup path a bookkeeper walks a new client through before any filing begins.
export const REGISTRATION_CHECKLIST: RegistrationStep[] = [
  {
    step: 1,
    agency: "DTI",
    title: "Register the Business Name",
    description: "Secure the DTI Certificate of Business Name Registration before anything else.",
  },
  {
    step: 2,
    agency: "LGU",
    title: "Secure the Mayor's/Business Permit",
    description: "Apply at the municipal hall using the DTI certificate and lease/lot documents.",
  },
  {
    step: 3,
    agency: "BIR",
    title: "Register with the BIR",
    description: "File BIR Form 1901/1903 with DTI and Mayor's Permit to obtain the TIN and Certificate of Registration.",
  },
  {
    step: 4,
    agency: "BIR",
    title: "Display Required Certificates",
    description: "TIN, Certificate of Registration (BIR Form 2303), the \"Notice to Issue Receipts/Invoices\" poster, and the Authority to Print (ATP) receipts/invoices must all be posted where customers can see them.",
  },
];

const NON_VAT_DEADLINES: { form: string; label: string; category: ScheduleItem["category"]; month: number; day: number }[] = [
  { form: "2551Q", label: "Percentage Tax - 1st Quarter", category: "Percentage Tax", month: 4, day: 25 },
  { form: "2551Q", label: "Percentage Tax - 2nd Quarter", category: "Percentage Tax", month: 7, day: 25 },
  { form: "2551Q", label: "Percentage Tax - 3rd Quarter", category: "Percentage Tax", month: 10, day: 25 },
  { form: "2551Q", label: "Percentage Tax - 4th Quarter", category: "Percentage Tax", month: 1, day: 25 },
  { form: "1701Q", label: "Income Tax - 1st Quarter", category: "Income Tax", month: 5, day: 15 },
  { form: "1701Q", label: "Income Tax - 2nd Quarter", category: "Income Tax", month: 8, day: 15 },
  { form: "1701Q", label: "Income Tax - 3rd Quarter", category: "Income Tax", month: 11, day: 15 },
  { form: "1701", label: "Annual Income Tax Return", category: "Annual Income Tax", month: 4, day: 15 },
];

function statusFor(dueDate: Date, today: Date): ScheduleItem["status"] {
  const days = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "overdue";
  if (days <= 30) return "urgent";
  return "upcoming";
}

// Formats using local calendar fields (never toISOString(), which shifts local
// midnight into a different UTC day depending on the server/browser timezone).
function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Builds the NON-VAT filing calendar (all 8 forms), each rolled forward to its next
// unmissed occurrence relative to the reference date (so a January lookup still shows
// last year's Apr/Jul/Oct deadlines as "next year", not as already-passed noise).
export function getNonVatSchedule(referenceDate: Date = new Date()): ScheduleItem[] {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  return NON_VAT_DEADLINES.map((d) => {
    let due = new Date(today.getFullYear(), d.month - 1, d.day);
    if (due.getTime() < today.getTime()) {
      due = new Date(today.getFullYear() + 1, d.month - 1, d.day);
    }
    return {
      form: d.form,
      label: d.label,
      category: d.category,
      dueDate: toLocalIsoDate(due),
      status: statusFor(due, today),
    };
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
