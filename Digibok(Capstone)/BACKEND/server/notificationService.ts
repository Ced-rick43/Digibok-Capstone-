import cron from "node-cron";
import nodemailer from "nodemailer";
import { dbInstance, TaxRecord, PermitRecord } from "./db";

// Simulated Email Transporter
// If credentials exist in .env, we can use them, otherwise use log simulation
const getTransporter = () => {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return null;
};

// Check and generate alerts for upcoming obligations
export async function scanComplianceDeadlines() {
  console.log("[Compliance Scan] Starting daily deadline scan...");
  const taxRecords = await dbInstance.getTaxRecords();
  const permitRecords = await dbInstance.getPermitRecords();
  const clients = await dbInstance.getClientProfiles();
  const users = await dbInstance.getUsers();
  const bookkeepers = users.filter((u) => u.role === "bookkeeper");

  const today = new Date();
  let notificationCount = 0;

  // Process Tax Obligations. A for-of loop (not .forEach) is required here — .forEach
  // silently doesn't await its callback, so with dbInstance's methods now async against
  // Postgres, a forEach-based version would log "scan completed" before the writes below
  // actually land, and any error inside would become an unhandled rejection instead of
  // surfacing anywhere.
  for (const tax of taxRecords) {
    if (tax.status === "filed") continue;

    const dueDate = new Date(tax.due_date);
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const client = clients.find((c) => c.client_id === tax.client_id);
    if (!client) continue;

    let alertMsg = "";
    let isUrgent = false;

    if (diffDays < 0) {
      alertMsg = `OVERDUE Deadlines: ${client.business_name}'s "${tax.tax_type}" was due on ${tax.due_date} (${Math.abs(diffDays)} days overdue).`;
      await dbInstance.updateTaxObligation(tax.tax_id, { status: "overdue" });
      isUrgent = true;
    } else if (diffDays <= 7) {
      alertMsg = `URGENT Notification: ${client.business_name}'s "${tax.tax_type}" is due in ${diffDays} days (${tax.due_date}).`;
      await dbInstance.updateTaxObligation(tax.tax_id, { status: "urgent" });
      isUrgent = true;
    } else if (diffDays <= 30) {
      alertMsg = `Upcoming Deadline: ${client.business_name}'s "${tax.tax_type}" is due on ${tax.due_date}.`;
      await dbInstance.updateTaxObligation(tax.tax_id, { status: "upcoming" });
    }

    if (alertMsg) {
      // Notify every bookkeeper account (matches the dynamic lookup used everywhere
      // else in the app — never assume a fixed user_id).
      for (const bk of bookkeepers) {
        await dbInstance.addNotification(bk.user_id, alertMsg, isUrgent ? "alert" : "reminder", "compliance");
      }
      // Add notification for client owner
      await dbInstance.addNotification(client.user_id, alertMsg, isUrgent ? "alert" : "reminder", "compliance");
      notificationCount++;

      // Attempt to send simulated Email — the in-app notification above always fires;
      // only the email itself is gated by the client's own preference (My Profile page).
      const clientUser = users.find((u) => u.user_id === client.user_id);
      if (clientUser && client.email_reminders_enabled !== false) {
        await sendReminderEmail(clientUser.email, {
          title: tax.tax_type,
          business: client.business_name,
          dueDate: tax.due_date,
          status: tax.status,
          amount: tax.amount,
        });
      }
    }
  }

  // Process Permit Obligations
  for (const permit of permitRecords) {
    if (permit.status === "renewed") continue;

    const expiryDate = new Date(permit.expiry_date);
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const client = clients.find((c) => c.client_id === permit.client_id);
    if (!client) continue;

    let alertMsg = "";
    let isUrgent = false;

    if (diffDays < 0) {
      alertMsg = `OVERDUE Permit: ${client.business_name}'s "${permit.permit_type}" expired on ${permit.expiry_date} (${Math.abs(diffDays)} days ago).`;
      await dbInstance.updatePermitObligation(permit.permit_id, { status: "overdue" });
      isUrgent = true;
    } else if (diffDays <= 7) {
      alertMsg = `URGENT Permit Expiry: ${client.business_name}'s "${permit.permit_type}" expires in ${diffDays} days (${permit.expiry_date}).`;
      await dbInstance.updatePermitObligation(permit.permit_id, { status: "urgent" });
      isUrgent = true;
    } else if (diffDays <= 30) {
      alertMsg = `Upcoming Permit Expiry: ${client.business_name}'s "${permit.permit_type}" expires on ${permit.expiry_date}.`;
      await dbInstance.updatePermitObligation(permit.permit_id, { status: "upcoming" });
    }

    if (alertMsg) {
      for (const bk of bookkeepers) {
        await dbInstance.addNotification(bk.user_id, alertMsg, isUrgent ? "alert" : "reminder", "compliance");
      }
      await dbInstance.addNotification(client.user_id, alertMsg, isUrgent ? "alert" : "reminder", "compliance");
      notificationCount++;

      const clientUser = users.find((u) => u.user_id === client.user_id);
      if (clientUser && client.email_reminders_enabled !== false) {
        await sendReminderEmail(clientUser.email, {
          title: permit.permit_type,
          business: client.business_name,
          dueDate: permit.expiry_date,
          status: permit.status,
          amount: permit.fee,
        });
      }
    }
  }

  console.log(`[Compliance Scan] Scan completed. Generated ${notificationCount} new system notification logs.`);
  return { updated: true, count: notificationCount };
}

// Scheduled to run Daily at 08:00 AM as per spec
cron.schedule("0 8 * * *", async () => {
  try {
    await scanComplianceDeadlines();
  } catch (error) {
    console.error("[Scheduler Error] Failed compiling compliance checks:", error);
  }
});

// Helper to Transmit Emails
async function sendReminderEmail(toEmail: string, details: { title: string; business: string; dueDate: string; status: string; amount: number }) {
  const content = `
    Dear Client,

    This is an automatic notification regarding DigiBok Bookkeeping compliance monitors.

    Obligation: ${details.title}
    Client Business: ${details.business}
    Deadlines / Due Date: ${details.dueDate}
    Amount Ref: PHP ${details.amount.toLocaleString()}
    Current Compliance Status: ${details.status.toUpperCase()}

    Please register with our CPA bookkeeping offices as soon as possible to post proper credit journals.

    Best Regards,
    Maria Santos, CPA
    Municipal Bookkeeping Sipocot
  `;

  const transporter = getTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: '"DigiBok Sipocot" <noreply@digibok-sipocot.gov>',
        to: toEmail,
        subject: `Compliance Notification: ${details.title} [${details.business}]`,
        text: content,
      });
      console.log(`[Email Success] Notification successfully transmitted to client: ${toEmail}`);
    } catch (e) {
      console.error(`[Email Fail] Transporter issue writing to client ${toEmail}. Output simulated below.`, e);
    }
  } else {
    // Elegant Simulation Log as per system specifications
    console.log("------------------------------------------------------------------------");
    console.log(`[SMTP SIMULATED TRANSMISSION] To: ${toEmail}`);
    console.log(`Subject: Compliance Reminder: ${details.title}`);
    console.log(content);
    console.log("------------------------------------------------------------------------");
  }
}

// Generic transmit helper shared by the invite and password-reset emails below.
async function sendPlainEmail(toEmail: string, subject: string, content: string) {
  const transporter = getTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: '"DigiBok Sipocot" <noreply@digibok-sipocot.gov>',
        to: toEmail,
        subject,
        text: content,
      });
      console.log(`[Email Success] "${subject}" transmitted to: ${toEmail}`);
    } catch (e) {
      console.error(`[Email Fail] Transporter issue writing to ${toEmail}. Output simulated below.`, e);
      console.log("------------------------------------------------------------------------");
      console.log(`[SMTP SIMULATED TRANSMISSION] To: ${toEmail}`);
      console.log(`Subject: ${subject}`);
      console.log(content);
      console.log("------------------------------------------------------------------------");
    }
  } else {
    console.log("------------------------------------------------------------------------");
    console.log(`[SMTP SIMULATED TRANSMISSION] To: ${toEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(content);
    console.log("------------------------------------------------------------------------");
  }
}

export async function sendActivationInviteEmail(toEmail: string, details: { businessName: string; ownerName: string }) {
  const appUrl = process.env.APP_URL || "the DigiBok app";
  const content = `
    Dear ${details.ownerName},

    Your bookkeeper has set up "${details.businessName}" in DigiBok — our online bookkeeping and
    BIR compliance system for Sipocot, Camarines Sur.

    To sign in for the first time, you'll need to activate your account and choose your own password:

    1. Open ${appUrl}
    2. On the sign-in screen, click "Activate Your Account"
    3. Enter this registered email address (${toEmail}) and set your new password

    If you weren't expecting this, please contact your bookkeeper.

    Best Regards,
    Maria Santos, CPA
    Municipal Bookkeeping Sipocot
  `;
  await sendPlainEmail(toEmail, `Activate Your DigiBok Account — ${details.businessName}`, content);
}

export async function sendPasswordResetEmail(toEmail: string, resetCode: string) {
  const appUrl = process.env.APP_URL || "the DigiBok app";
  const content = `
    Hello,

    We received a request to reset the password for your DigiBok account (${toEmail}).

    To reset your password:
    1. Open ${appUrl}
    2. On the sign-in screen, click "Forgot password?"
    3. Enter this reset code: ${resetCode}
    4. Choose your new password

    This code expires in 30 minutes. If you did not request a password reset, you can safely ignore this email —
    your password will not be changed.

    Best Regards,
    DigiBok Sipocot
  `;
  await sendPlainEmail(toEmail, "DigiBok Password Reset Code", content);
}

export async function sendVerificationEmail(toEmail: string, token: string, details: { businessName: string; ownerName: string }) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const verifyLink = `${appUrl}?verify=${token}`;
  const content = `
    Dear ${details.ownerName},

    Thanks for registering "${details.businessName}" with DigiBok — our online bookkeeping and
    BIR compliance system for Sipocot, Camarines Sur.

    Before you can sign in, please confirm this is really your email address by opening the
    link below:

    ${verifyLink}

    This link expires in 24 hours. Once verified, you can sign in — your bookkeeper will
    also need to review and approve your business details before your account is fully
    active, and you'll see your approval status right after signing in.

    If you didn't register for DigiBok, you can safely ignore this email.

    Best Regards,
    Maria Santos, CPA
    Municipal Bookkeeping Sipocot
  `;
  await sendPlainEmail(toEmail, `Verify Your DigiBok Account — ${details.businessName}`, content);
}

// Shares an already-generated report PDF with an accountant (or anyone) for audit
// checking, straight from the Reports UI — attaches the real file, doesn't just link to it.
export async function sendReportEmail(toEmail: string, details: { businessName: string; reportType: string; period: string }, attachmentPath: string, attachmentName: string) {
  const content = `
    Hello,

    Please find attached a ${details.reportType} report for "${details.businessName}" (${details.period}),
    shared from DigiBok Bookkeeping for your review.

    Best Regards,
    Maria Santos, CPA
    Municipal Bookkeeping Sipocot
  `;

  const transporter = getTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: '"DigiBok Sipocot" <noreply@digibok-sipocot.gov>',
        to: toEmail,
        subject: `${details.reportType} — ${details.businessName} (${details.period})`,
        text: content,
        attachments: [{ filename: attachmentName, path: attachmentPath }],
      });
      console.log(`[Email Success] Report "${attachmentName}" transmitted to: ${toEmail}`);
    } catch (e) {
      console.error(`[Email Fail] Transporter issue sending report to ${toEmail}.`, e);
      throw e;
    }
  } else {
    console.log("------------------------------------------------------------------------");
    console.log(`[SMTP SIMULATED TRANSMISSION] To: ${toEmail}`);
    console.log(`Subject: ${details.reportType} — ${details.businessName} (${details.period})`);
    console.log(`Attachment: ${attachmentName}`);
    console.log(content);
    console.log("------------------------------------------------------------------------");
  }
}

export async function sendSupportContactEmail(bookkeeperEmail: string, details: { name: string; email: string; topic: string; message: string }) {
  const content = `
    New message from the public Support page:

    Name: ${details.name}
    Email: ${details.email}
    Topic: ${details.topic}

    Message:
    ${details.message}
  `;
  await sendPlainEmail(bookkeeperEmail, `Support Inquiry: ${details.topic} — from ${details.name}`, content);
}
