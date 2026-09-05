import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { dbInstance, Payment, GeneralLedgerEntry } from "./db";
import { getTrialBalance, getIncomeStatement, getBalanceSheet, TrialBalanceResult, IncomeStatementResult, BalanceSheetResult } from "./financialStatements";

// Ensure upload directory exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface ReportGenerationParams {
  clientId: number;
  reportType: string;
  period: string;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
}

// Fetches everything this report type could need up front (all async DB/statement
// calls), so the actual PDF-drawing pass below can stay fully synchronous — pdfkit's
// API is drawing calls + a callback-based write stream, not async/await-friendly.
export async function generateReportPDF(params: ReportGenerationParams): Promise<{ filePath: string; fileName: string; fileSize: string }> {
  const { clientId, reportType, period } = params;
  const clientProfiles = await dbInstance.getClientProfiles();
  const client = clientProfiles.find((c) => c.client_id === clientId);
  if (!client) {
    throw new Error("Client not found");
  }

  const today = new Date().toISOString().split("T")[0];
  const asOfDate = params.asOfDate || today;
  const startDate = params.startDate || `${new Date().getFullYear()}-01-01`;
  const endDate = params.endDate || today;

  const users = await dbInstance.getUsers();
  const ownerName = users.find((u) => u.user_id === client.user_id)?.name || "N/A";
  const ledger = await dbInstance.getGeneralLedger(clientId);

  let incomeStmt: IncomeStatementResult | null = null;
  let balanceSheet: BalanceSheetResult | null = null;
  let trialBalance: TrialBalanceResult | null = null;
  let payments: Payment[] = [];

  if (reportType.includes("Income Statement")) {
    incomeStmt = await getIncomeStatement(clientId, startDate, endDate);
  } else if (reportType.includes("Balance Sheet")) {
    balanceSheet = await getBalanceSheet(clientId, asOfDate);
  } else if (reportType.includes("Trial Balance")) {
    trialBalance = await getTrialBalance(clientId, asOfDate);
  } else if (reportType.includes("Payment Summary")) {
    payments = await dbInstance.getPayments(clientId);
  }

  return new Promise((resolve, reject) => {
    try {
      const sanitizeForFileName = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      const fileName = `DigiBok_${sanitizeForFileName(reportType)}_Client_${clientId}_${sanitizeForFileName(period)}.pdf`;
      const filePath = path.join(UPLOADS_DIR, fileName);

      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Color Palette Constants
      const PRIMARY = "#0F172A"; // Text primary (Dark Navy)
      const ACCENT_AMBER = "#F59E0B"; // Amber (Dues, Title borders)
      const ACCENT_TEAL = "#10B981"; // Teal (Perfect compliance)
      const SECONDARY_MUTED = "#64748B"; // Text secondary
      const SURFACE_BG = "#F1F5F9"; // Card Background
      const FOOTER_BG = "#FEF3E2"; // Pale amber highlight — echoes the header's amber accent rule

      // Highlighted footer bar, identifying the business/report on every page — not
      // just wherever content happened to end. The old version set doc.y to a fixed
      // 680 once, after all content was drawn, so it only ever appeared on the LAST
      // page of a multi-page report (Trial Balance, Payment Summary, etc. with enough
      // rows to trigger addPage()); every earlier page had no footer at all. Hooking
      // "pageAdded" draws this on every new page automatically; the initial page (from
      // `new PDFDocument()`) doesn't fire that event, so it's also called once by hand
      // right after the header below.
      //
      // Two things matter for staying inside pdfkit's own bottom margin (792 - 50 = 742
      // on a Letter page): the box has to fully fit above that line, and every .text()
      // call needs { lineBreak: false }. Without it, pdfkit's own overflow check on a
      // wrapped text call this close to the margin can decide it "doesn't fit" and
      // silently call addPage() on our behalf mid-draw — which re-fires this same
      // pageAdded listener and recurses into a stack overflow (hit this for real while
      // testing: "Maximum call stack size exceeded").
      const FOOTER_TOP = 672;
      const drawFooter = () => {
        doc.rect(50, FOOTER_TOP, 512, 3).fill(ACCENT_AMBER);
        doc.rect(50, FOOTER_TOP + 3, 512, 57).fill(FOOTER_BG);

        doc
          .fontSize(9.5)
          .font("Helvetica-Bold")
          .fillColor(PRIMARY)
          .text(client.business_name, 60, FOOTER_TOP + 12, { width: 492, lineBreak: false });
        doc
          .fontSize(8)
          .font("Helvetica")
          .fillColor(SECONDARY_MUTED)
          .text(`${reportType}  •  TIN ${client.tin}  •  Generated ${new Date().toLocaleDateString()}`, 60, FOOTER_TOP + 26, { width: 492, lineBreak: false });

        doc
          .fontSize(7.5)
          .fillColor(SECONDARY_MUTED)
          .text("DigiBok Bookkeeping Services — Sipocot, Camarines Sur, Philippines — Licensed Bookkeeping & BIR Non-VAT Compliance Management", 60, FOOTER_TOP + 42, { lineBreak: false })
          .text("This report represents true general ledger entries based on current client accounting record books.", 60, FOOTER_TOP + 53, { lineBreak: false });
      };
      doc.on("pageAdded", drawFooter);

      // --- PDF HEADER DESIGN ---
      // The client's own business name is the headline an auditor or tax agency actually
      // cares about identifying — DigiBok's own branding is kept out of the way, in the
      // footer, rather than competing for top billing on every page.
      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .fillColor(PRIMARY)
        .text(client.business_name, { align: "center" });

      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(SECONDARY_MUTED)
        .text(`TIN ${client.tin}  •  ${client.type}`, { align: "center" })
        .moveDown(1.5);

      // Accent border divider
      doc
        .strokeColor(ACCENT_AMBER)
        .lineWidth(3)
        .moveTo(50, 110)
        .lineTo(562, 110)
        .stroke()
        .moveDown(1.5);

      // Document Meta Card
      doc
        .rect(50, 125, 512, 85)
        .fill(SURFACE_BG);

      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor(PRIMARY)
        .text("REPORT INFORMATION", 65, 135)
        .fontSize(10)
        .font("Helvetica")
        .text(`Type: ${reportType}`, 65, 155)
        .text(`Period Covered: ${period}`, 65, 170)
        .text(`System Generated: ${new Date().toLocaleDateString()}`, 65, 185);

      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("CLIENT BUSINESS PROFILE", 320, 135)
        .fontSize(10)
        .font("Helvetica")
        .text(`Business: ${client.business_name}`, 320, 155)
        .text(`Owner / Rep: ${ownerName}`, 320, 170)
        .text(`TIN: ${client.tin} (${client.type})`, 320, 185);

      // The "pageAdded" hook above only fires for pages 2+; draw it on this first page by hand.
      drawFooter();

      // Move cursor below the metadata card
      doc.y = 230;

      // --- FINANCIAL CALCULATION BLOCK BASED ON REPORT TYPE ---
      if (reportType.includes("Income Statement") && incomeStmt) {
        const stmt = incomeStmt;
        const revenues = stmt.revenues.map((l) => ({ account_name: l.account_name, balance: l.amount }));
        const expenses = stmt.expenses.map((l) => ({ account_name: l.account_name, balance: l.amount }));

        const totalRevenues = stmt.totalRevenues;
        const totalExpenses = stmt.totalExpenses;
        const netIncome = stmt.netIncome;

        doc
          .fontSize(14)
          .font("Helvetica-Bold")
          .fillColor(PRIMARY)
          .text("STATEMENT OF FINANCIAL PERFORMANCE", 50, doc.y)
          .moveDown(1);

        // Render Table Headers
        let curY = doc.y;
        doc.rect(50, curY, 512, 22).fill(PRIMARY);
        doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10);
        doc.text("Account Classification / Name", 60, curY + 6);
        doc.text("Account Type", 320, curY + 6);
        doc.text("Ending Balance (PHP)", 440, curY + 6, { width: 110, align: "right" });

        curY += 25;
        doc.fillColor(PRIMARY).font("Helvetica").fontSize(10);

        // Revenue Rows
        doc.font("Helvetica-Bold").text("REVENUES", 60, curY).font("Helvetica");
        curY += 18;

        revenues.forEach((r) => {
          doc.text(r.account_name, 70, curY);
          doc.text("Revenue", 320, curY);
          doc.text(`PHP ${r.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 440, curY, { width: 110, align: "right" });
          curY += 16;
        });

        // Revenue Total
        doc.lineCap("butt").moveTo(320, curY).lineTo(550, curY).strokeColor(SECONDARY_MUTED).lineWidth(0.5).stroke();
        curY += 4;
        doc.font("Helvetica-Bold").text("Total Revenues", 70, curY);
        doc.text(`PHP ${totalRevenues.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 440, curY, { width: 110, align: "right" });
        curY += 24;

        // Expenses
        doc.font("Helvetica-Bold").fillColor(PRIMARY).text("EXPENSES", 60, curY).font("Helvetica");
        curY += 18;

        expenses.forEach((e) => {
          doc.text(e.account_name, 70, curY);
          doc.text("Expense", 320, curY);
          doc.text(`PHP ${e.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 440, curY, { width: 110, align: "right" });
          curY += 16;
        });

        // Expenses Total
        doc.lineCap("butt").moveTo(320, curY).lineTo(550, curY).strokeColor(SECONDARY_MUTED).lineWidth(0.5).stroke();
        curY += 4;
        doc.font("Helvetica-Bold").text("Total Expenses", 70, curY);
        doc.text(`PHP ${totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 440, curY, { width: 110, align: "right" });
        curY += 30;

        // Net income
        doc.rect(50, curY, 512, 30).fill(SURFACE_BG);
        doc.fillColor(PRIMARY).font("Helvetica-Bold").fontSize(11);
        doc.text("NET INCOME / (LOSS)", 60, curY + 9);
        const formulaColor = netIncome >= 0 ? ACCENT_TEAL : "#EF4444";
        doc.fillColor(formulaColor).text(`PHP ${netIncome.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 440, curY + 9, { width: 110, align: "right" });

      } else if (reportType.includes("Balance Sheet") && balanceSheet) {
        const bs = balanceSheet;
        const assets = bs.assets.map((l) => ({ account_name: l.account_name, balance: l.balance }));
        const liabilities = bs.liabilities.map((l) => ({ account_name: l.account_name, balance: l.balance }));
        const equity = bs.equity.map((l) => ({ account_name: l.account_name, balance: l.balance }));

        const totalAssets = bs.totalAssets;
        const totalLiabilities = bs.totalLiabilities;
        const totalEquity = bs.totalEquity;

        doc
          .fontSize(14)
          .font("Helvetica-Bold")
          .fillColor(PRIMARY)
          .text("STATEMENT OF FINANCIAL POSITION", 50, doc.y)
          .moveDown(1);

        let curY = doc.y;
        doc.rect(50, curY, 512, 22).fill(PRIMARY);
        doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10);
        doc.text("Account Name", 60, curY + 6);
        doc.text("Account Type", 320, curY + 6);
        doc.text("Standing Balance (PHP)", 440, curY + 6, { width: 110, align: "right" });

        curY += 25;
        doc.fillColor(PRIMARY).font("Helvetica").fontSize(10);

        // Assets
        doc.font("Helvetica-Bold").text("ASSETS", 60, curY).font("Helvetica");
        curY += 18;
        assets.forEach((a) => {
          doc.text(a.account_name, 70, curY);
          doc.text("Asset", 320, curY);
          doc.text(`PHP ${a.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 440, curY, { width: 110, align: "right" });
          curY += 16;
        });
        doc.font("Helvetica-Bold").text("Total Assets", 70, curY);
        doc.text(`PHP ${totalAssets.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 440, curY, { width: 110, align: "right" });
        curY += 26;

        // Liabilities
        doc.font("Helvetica-Bold").text("LIABILITIES", 60, curY).font("Helvetica");
        curY += 18;
        liabilities.forEach((l) => {
          doc.text(l.account_name, 70, curY);
          doc.text("Liability", 320, curY);
          doc.text(`PHP ${l.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 440, curY, { width: 110, align: "right" });
          curY += 16;
        });
        doc.font("Helvetica-Bold").text("Total Liabilities", 70, curY);
        doc.text(`PHP ${totalLiabilities.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 440, curY, { width: 110, align: "right" });
        curY += 26;

        // Equity
        doc.font("Helvetica-Bold").text("EQUITY", 60, curY).font("Helvetica");
        curY += 18;
        equity.forEach((eq) => {
          doc.text(eq.account_name, 70, curY);
          doc.text("Equity", 320, curY);
          doc.text(`PHP ${eq.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 440, curY, { width: 110, align: "right" });
          curY += 16;
        });
        doc.text("Retained Earnings (Accumulated Net Income)", 70, curY);
        doc.text("Equity", 320, curY);
        doc.text(`PHP ${bs.retainedEarnings.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 440, curY, { width: 110, align: "right" });
        curY += 16;
        doc.font("Helvetica-Bold").text("Total Equity", 70, curY);
        doc.text(`PHP ${totalEquity.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 440, curY, { width: 110, align: "right" });
        curY += 30;

        // Check Identity (Assets = Liabilities + Equity)
        doc.rect(50, curY, 512, 30).fill(SURFACE_BG);
        doc.fillColor(PRIMARY).font("Helvetica-Bold").fontSize(11);
        doc.text("TOTAL LIABILITIES & EQUITY", 60, curY + 9);
        doc.text(`PHP ${(totalLiabilities + totalEquity).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 440, curY + 9, { width: 110, align: "right" });

      } else if (reportType.includes("Trial Balance") && trialBalance) {
        const tb = trialBalance;

        doc
          .fontSize(14)
          .font("Helvetica-Bold")
          .fillColor(PRIMARY)
          .text("TRIAL BALANCE", 50, doc.y)
          .moveDown(1);

        let curY = doc.y;
        doc.rect(50, curY, 512, 22).fill(PRIMARY);
        doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10);
        doc.text("Account Name", 60, curY + 6);
        doc.text("Account Type", 280, curY + 6);
        doc.text("Debit (PHP)", 400, curY + 6, { width: 75, align: "right" });
        doc.text("Credit (PHP)", 480, curY + 6, { width: 75, align: "right" });

        curY += 25;
        doc.fillColor(PRIMARY).font("Helvetica").fontSize(9);

        tb.rows.forEach((row) => {
          doc.text(row.account_name, 60, curY, { width: 210 });
          doc.text(row.account_type, 280, curY);
          doc.text(row.debit > 0 ? `PHP ${row.debit.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—", 400, curY, { width: 75, align: "right" });
          doc.text(row.credit > 0 ? `PHP ${row.credit.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—", 480, curY, { width: 75, align: "right" });
          curY += 16;

          if (curY > 650) {
            doc.addPage();
            curY = 50;
          }
        });

        curY += 8;
        doc.lineCap("butt").moveTo(400, curY).lineTo(555, curY).strokeColor(SECONDARY_MUTED).lineWidth(0.5).stroke();
        curY += 4;
        doc.font("Helvetica-Bold").text("Totals", 60, curY);
        doc.text(`PHP ${tb.totalDebits.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 400, curY, { width: 75, align: "right" });
        doc.text(`PHP ${tb.totalCredits.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 480, curY, { width: 75, align: "right" });

        // Audit-standard double rule under the final totals, marking them as closed figures.
        curY += 14;
        doc.lineCap("butt").moveTo(400, curY).lineTo(555, curY).strokeColor(PRIMARY).lineWidth(0.75).stroke();
        curY += 2.5;
        doc.lineCap("butt").moveTo(400, curY).lineTo(555, curY).strokeColor(PRIMARY).lineWidth(0.75).stroke();
        curY += 16;

        doc.rect(50, curY, 512, 30).fill(SURFACE_BG);
        doc.font("Helvetica-Bold").fontSize(11);
        doc.fillColor(tb.isBalanced ? ACCENT_TEAL : "#EF4444");
        doc.text(tb.isBalanced ? "BALANCED — Total Debits equal Total Credits" : "OUT OF BALANCE — Debits and Credits do not match", 60, curY + 9, {
          width: 490,
        });

      } else if (reportType.includes("Payment Summary")) {
        const collected = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
        const pendingAmt = payments.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0);
        const rejectedCount = payments.filter((p) => p.status === "rejected").length;

        doc
          .fontSize(14)
          .font("Helvetica-Bold")
          .fillColor(PRIMARY)
          .text("PAYMENT SUMMARY REPORT", 50, doc.y)
          .moveDown(1);

        let curY = doc.y;
        doc.rect(50, curY, 512, 42).fill(SURFACE_BG);
        doc.fillColor(PRIMARY).font("Helvetica-Bold").fontSize(10);
        doc.text(`Total Collected: PHP ${collected.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 65, curY + 9);
        doc.text(`Pending Review: PHP ${pendingAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 65, curY + 25);
        doc.text(`Rejected Submissions: ${rejectedCount}`, 320, curY + 9);
        doc.text(`Total Records: ${payments.length}`, 320, curY + 25);
        curY += 58;

        doc.rect(50, curY, 512, 22).fill(PRIMARY);
        doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10);
        doc.text("Date", 60, curY + 6);
        doc.text("Method", 110, curY + 6);
        doc.text("Obligation / Reference", 180, curY + 6);
        doc.text("Status", 400, curY + 6);
        doc.text("Amount (PHP)", 460, curY + 6, { width: 95, align: "right" });

        curY += 25;
        doc.fillColor(PRIMARY).font("Helvetica").fontSize(9);

        const PAYMENT_METHOD_LABELS: Record<string, string> = {
          cash: "Cash",
          gcash: "GCash",
          bank_transfer: "Bank Transfer",
          check: "Check",
          other: "Other",
        };

        if (payments.length === 0) {
          doc.text("No payment records submitted for this client yet.", 60, curY + 10, { align: "center" });
        } else {
          payments.forEach((p) => {
            doc.text(p.payment_date, 60, curY);
            doc.text(PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method, 110, curY, { width: 65 });
            doc.text(`${p.obligation_label} (Ref# ${p.reference_number})`, 180, curY, { width: 210 });
            doc.text(p.status.toUpperCase(), 400, curY);
            doc.text(`PHP ${p.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, 460, curY, { width: 95, align: "right" });
            curY += 18;

            if (curY > 650) {
              doc.addPage();
              curY = 50;
            }
          });
        }
      } else {
        // Fallback detail list / Quarterly compliance
        doc
          .fontSize(14)
          .font("Helvetica-Bold")
          .fillColor(PRIMARY)
          .text("GENERAL BUSINESS JOURNAL STATUS", 50, doc.y)
          .moveDown(1);

        let curY = doc.y;
        doc.rect(50, curY, 512, 22).fill(PRIMARY);
        doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10);
        doc.text("Date", 60, curY + 6);
        doc.text("Reference / Description", 150, curY + 6);
        doc.text("Dr Amount (PHP)", 380, curY + 6, { width: 85, align: "right" });
        doc.text("Cr Amount (PHP)", 470, curY + 6, { width: 85, align: "right" });

        curY += 25;
        doc.fillColor(PRIMARY).font("Helvetica").fontSize(9);

        if (ledger.length === 0) {
          doc.text("No general ledger activity registered in this period.", 60, curY + 10, { align: "center" });
        } else {
          ledger.forEach((l: GeneralLedgerEntry) => {
            doc.text(l.entry_date, 60, curY);
            doc.text(l.description.length > 38 ? `${l.description.substring(0, 35)}...` : l.description, 150, curY);
            doc.text(l.debit > 0 ? `PHP ${l.debit.toLocaleString()}` : "—", 380, curY, { width: 85, align: "right" });
            doc.text(l.credit > 0 ? `PHP ${l.credit.toLocaleString()}` : "—", 470, curY, { width: 85, align: "right" });
            curY += 18;

            if (curY > 650) {
              doc.addPage();
              curY = 50;
            }
          });
        }
      }

      // Footer is now drawn per-page via drawFooter() (see the "pageAdded" hook and
      // the manual first-page call above) — reliably on every page instead of once at
      // a fixed position that only ever landed on whichever page was current last.

      doc.end();

      stream.on("finish", () => {
        const stats = fs.statSync(filePath);
        const kbSize = (stats.size / 1024).toFixed(1) + " KB";
        resolve({
          filePath,
          fileName,
          fileSize: kbSize,
        });
      });

      stream.on("error", (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}
