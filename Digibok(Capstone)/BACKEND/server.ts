import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import QRCode from "qrcode";
import { createServer as createViteServer } from "vite";
import { dbInstance, User, ClientProfile, Account } from "./server/db";
import { ensureSchema } from "./server/bootstrapSchema";
import { generateReportPDF } from "./server/reportService";
import { getTrialBalance, getIncomeStatement, getBalanceSheet } from "./server/financialStatements";
import { scanComplianceDeadlines, sendActivationInviteEmail, sendPasswordResetEmail, sendSupportContactEmail, sendVerificationEmail, sendReportEmail } from "./server/notificationService";
import { buildImportTemplate, parseAndValidateImport } from "./server/journalImportService";
import { getNonVatSchedule } from "../FRONTEND/src/lib/birCompliance";
import {
  generateTotpSecret,
  buildOtpauthUri,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCodes,
  isBackupCodeFormat,
  matchBackupCode,
} from "./server/totp";

const app = express();
// Hosted platforms (Railway, Render, Fly) assign the port at runtime and route traffic to
// whatever they set here; 3000 is only the local-development fallback.
const PORT = Number(process.env.PORT) || 3000;

// Express 4 does not catch rejections thrown out of async route handlers: an awaited
// query that fails becomes an unhandled rejection, which Node 15+ turns into a process
// exit. A single refused Postgres connection would take the entire server down mid
// request — every other logged-in user included. Wrap async handlers so their
// rejections reach the global error handler at the bottom of this file instead.
for (const method of ["get", "post", "put", "patch", "delete"] as const) {
  const register = (app as any)[method].bind(app);
  (app as any)[method] = (routePath: any, ...handlers: any[]) =>
    register(
      routePath,
      // Arity 4 marks an error-handling middleware, which must stay unwrapped.
      ...handlers.map((handler: any) =>
        typeof handler === "function" && handler.length < 4
          ? (req: any, res: any, next: any) =>
              Promise.resolve(handler(req, res, next)).catch(next)
          : handler
      )
    );
}

// No hardcoded fallback: an unset JWT_SECRET generates a random one at startup
// instead of signing tokens with a guessable literal committed to source. This
// means existing sessions are invalidated on every restart when JWT_SECRET isn't
// configured — acceptable for dev/demo, but set the env var for a stable deploy.
if (!process.env.JWT_SECRET) {
  console.warn("[DigiBok Security] JWT_SECRET is not set — generating a random secret for this run. Sessions will not persist across restarts. Set JWT_SECRET in your environment for a stable deployment.");
}
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString("hex");

// Separate signing secret for the short-lived "password verified, awaiting 2FA code"
// challenge issued mid-login. Deriving it from JWT_SECRET (rather than reusing it
// outright) means a challenge token fails authenticateToken's jwt.verify(JWT_SECRET)
// check — so it can never be used as a bearer token on any real API route, even
// during the few minutes before the user completes the second factor.
const TOTP_CHALLENGE_SECRET = crypto.createHash("sha256").update(`${JWT_SECRET}:totp-challenge`).digest("hex");

app.use(express.json());

// --- FILE UPLOAD STORAGE (Client Documents: 1701Q, 2550M, certificates, etc.) ---
const DOCUMENTS_DIR = path.join(process.cwd(), "uploads", "documents");
if (!fs.existsSync(DOCUMENTS_DIR)) {
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
}
const ALLOWED_DOCUMENT_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, DOCUMENTS_DIR),
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB cap
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ALLOWED_DOCUMENT_TYPES[file.mimetype];
    if (!allowedExts || !allowedExts.includes(ext)) {
      return cb(Object.assign(new Error("Unsupported file type. Allowed: PDF, JPG, PNG, DOC(X), XLS(X)."), { status: 400 }));
    }
    cb(null, true);
  },
});

// --- FILE UPLOAD (Journal batch-import spreadsheets) — held in memory only, never
// written to disk: the file is parsed once for the dry-run preview and once again (from
// the same re-uploaded bytes) at confirm time, then discarded either way. ---
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cap
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (![".xlsx", ".xls"].includes(ext)) {
      return cb(Object.assign(new Error("Unsupported file type. Please upload an .xlsx or .xls file."), { status: 400 }));
    }
    cb(null, true);
  },
});

// --- FILE UPLOAD STORAGE (Payment receipts: GCash/bank screenshots, scanned ORs, etc.) ---
const RECEIPTS_DIR = path.join(process.cwd(), "uploads", "receipts");
if (!fs.existsSync(RECEIPTS_DIR)) {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}
const ALLOWED_RECEIPT_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

const receiptUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, RECEIPTS_DIR),
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB cap
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ALLOWED_RECEIPT_TYPES[file.mimetype];
    if (!allowedExts || !allowedExts.includes(ext)) {
      return cb(Object.assign(new Error("Unsupported file type. Allowed: PDF, JPG, PNG."), { status: 400 }));
    }
    cb(null, true);
  },
});

// --- AUTHENTICATION MIDDLEWARE ---
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Authentication token is missing" });
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
    req.user = decoded;
    next();
  });
}

function requireRole(role: "bookkeeper" | "client") {
  return (req: any, res: any, next: any) => {
    if (req.user && req.user.role === role) {
      next();
    } else {
      res.status(403).json({ message: `Access denied. Requires ${role} role permissions.` });
    }
  };
}

// --- BRUTE-FORCE PROTECTION ---
// Without throttling, a script could hammer a password guess in a tight loop. This is a
// simple in-memory sliding-window lockout (resets on server restart) — appropriate for
// this single-process app; a multi-instance deployment would need a shared store
// (e.g. Redis) instead.
interface AttemptTracker {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // failures older than this don't count toward the limit
const LOCKOUT_MS = 15 * 60 * 1000;

const loginAttempts = new Map<string, AttemptTracker>();

// Separate lockout store for 2FA code attempts — a 6-digit TOTP code only has
// 1,000,000 possibilities, so this needs the same throttling as password login
// (keyed by user_id, since by this point the password has already been verified).
const totpAttempts = new Map<string, AttemptTracker>();

// Lockout store for the public (unauthenticated) support contact form, keyed by IP —
// keeps a scripted spammer from hammering the bookkeeper's inbox.
const contactAttempts = new Map<string, AttemptTracker>();

// Returns remaining lockout seconds if still locked, otherwise null (and clears an
// expired lock so the map doesn't grow unbounded with stale entries).
function checkLockout(store: Map<string, AttemptTracker>, key: string): number | null {
  const entry = store.get(key);
  if (!entry?.lockedUntil) return null;
  const remainingMs = entry.lockedUntil - Date.now();
  if (remainingMs <= 0) {
    store.delete(key);
    return null;
  }
  return Math.ceil(remainingMs / 1000);
}

// Records one failed attempt; returns true exactly once, on the attempt that trips the
// lockout, so the caller can log/notify without doing it on every subsequent try.
function recordFailedAttempt(store: Map<string, AttemptTracker>, key: string): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.firstAttemptAt > ATTEMPT_WINDOW_MS) {
    store.set(key, { count: 1, firstAttemptAt: now });
    return false;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS && !entry.lockedUntil) {
    entry.lockedUntil = now + LOCKOUT_MS;
    return true;
  }
  return false;
}

function clearAttempts(store: Map<string, AttemptTracker>, key: string) {
  store.delete(key);
}

function lockoutResponse(res: any, remainingSeconds: number) {
  const minutes = Math.ceil(remainingSeconds / 60);
  return res.status(429).json({ message: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` });
}

// Seeds default compliance rules so a client's dashboard is instantly rich. This study
// (and the system) covers Non-VAT taxpayers only — see the manuscript's delimitations —
// so every client gets the full real Non-VAT BIR calendar (2551Q x4, 1701Q x3, annual
// 1701) with actual next-due dates. Shared by both the bookkeeper-driven "Add Client"
// flow and the client self-registration (invite code) flow.
async function seedDefaultComplianceForClient(clientId: number): Promise<void> {
  for (const item of getNonVatSchedule()) {
    await dbInstance.addTaxObligation({
      client_id: clientId,
      tax_type: `${item.label} (${item.form})`,
      due_date: item.dueDate,
      amount: 0,
      status: "upcoming",
    });
  }
}

// Seeds a minimal starter Chart of Accounts so a client is immediately postable —
// without this, the very first journal entry (SO3) hits an empty account dropdown
// and the bookkeeper has to build the chart from nothing before they can record
// anything. One account per type (the accounting-equation minimum), all opening at
// ₱0; the bookkeeper adds more specific accounts (e.g. "Rent Expense") from Manage
// Accounts as the business actually needs them. Shared by both onboarding paths, same
// as seedDefaultComplianceForClient above.
async function seedDefaultAccountsForClient(clientId: number): Promise<void> {
  const starterAccounts: { account_code: string; account_name: string; account_type: Account["account_type"] }[] = [
    { account_code: "1010", account_name: "Cash on Hand", account_type: "asset" },
    { account_code: "1015", account_name: "Cash in Bank", account_type: "asset" },
    { account_code: "1020", account_name: "Accounts Receivable", account_type: "asset" },
    { account_code: "2010", account_name: "Accounts Payable", account_type: "liability" },
    { account_code: "3010", account_name: "Owner's Capital", account_type: "equity" },
    { account_code: "4010", account_name: "Sales Revenue", account_type: "revenue" },
    { account_code: "5010", account_name: "Operating Expenses", account_type: "expense" },
  ];
  for (const acct of starterAccounts) {
    await dbInstance.addAccount({ client_id: clientId, ...acct, balance: 0 });
  }
}

const isDebitIncreaseType = (accountType: Account["account_type"]) => accountType === "asset" || accountType === "expense";

// An account's opening balance used to be written straight into accounts.balance with
// no counterpart anywhere — meaning a bookkeeper could set "Cash on Hand" to ₱40,000
// and nothing else, and the books would silently stop balancing (Assets ≠ Liabilities +
// Equity) with no error, only a passive warning banner elsewhere in the UI. This posts
// the opening balance (or, on later edit before any real activity, an adjustment to it)
// as a real, balanced journal entry instead: `delta` moves the account's own normal
// side, offset against a per-client "Opening Balance Equity" account (created on first
// use) — the standard way accounting software (QuickBooks, Xero, etc.) absorbs a
// starting balance without the bookkeeper having to hand-balance every account they set
// up. `delta` is signed (positive increases the account's normal-side balance, negative
// decreases it) so the same function covers both a brand-new account (delta = the full
// requested balance, since it starts at ₱0) and editing one that's still activity-free
// (delta = requested − current). Once posted, has_activity makes the balance immutable
// going forward, same as any other posted transaction — corrections go through a normal
// adjusting entry from there, exactly like the rest of the system already requires.
async function postOpeningBalance(clientId: number, account: Account, delta: number): Promise<void> {
  if (delta === 0) return;
  const obeAccount = await dbInstance.getOrCreateAccount(clientId, "Opening Balance Equity", "equity");
  const today = new Date().toISOString().split("T")[0];
  const targetIsDebitNormal = isDebitIncreaseType(account.account_type);
  const amount = Math.abs(delta);
  // Positive delta increases the account on its normal side; negative decreases it.
  const targetDebit = targetIsDebitNormal ? (delta > 0 ? amount : 0) : (delta > 0 ? 0 : amount);
  const targetCredit = targetIsDebitNormal ? (delta > 0 ? 0 : amount) : (delta > 0 ? amount : 0);
  await dbInstance.addJournalEntry(clientId, today, `Opening balance — ${account.account_name}`, [
    { account_id: account.account_id, debit: targetDebit, credit: targetCredit },
    { account_id: obeAccount.account_id, debit: targetCredit, credit: targetDebit },
  ]);
}

// Generates a human-friendly invite code for client self-registration and inserts it,
// retrying on the rare case of a collision. The client_invites_code_upper_idx unique
// index (BACKEND/db/schema.sql) is what actually guarantees uniqueness — this loop just
// reacts to a Postgres unique-violation (23505) rather than pre-checking, since a
// check-then-insert can't be made race-free once the check and the insert are two
// separate async round trips.
async function createClientInviteWithUniqueCode(createdBy: number, label?: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid transcription errors
  const chunk = () => Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `DIGIBOK-${chunk()}-${chunk()}`;
    try {
      return await dbInstance.addClientInvite(createdBy, code, label);
    } catch (err: any) {
      if (err.code === "23505") continue; // code collision — try a new candidate
      throw err;
    }
  }
  throw new Error("Failed to generate a unique invite code after 5 attempts.");
}

// --- API ENDPOINTS ---

async function buildFullLoginResponse(user: User) {
  const token = jwt.sign(
    { user_id: user.user_id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  const profile =
    user.role === "bookkeeper"
      ? await dbInstance.getBookkeeperProfile(user.user_id)
      : await dbInstance.getClientProfileByUserId(user.user_id);

  return {
    token,
    user: {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
      profile,
    },
  };
}

// 1. Auth Login and Registration
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Please provide both email and password." });
  }

  // Keyed by the submitted email (not the resolved user) so this also throttles guessing
  // against emails that don't exist, and checked before any lookup/hashing work runs.
  const attemptKey = email.toLowerCase();
  const lockedForSeconds = checkLockout(loginAttempts, attemptKey);
  if (lockedForSeconds) {
    return lockoutResponse(res, lockedForSeconds);
  }

  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || user.status === "inactive") {
    recordFailedAttempt(loginAttempts, attemptKey);
    return res.status(401).json({ message: "Invalid email credentials or inactive account." });
  }
  if (user.pending_activation) {
    return res.status(403).json({ message: "This account hasn't been activated yet. Use 'Activate Your Account' to set your password first." });
  }
  if (user.email_verified === false) {
    return res.status(403).json({ message: "Please verify your email before signing in. Check your inbox for the verification link we sent when you registered." });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    const justLockedOut = recordFailedAttempt(loginAttempts, attemptKey);
    if (justLockedOut) {
      await dbInstance.logAudit(user.user_id, `Account temporarily locked after ${MAX_ATTEMPTS} failed login attempts`, "users", user.user_id);
    }
    return res.status(401).json({ message: "Invalid password credentials." });
  }

  clearAttempts(loginAttempts, attemptKey);

  // 2FA is a bookkeeper-only feature — clients never see this step. When enabled,
  // password verification alone isn't enough: issue a short-lived challenge token
  // instead of a real session, and require /api/auth/totp-verify to finish login.
  if (user.role === "bookkeeper" && user.totp_enabled) {
    const challengeToken = jwt.sign({ user_id: user.user_id, purpose: "totp_challenge" }, TOTP_CHALLENGE_SECRET, { expiresIn: "5m" });
    return res.json({ requiresTotp: true, challengeToken });
  }

  await dbInstance.logAudit(user.user_id, "User logged in", "users", user.user_id);
  res.json(await buildFullLoginResponse(user));
});

app.post("/api/auth/totp-verify", async (req, res) => {
  const { challengeToken, code } = req.body;
  if (!challengeToken || !code) {
    return res.status(400).json({ message: "Please enter the code from your authenticator app." });
  }

  let payload: any;
  try {
    payload = jwt.verify(challengeToken, TOTP_CHALLENGE_SECRET);
  } catch {
    return res.status(401).json({ message: "Your login session expired. Please sign in again." });
  }
  if (payload.purpose !== "totp_challenge" || !payload.user_id) {
    return res.status(401).json({ message: "Invalid verification session." });
  }

  // Keyed by user_id (not email) — by this point the password has already been
  // confirmed, so this only throttles guessing the 6-digit code itself.
  const attemptKey = `totp:${payload.user_id}`;
  const lockedForSeconds = checkLockout(totpAttempts, attemptKey);
  if (lockedForSeconds) {
    return lockoutResponse(res, lockedForSeconds);
  }

  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.user_id === payload.user_id);
  if (!user || user.role !== "bookkeeper" || !user.totp_enabled || !user.totp_secret) {
    return res.status(401).json({ message: "Invalid verification session." });
  }

  const trimmedCode = String(code).trim();
  let verifiedViaBackupCode = false;
  let newTimeStep: number | undefined;

  if (isBackupCodeFormat(trimmedCode)) {
    const idx = matchBackupCode(trimmedCode, user.totp_backup_codes || []);
    if (idx !== -1) {
      verifiedViaBackupCode = true;
      const remaining = [...(user.totp_backup_codes || [])];
      remaining.splice(idx, 1);
      await dbInstance.updateUser(user.user_id, { totp_backup_codes: remaining });
    }
  } else {
    const result = await verifyTotpCode(user.totp_secret, trimmedCode, user.totp_last_time_step);
    if (result.valid) {
      newTimeStep = result.timeStep;
    }
  }

  if (!verifiedViaBackupCode && newTimeStep === undefined) {
    const justLockedOut = recordFailedAttempt(totpAttempts, attemptKey);
    if (justLockedOut) {
      await dbInstance.logAudit(user.user_id, `2FA temporarily locked after ${MAX_ATTEMPTS} failed code attempts`, "users", user.user_id);
    }
    return res.status(401).json({ message: "That code didn't match. Check your authenticator app and try again." });
  }

  clearAttempts(totpAttempts, attemptKey);
  if (newTimeStep !== undefined) {
    await dbInstance.updateUser(user.user_id, { totp_last_time_step: newTimeStep });
  }

  await dbInstance.logAudit(user.user_id, verifiedViaBackupCode ? "Logged in using a 2FA backup code" : "Logged in with 2FA", "users", user.user_id);
  res.json(await buildFullLoginResponse(user));
});

// Lets the login page check, before rendering the registration form, whether public
// bookkeeper self-registration is still open (i.e. no bookkeeper exists yet). Public/
// unauthenticated — it only reveals a boolean, not who the bookkeeper is.
app.get("/api/auth/bookkeeper-registration-status", async (req, res) => {
  const count = await dbInstance.getBookkeeperCount();
  res.json({ open: count === 0 });
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, tin, confirmPassword } = req.body;

  if (!name || !email || !password || !tin) {
    return res.status(400).json({ message: "Please fill out all bookkeeper registration fields." });
  }

  // Bootstrap-only: public self-registration is only allowed for the very first
  // bookkeeper account. Once one exists, further bookkeeper accounts must be created
  // by an existing bookkeeper rather than through this public form.
  const bookkeeperCount = await dbInstance.getBookkeeperCount();
  if (bookkeeperCount > 0) {
    return res.status(403).json({ message: "Bookkeeper registration is closed. Ask an existing bookkeeper to set up your account." });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Confirmation password does not match original." });
  }

  const users = await dbInstance.getUsers();
  const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(400).json({ message: "This email address is already registered." });
  }

  const salt = bcrypt.genSaltSync(10);
  const password_hash = bcrypt.hashSync(password, salt);

  // Default register is always a bookkeeper license
  const newUser = await dbInstance.addUser({
    name,
    email,
    password_hash,
    role: "bookkeeper",
  });

  const profile = await dbInstance.addBookkeeperProfile({
    user_id: newUser.user_id,
    // CPA license number is optional and filled in later from the Account page — the
    // public registration form only collects TIN. addBookkeeperProfile's INSERT writes
    // user_id/license_no/status/tin; the rest fall through to their DB defaults (NULL /
    // true) regardless of what's passed here, listed explicitly just to satisfy the type.
    license_no: null,
    status: "active",
    phone_number: null,
    business_address: null,
    tin,
    rdo_code: null,
    email_reminders_enabled: true,
  });

  const token = jwt.sign(
    { user_id: newUser.user_id, name: newUser.name, email: newUser.email, role: newUser.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  await dbInstance.logAudit(newUser.user_id, "Registered novel bookkeeper licensed account", "users", newUser.user_id);

  res.json({
    token,
    user: {
      user_id: newUser.user_id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      profile,
    },
  });
});

app.post("/api/auth/activate", async (req, res) => {
  const { email, password, confirmPassword } = req.body;

  if (!email || !password || !confirmPassword) {
    return res.status(400).json({ message: "Please provide your email and a new password." });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Password confirmation does not match." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }

  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.role === "client");
  if (!user) {
    return res.status(404).json({ message: "No pending client account found for this email." });
  }
  if (!user.pending_activation) {
    return res.status(400).json({ message: "This account is already activated. Please sign in, or use Forgot Password instead." });
  }

  const salt = bcrypt.genSaltSync(10);
  const password_hash = bcrypt.hashSync(password, salt);
  const updated = (await dbInstance.updateUser(user.user_id, { password_hash, pending_activation: false }))!;

  await dbInstance.logAudit(updated.user_id, "Activated client account and set password", "users", updated.user_id);

  const token = jwt.sign(
    { user_id: updated.user_id, name: updated.name, email: updated.email, role: updated.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  const profile = await dbInstance.getClientProfileByUserId(updated.user_id);

  res.json({
    token,
    user: {
      user_id: updated.user_id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      profile,
    },
  });
});

// Public self-registration for clients: instead of the bookkeeper filling in the
// business profile up front, they hand the client a one-time invite code and the
// client fills in their own business details and picks their own password here.
app.post("/api/auth/register-client", async (req, res) => {
  const {
    invite_code,
    business_name,
    business_type,
    tin,
    address,
    contact_number,
    owner_name,
    owner_email,
    password,
    confirmPassword,
  } = req.body;

  if (!invite_code || !business_name || !business_type || !tin || !address || !contact_number || !owner_name || !owner_email || !password || !confirmPassword) {
    return res.status(400).json({ message: "Please fill out all fields, including the invite code from your bookkeeper." });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Confirmation password does not match original." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }

  const invite = await dbInstance.getClientInviteByCode(invite_code);
  if (!invite) {
    return res.status(403).json({ message: "Invalid invite code. Ask your bookkeeper for a new one." });
  }
  if (invite.status === "used") {
    return res.status(403).json({ message: "This invite code has already been used. Ask your bookkeeper for a new one." });
  }
  if (invite.status === "revoked") {
    return res.status(403).json({ message: "This invite code was revoked. Ask your bookkeeper for a new one." });
  }
  if (dbInstance.isInviteExpired(invite)) {
    return res.status(403).json({ message: "This invite code has expired — ask your bookkeeper for a new one." });
  }

  const users = await dbInstance.getUsers();
  const existingUser = users.find((u) => u.email.toLowerCase() === owner_email.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ message: "This email address is already registered." });
  }

  const salt = bcrypt.genSaltSync(10);
  const password_hash = bcrypt.hashSync(password, salt);

  const newUser = await dbInstance.addUser({
    name: owner_name,
    email: owner_email,
    password_hash,
    role: "client",
  });

  let profile = await dbInstance.addClientProfile({
    user_id: newUser.user_id,
    business_name,
    business_type,
    tin,
    address,
    contact_number,
    type: "Non-VAT",
    // The bookkeeper fee is the bookkeeper's own compensation to set, not the client's —
    // starts unset (flat ₱0) here just like the bookkeeper-driven "Add Client" path.
    bookkeeper_fee_type: "flat",
    bookkeeper_fee_amount: 0,
  });

  await seedDefaultComplianceForClient(profile.client_id);
  await seedDefaultAccountsForClient(profile.client_id);

  await dbInstance.markClientInviteUsed(invite.invite_id, profile.client_id);
  await dbInstance.logAudit(newUser.user_id, `Self-registered as new client via invite code: ${business_name}`, "client_profiles", profile.client_id);

  // Close the loop for the bookkeeper who handed out the code — they shouldn't have to
  // keep reopening the invite list to find out whether/when it got redeemed.
  await dbInstance.addNotification(
    invite.created_by,
    `${owner_name} registered "${business_name}" as a new client using your invite code ${invite.code}.`,
    "info",
    "clients"
  );

  // Self-registration isn't trusted the way a bookkeeper's own direct-add is: the
  // submitted email has to be proven reachable (a real clickable link, not just typing
  // the address back in — the old activation flow had no token at all, so knowing a
  // pending client's email was enough to take over their account), and the bookkeeper
  // still needs to sign off on the business details before real access is granted.
  // No JWT is issued here — the account exists but stays locked out of login until both
  // gates clear.
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await dbInstance.updateUser(newUser.user_id, {
    email_verified: false,
    verification_token: verificationToken,
    verification_expires: verificationExpires,
  });
  profile = (await dbInstance.updateClientProfile(profile.client_id, { approval_status: "pending" })) || profile;

  try {
    await sendVerificationEmail(owner_email, verificationToken, { businessName: business_name, ownerName: owner_name });
  } catch (e) {
    console.error("Failed sending verification email:", e);
  }

  res.status(201).json({
    pendingVerification: true,
    message: "Almost there! Check your inbox for a verification link before signing in.",
    user: {
      user_id: newUser.user_id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      profile,
    },
  });
});

// Public — reached by clicking the link in the verification email. Confirms the
// registrant actually controls the email address they typed; approval by the
// bookkeeper (a separate gate, checked client-side on login) still applies afterward.
app.post("/api/auth/verify-email", async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ message: "Missing verification token." });
  }

  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.verification_token === token);
  const invalidMessage = { message: "This verification link is invalid or has already been used." };

  if (!user) {
    return res.status(400).json(invalidMessage);
  }
  if (!user.verification_expires || new Date(user.verification_expires).getTime() < Date.now()) {
    return res.status(400).json({ message: "This verification link has expired. Please contact your bookkeeper for a new invite." });
  }

  await dbInstance.updateUser(user.user_id, {
    email_verified: true,
    verification_token: undefined,
    verification_expires: undefined,
  });
  await dbInstance.logAudit(user.user_id, "Verified account email address", "users", user.user_id);

  res.json({ message: "Email verified! You can now sign in." });
});

function generateResetCode(): string {
  // Excludes visually-ambiguous characters (0/O, 1/I) since this is meant to be copy-pasted from an email.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(10);
  let code = "";
  for (let i = 0; i < bytes.length; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Please provide your account email." });
  }

  // Always respond with the same generic message regardless of whether the email exists,
  // so this endpoint can't be used to enumerate registered accounts.
  const genericResponse = { message: "If an account with that email exists, we've sent password reset instructions to it." };

  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.json(genericResponse);
  }

  const resetCode = generateResetCode();
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await dbInstance.updateUser(user.user_id, { reset_token: resetCode, reset_token_expires: expires });

  try {
    await sendPasswordResetEmail(user.email, resetCode);
  } catch (e) {
    console.error("Failed sending password reset email:", e);
  }

  res.json(genericResponse);
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { email, resetCode, password, confirmPassword } = req.body;

  if (!email || !resetCode || !password || !confirmPassword) {
    return res.status(400).json({ message: "Please provide your email, reset code, and a new password." });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Password confirmation does not match." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }

  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  const invalidCodeMessage = { message: "Invalid or expired reset code. Please request a new one." };

  if (!user || !user.reset_token || user.reset_token !== resetCode) {
    return res.status(400).json(invalidCodeMessage);
  }
  if (!user.reset_token_expires || new Date(user.reset_token_expires).getTime() < Date.now()) {
    return res.status(400).json(invalidCodeMessage);
  }

  const salt = bcrypt.genSaltSync(10);
  const password_hash = bcrypt.hashSync(password, salt);
  await dbInstance.updateUser(user.user_id, {
    password_hash,
    reset_token: undefined,
    reset_token_expires: undefined,
    pending_activation: false,
  });

  await dbInstance.logAudit(user.user_id, "Reset account password", "users", user.user_id);

  res.json({ message: "Password reset successful. You can now sign in with your new password." });
});

// Public "Send Us a Message" form on the marketing Support page — unauthenticated,
// so it's rate-limited by IP and forwards straight to the bookkeeper (in-app notification
// + email), the same dual-channel pattern used by the client's "message bookkeeper" feature.
app.post("/api/support/contact", async (req, res) => {
  const { name, email, topic, message } = req.body;
  if (!name || !email || !topic || !message) {
    return res.status(400).json({ message: "Please fill out all fields." });
  }
  if (String(name).length > 200 || String(email).length > 200 || String(topic).length > 100 || String(message).length > 5000) {
    return res.status(400).json({ message: "One or more fields are too long." });
  }

  const attemptKey = req.ip || "unknown";
  const lockedForSeconds = checkLockout(contactAttempts, attemptKey);
  if (lockedForSeconds) {
    return lockoutResponse(res, lockedForSeconds);
  }
  recordFailedAttempt(contactAttempts, attemptKey);

  const users = await dbInstance.getUsers();
  const bookkeeper = users.find((u) => u.role === "bookkeeper");
  if (!bookkeeper) {
    return res.status(503).json({ message: "Support is temporarily unavailable. Please try again later." });
  }

  const details = { name: String(name).trim(), email: String(email).trim(), topic: String(topic).trim(), message: String(message).trim() };
  await dbInstance.addNotification(bookkeeper.user_id, `Support inquiry from ${details.name} (${details.email}): "${details.topic}"`, "info");
  // No link: this comes from the public marketing site, not a client/document/payment
  // record inside the app, so there's nowhere in-app to route a click to.
  await sendSupportContactEmail(bookkeeper.email, details);

  res.json({ success: true, message: "Thanks! Your message has been sent — we'll get back to you soon." });
});

app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.user_id === req.user.user_id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  let profile = null;
  if (user.role === "bookkeeper") {
    profile = await dbInstance.getBookkeeperProfile(user.user_id);
  } else {
    profile = await dbInstance.getClientProfileByUserId(user.user_id);
  }

  res.json({
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role,
    profile,
  });
});

// Bookkeeper's own "My Account" page — combines their BookkeeperProfile with the User
// record (name/email/member-since) into one convenient response for that screen. Mirrors
// /api/clients/me/profile below. 2FA setup/QR/backup-codes stay under Security (a whole
// wizard, not a field on this form) — this page only shows read-only 2FA status.
app.get("/api/bookkeeper/me/profile", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const profile = await dbInstance.getBookkeeperProfile(req.user.user_id);
  if (!profile) return res.status(404).json({ message: "Bookkeeper profile not found." });
  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.user_id === req.user.user_id);
  if (!user) return res.status(404).json({ message: "User not found." });

  res.json({
    ...profile,
    name: user.name,
    email: user.email,
    member_since: user.created_at,
  });
});

app.put("/api/bookkeeper/me/profile", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const profile = await dbInstance.getBookkeeperProfile(req.user.user_id);
  if (!profile) return res.status(404).json({ message: "Bookkeeper profile not found." });

  const { name, license_no, phone_number, business_address, tin, rdo_code, email_reminders_enabled } = req.body;

  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ message: "Full name cannot be empty." });
    await dbInstance.updateUser(req.user.user_id, { name: String(name).trim() });
  }

  const profileUpdates: any = {};
  if (license_no !== undefined) {
    if (!String(license_no).trim()) return res.status(400).json({ message: "License number cannot be empty." });
    profileUpdates.license_no = String(license_no).trim();
  }
  if (phone_number !== undefined) profileUpdates.phone_number = String(phone_number).trim() || null;
  if (business_address !== undefined) profileUpdates.business_address = String(business_address).trim() || null;
  if (tin !== undefined) profileUpdates.tin = String(tin).trim() || null;
  if (rdo_code !== undefined) profileUpdates.rdo_code = String(rdo_code).trim() || null;
  if (email_reminders_enabled !== undefined) profileUpdates.email_reminders_enabled = !!email_reminders_enabled;

  const updated = (await dbInstance.updateBookkeeperProfile(profile.bookkeeper_id, profileUpdates))!;
  await dbInstance.logAudit(req.user.user_id, "Updated own account profile", "bookkeeper_profiles", profile.bookkeeper_id);

  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.user_id === req.user.user_id)!;
  res.json({
    ...updated,
    name: user.name,
    email: user.email,
    member_since: user.created_at,
  });
});

// Change own password while already logged in — distinct from /api/auth/reset-password
// (unauthenticated, code-based) below: this requires the CURRENT password rather than an
// emailed code, since the user is already proven to hold a valid session.
app.put("/api/bookkeeper/me/password", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: "Please fill in your current password and a new password." });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: "New password confirmation does not match." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: "New password must be at least 6 characters." });
  }

  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.user_id === req.user.user_id);
  if (!user) return res.status(404).json({ message: "User not found." });

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ message: "Current password is incorrect." });
  }

  const salt = bcrypt.genSaltSync(10);
  const password_hash = bcrypt.hashSync(newPassword, salt);
  await dbInstance.updateUser(user.user_id, { password_hash });
  await dbInstance.logAudit(user.user_id, "Changed own account password", "users", user.user_id);

  res.json({ message: "Password updated successfully." });
});

// --- TWO-FACTOR AUTHENTICATION (TOTP) ---
// Bookkeeper-only, self-service: every endpoint here is gated by requireRole("bookkeeper")
// and only ever reads/writes req.user.user_id's own record — there is no admin-over-other-
// accounts surface, and clients never see or reach any of this.
app.get("/api/security/totp/status", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.user_id === req.user.user_id);
  if (!user) return res.status(404).json({ message: "User not found." });
  res.json({
    enabled: !!user.totp_enabled,
    backupCodesRemaining: user.totp_enabled ? (user.totp_backup_codes || []).length : 0,
  });
});

app.post("/api/security/totp/setup", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.user_id === req.user.user_id);
  if (!user) return res.status(404).json({ message: "User not found." });
  if (user.totp_enabled) {
    return res.status(400).json({ message: "Two-factor authentication is already enabled. Disable it first to set up again." });
  }

  const secret = generateTotpSecret();
  await dbInstance.updateUser(user.user_id, { totp_pending_secret: secret });

  const otpauthUrl = buildOtpauthUri(user.email, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  res.json({ secret, otpauthUrl, qrCodeDataUrl });
});

app.post("/api/security/totp/verify-setup", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.user_id === req.user.user_id);
  if (!user) return res.status(404).json({ message: "User not found." });
  if (!user.totp_pending_secret) {
    return res.status(400).json({ message: "No setup in progress. Start setup again." });
  }

  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ message: "Please enter the 6-digit code from your authenticator app." });
  }

  const attemptKey = `totp-setup:${user.user_id}`;
  const lockedForSeconds = checkLockout(totpAttempts, attemptKey);
  if (lockedForSeconds) {
    return lockoutResponse(res, lockedForSeconds);
  }

  const result = await verifyTotpCode(user.totp_pending_secret, String(code).trim());
  if (!result.valid) {
    recordFailedAttempt(totpAttempts, attemptKey);
    return res.status(401).json({ message: "That code didn't match. Make sure your phone's clock is accurate and use the newest code shown." });
  }
  clearAttempts(totpAttempts, attemptKey);

  const backupCodes = generateBackupCodes();
  await dbInstance.updateUser(user.user_id, {
    totp_secret: user.totp_pending_secret,
    totp_pending_secret: undefined,
    totp_enabled: true,
    totp_backup_codes: hashBackupCodes(backupCodes),
    totp_last_time_step: result.timeStep,
  });

  await dbInstance.logAudit(user.user_id, "Enabled two-factor authentication", "users", user.user_id);
  res.json({ success: true, backupCodes });
});

app.post("/api/security/totp/disable", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.user_id === req.user.user_id);
  if (!user) return res.status(404).json({ message: "User not found." });
  if (!user.totp_enabled || !user.totp_secret) {
    return res.status(400).json({ message: "Two-factor authentication is not enabled." });
  }

  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ message: "Please enter a current authentication or backup code to disable." });
  }

  const trimmedCode = String(code).trim();
  const verified = isBackupCodeFormat(trimmedCode)
    ? matchBackupCode(trimmedCode, user.totp_backup_codes || []) !== -1
    : (await verifyTotpCode(user.totp_secret, trimmedCode, user.totp_last_time_step)).valid;

  if (!verified) {
    return res.status(401).json({ message: "That code didn't match." });
  }

  await dbInstance.updateUser(user.user_id, {
    totp_enabled: false,
    totp_secret: undefined,
    totp_pending_secret: undefined,
    totp_backup_codes: [],
    totp_last_time_step: undefined,
  });

  await dbInstance.logAudit(user.user_id, "Disabled two-factor authentication", "users", user.user_id);
  res.json({ success: true });
});

app.post("/api/security/totp/regenerate-backup-codes", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.user_id === req.user.user_id);
  if (!user) return res.status(404).json({ message: "User not found." });
  if (!user.totp_enabled || !user.totp_secret) {
    return res.status(400).json({ message: "Two-factor authentication is not enabled." });
  }

  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ message: "Please enter your current 6-digit code to confirm." });
  }

  const result = await verifyTotpCode(user.totp_secret, String(code).trim(), user.totp_last_time_step);
  if (!result.valid) {
    return res.status(401).json({ message: "That code didn't match." });
  }

  const backupCodes = generateBackupCodes();
  await dbInstance.updateUser(user.user_id, {
    totp_backup_codes: hashBackupCodes(backupCodes),
    totp_last_time_step: result.timeStep,
  });

  await dbInstance.logAudit(user.user_id, "Regenerated 2FA backup codes", "users", user.user_id);
  res.json({ success: true, backupCodes });
});

// 2. Dashboard metrics & activity
app.get("/api/dashboard/metrics", authenticateToken, async (req: any, res) => {
  const isBookkeeper = req.user.role === "bookkeeper";
  let targetClientId: number | undefined = undefined;

  if (!isBookkeeper) {
    const clientProf = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!clientProf) {
      return res.status(404).json({ message: "Client profile not found" });
    }
    targetClientId = clientProf.client_id;
  }

  const clientProfiles = await dbInstance.getClientProfiles();
  const activeClients = clientProfiles.filter((c) => c.status === "active").length;

  // Total Outstanding Dues (sum of all tax records & permit fees that are OVERDUE or URGENT)
  const taxRecords = await dbInstance.getTaxRecords(targetClientId);
  const permitRecords = await dbInstance.getPermitRecords(targetClientId);

  const pendingTaxDues = taxRecords
    .filter((t) => ["overdue", "urgent", "upcoming"].includes(t.status))
    .reduce((sum, item) => sum + item.amount, 0);

  const pendingPermitFees = permitRecords
    .filter((p) => ["overdue", "urgent", "upcoming"].includes(p.status))
    .reduce((sum, item) => sum + item.fee, 0);

  const totalOutstandingDues = pendingTaxDues + pendingPermitFees;

  // Permits expiring in 30 days
  const today = new Date();
  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(today.getDate() + 30);

  const permitsExpiringSoon = permitRecords.filter((p) => {
    if (p.status === "renewed") return false;
    const expDate = new Date(p.expiry_date);
    return expDate >= today && expDate <= thirtyDaysLater;
  }).length;

  // Q2 tax filings completed (percentage or filed vs total)
  const q2Taxes = taxRecords.filter((t) => t.tax_type.includes("Q2"));
  const q2Completed = q2Taxes.filter((t) => t.status === "filed").length;
  const q2Total = q2Taxes.length;

  // Payments Module aggregates
  const payments = await dbInstance.getPayments(targetClientId);
  const paymentsCollected = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const paymentsPending = payments.filter((p) => p.status === "pending").length;
  const overdueObligations =
    taxRecords.filter((t) => t.status === "overdue").length + permitRecords.filter((p) => p.status === "overdue").length;
  const upcomingObligations =
    taxRecords.filter((t) => t.status === "urgent" || t.status === "upcoming").length +
    permitRecords.filter((p) => p.status === "urgent" || p.status === "upcoming").length;

  res.json({
    activeClients: isBookkeeper ? activeClients : 1,
    totalClients: isBookkeeper ? clientProfiles.length : 1,
    totalOutstandingDues,
    permitsExpiringSoon,
    q2Completed,
    q2Total,
    paymentsCollected,
    paymentsPending,
    overdueObligations,
    upcomingObligations,
  });
});

// Recent Activities List
app.get("/api/dashboard/recent-activity", authenticateToken, async (req: any, res) => {
  const isBookkeeper = req.user.role === "bookkeeper";
  let targetClientId: number | undefined = undefined;

  if (!isBookkeeper) {
    const clientProf = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (clientProf) targetClientId = clientProf.client_id;
  }

  // Combine Tax compliance, Permit compliance & Ledger submissions into a unified "activity feed"
  const [taxRecords, permitRecords, clients] = await Promise.all([
    dbInstance.getTaxRecords(targetClientId),
    dbInstance.getPermitRecords(targetClientId),
    dbInstance.getClientProfiles(),
  ]);

  const tax = taxRecords.map((t) => ({
    type: "Tax Obligation",
    clientName: clients.find((c) => c.client_id === t.client_id)?.business_name || "Client",
    label: t.tax_type,
    amount: t.amount,
    date: t.due_date,
    status: t.status,
  }));

  const permits = permitRecords.map((p) => ({
    type: "Business Permit",
    clientName: clients.find((c) => c.client_id === p.client_id)?.business_name || "Client",
    label: p.permit_type,
    amount: p.fee,
    date: p.expiry_date,
    status: p.status === "renewed" ? "filed" : p.status, // normalise status
  }));

  let combined = [...tax, ...permits];
  // Active (upcoming/urgent/overdue) obligations always outrank filed/renewed ones so that a
  // freshly-added deadline can't be crowded out of the slice by older, already-settled records.
  combined.sort((a, b) => {
    const aActive = a.status !== "filed" && a.status !== "renewed";
    const bActive = b.status !== "filed" && b.status !== "renewed";
    if (aActive !== bActive) return aActive ? -1 : 1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  const limitParam = Number(req.query.limit) || 12;
  res.json(combined.slice(0, limitParam));
});

// 3. Client Management APIs
app.get("/api/clients", authenticateToken, async (req: any, res) => {
  // If client, force view only their own record
  if (req.user.role === "client") {
    const prof = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!prof) return res.json([]);
    return res.json([prof]);
  }

  const clientProfiles = await dbInstance.getClientProfiles();
  // ?status=all is for resolving a business name against a client_id that may have
  // been deactivated since — e.g. a soft-deleted client's old tax obligations or
  // documents shouldn't render as "Unknown Business". Every dropdown that creates NEW
  // records (journal entries, uploads, tax obligations) must keep the active-only
  // default so a bookkeeper can't pick a deactivated client for new work.
  const clients = req.query.status === "all" ? clientProfiles : clientProfiles.filter((c) => c.status === "active");
  res.json(clients);
});

app.get("/api/clients/:id", authenticateToken, async (req: any, res) => {
  const clientId = Number(req.params.id);

  if (req.user.role === "client") {
    const prof = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!prof || prof.client_id !== clientId) {
      return res.status(403).json({ message: "Unauthorized file access." });
    }
  }

  const clientProfiles = await dbInstance.getClientProfiles();
  const client = clientProfiles.find((c) => c.client_id === clientId && c.status === "active");
  if (!client) {
    return res.status(404).json({ message: "Client profile not found or soft-deleted." });
  }

  res.json(client);
});

app.post("/api/clients", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const { business_name, business_type, tin, address, contact_number, owner_name, owner_email, password } = req.body;

  if (!business_name || !business_type || !tin || !address || !contact_number || !owner_name || !owner_email) {
    return res.status(400).json({ message: "Please fulfill all required general parameters." });
  }

  // Create a matched client user login credentials simultaneously
  const users = await dbInstance.getUsers();
  const existingUser = users.find((u) => u.email.toLowerCase() === owner_email.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ message: "A client user with this email address already exists." });
  }

  const salt = bcrypt.genSaltSync(10);
  // If the bookkeeper doesn't set a password up front, the account is created in a
  // pending-activation state with an unusable random hash — the client sets their own
  // password via the public "Activate Your Account" flow instead of a shared default.
  const pendingActivation = !password;
  const password_hash = bcrypt.hashSync(password || crypto.randomBytes(24).toString("hex"), salt);

  const newUser = await dbInstance.addUser({
    name: owner_name,
    email: owner_email,
    password_hash,
    role: "client",
    pending_activation: pendingActivation,
  });

  const profile = await dbInstance.addClientProfile({
    user_id: newUser.user_id,
    business_name,
    business_type,
    tin,
    address,
    contact_number,
    type: "Non-VAT",
    // The bookkeeper fee is the client's decision (they set/adjust it from their own
    // Payments screen), not the bookkeeper's — this manual onboarding path defaults it
    // to unset (flat ₱0) rather than letting the bookkeeper pick it for the client.
    bookkeeper_fee_type: "flat",
    bookkeeper_fee_amount: 0,
  });

  await seedDefaultComplianceForClient(profile.client_id);
  await seedDefaultAccountsForClient(profile.client_id);

  await dbInstance.logAudit(req.user.user_id, `Created Client Business: ${business_name}`, "client_profiles", profile.client_id);

  if (pendingActivation) {
    sendActivationInviteEmail(owner_email, { businessName: business_name, ownerName: owner_name }).catch((e) =>
      console.error("Failed sending client activation invite email:", e)
    );
  }

  res.status(201).json({ client: profile, credentials: { email: owner_email, pending_activation: pendingActivation } });
});

// Client Self-Registration Invite Codes: a bookkeeper generates a one-time code and
// hands it to a prospective client, who then fills in their own business profile at
// the public "Register as Client" screen instead of the bookkeeper typing it in for them.
app.get("/api/invites", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const invites = (await dbInstance.getClientInvites(req.user.user_id)).slice().reverse();
  const withExpiry = invites.map((i) => ({ ...i, is_expired: dbInstance.isInviteExpired(i) }));
  res.json(withExpiry);
});

app.post("/api/invites", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 120) : "";
  const invite = await createClientInviteWithUniqueCode(req.user.user_id, label || undefined);
  await dbInstance.logAudit(req.user.user_id, `Generated client invite code: ${invite.code}${label ? ` (for ${label})` : ""}`, "client_invites", invite.invite_id);
  res.status(201).json(invite);
});

app.delete("/api/invites/:id", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const inviteId = Number(req.params.id);
  const invites = await dbInstance.getClientInvites();
  const invite = invites.find((i) => i.invite_id === inviteId);
  if (!invite || invite.created_by !== req.user.user_id) {
    return res.status(404).json({ message: "Invite code not found." });
  }
  const revoked = await dbInstance.revokeClientInvite(inviteId);
  if (!revoked) {
    return res.status(400).json({ message: "Only pending invite codes can be revoked." });
  }
  await dbInstance.logAudit(req.user.user_id, `Revoked client invite code: ${invite.code}`, "client_invites", inviteId);
  res.json(revoked);
});

// Only the bookkeeper edits a client's profile — including the bookkeeper-fee
// arrangement. It's the bookkeeper's own compensation, not the client's to set, so the
// client only ever sees it read-only (Payments screen).
app.put("/api/clients/:id", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const clientId = Number(req.params.id);
  const updates = req.body;

  if (updates.bookkeeper_fee_type !== undefined || updates.bookkeeper_fee_amount !== undefined) {
    if (!["flat", "percentage"].includes(updates.bookkeeper_fee_type)) {
      return res.status(400).json({ message: "bookkeeper_fee_type must be 'flat' or 'percentage'." });
    }
    const feeAmount = Number(updates.bookkeeper_fee_amount);
    if (!Number.isFinite(feeAmount) || feeAmount < 0) {
      return res.status(400).json({ message: "bookkeeper_fee_amount must be a non-negative number." });
    }
    updates.bookkeeper_fee_amount = feeAmount;
  }

  const updated = await dbInstance.updateClientProfile(clientId, updates);
  if (!updated) {
    return res.status(404).json({ message: "Client profile not found to updates." });
  }

  await dbInstance.logAudit(req.user.user_id, `Updated Client Business Profile: ${updated.business_name}`, "client_profiles", clientId);
  res.json(updated);
});

app.delete("/api/clients/:id", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const clientId = Number(req.params.id);
  const clientProfiles = await dbInstance.getClientProfiles();
  const client = clientProfiles.find((c) => c.client_id === clientId);
  if (!client) {
    return res.status(404).json({ message: "Client target not found." });
  }

  await dbInstance.updateClientProfile(clientId, { status: "inactive" });
  await dbInstance.logAudit(req.user.user_id, `Soft deleted Client: ${client.business_name}`, "client_profiles", clientId);
  res.json({ success: true, message: "Client profile successfully soft deleted." });
});

// A self-registered client (via invite code) can verify their email and log in, but
// stays gated behind this until the bookkeeper reviews their submitted business details —
// the frontend shows a "waiting for approval" screen instead of the real dashboard until
// this flips to "approved".
app.post("/api/clients/:id/approve", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const clientId = Number(req.params.id);
  const clientProfiles = await dbInstance.getClientProfiles();
  const client = clientProfiles.find((c) => c.client_id === clientId);
  if (!client) {
    return res.status(404).json({ message: "Client target not found." });
  }
  if (client.approval_status === "approved") {
    return res.json(client);
  }

  const updated = await dbInstance.updateClientProfile(clientId, { approval_status: "approved" });
  await dbInstance.logAudit(req.user.user_id, `Approved client registration: ${client.business_name}`, "client_profiles", clientId);
  await dbInstance.addNotification(client.user_id, `Your business "${client.business_name}" has been approved by your bookkeeper. Welcome to DigiBok!`, "info", "dashboard");
  res.json(updated);
});

// Client's own "My Profile" page — combines their ClientProfile with the owner's User
// record (name/email/member-since) into one convenient response for that screen.
app.get("/api/clients/me/profile", authenticateToken, requireRole("client"), async (req: any, res) => {
  const profile = await dbInstance.getClientProfileByUserId(req.user.user_id);
  if (!profile) return res.status(404).json({ message: "Client profile not found." });
  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.user_id === req.user.user_id);
  if (!user) return res.status(404).json({ message: "User not found." });

  res.json({
    ...profile,
    owner_name: user.name,
    owner_email: user.email,
    member_since: user.created_at,
  });
});

app.put("/api/clients/me/profile", authenticateToken, requireRole("client"), async (req: any, res) => {
  const profile = await dbInstance.getClientProfileByUserId(req.user.user_id);
  if (!profile) return res.status(404).json({ message: "Client profile not found." });

  const { owner_name, contact_number, address, tin, rdo_code, industry, email_reminders_enabled } = req.body;

  if (owner_name !== undefined) {
    if (!String(owner_name).trim()) return res.status(400).json({ message: "Full name cannot be empty." });
    await dbInstance.updateUser(req.user.user_id, { name: String(owner_name).trim() });
  }

  const profileUpdates: any = {};
  if (contact_number !== undefined) profileUpdates.contact_number = String(contact_number).trim();
  if (address !== undefined) profileUpdates.address = String(address).trim();
  if (tin !== undefined) profileUpdates.tin = String(tin).trim();
  if (rdo_code !== undefined) profileUpdates.rdo_code = String(rdo_code).trim();
  if (industry !== undefined) profileUpdates.industry = String(industry).trim();
  if (email_reminders_enabled !== undefined) profileUpdates.email_reminders_enabled = !!email_reminders_enabled;

  const updated = (await dbInstance.updateClientProfile(profile.client_id, profileUpdates))!;
  await dbInstance.logAudit(req.user.user_id, `Updated own profile: ${updated.business_name}`, "client_profiles", profile.client_id);

  const users = await dbInstance.getUsers();
  const user = users.find((u) => u.user_id === req.user.user_id)!;
  res.json({
    ...updated,
    owner_name: user.name,
    owner_email: user.email,
    member_since: user.created_at,
  });
});

// This app is single-bookkeeper-per-install (see addClientProfile / seed data), so "my
// bookkeeper" is simply whichever user has the bookkeeper role.
app.get("/api/clients/me/bookkeeper", authenticateToken, requireRole("client"), async (req: any, res) => {
  const users = await dbInstance.getUsers();
  const bookkeeperUser = users.find((u) => u.role === "bookkeeper");
  if (!bookkeeperUser) return res.status(404).json({ message: "No bookkeeper account found." });
  const bookkeeperProfile = await dbInstance.getBookkeeperProfile(bookkeeperUser.user_id);

  res.json({
    name: bookkeeperUser.name,
    email: bookkeeperUser.email,
    license_no: bookkeeperProfile?.license_no || null,
  });
});

// --- MESSAGES (bookkeeper <-> client, one thread per client) ---

// Bookkeeper's conversation list: one row per client that has ever exchanged a
// message, newest activity first, with an unread count for that thread.
app.get("/api/messages/threads", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const [summary, clients] = await Promise.all([dbInstance.getMessageThreadsSummary(), dbInstance.getClientProfiles()]);
  const enriched = summary.map((row) => {
    const client = clients.find((c) => c.client_id === row.client_id);
    return {
      client_id: row.client_id,
      business_name: client?.business_name || "Unknown Business",
      latest: row.latest,
      unreadCount: row.unreadCount,
    };
  });
  res.json(enriched);
});

// Unread badge count — client sees unread-from-bookkeeper in their own thread;
// bookkeeper sees the sum of unread-from-client across every thread.
app.get("/api/messages/unread-count", authenticateToken, async (req: any, res) => {
  if (req.user.role === "bookkeeper") {
    return res.json({ count: await dbInstance.getUnreadMessageCountForBookkeeper() });
  }
  const clientProf = await dbInstance.getClientProfileByUserId(req.user.user_id);
  if (!clientProf) return res.json({ count: 0 });
  res.json({ count: await dbInstance.getUnreadMessageCountForClient(clientProf.client_id) });
});

// Full history for one client's thread. Clients may only open their own; bookkeepers
// may open any. Opening a thread marks the other party's messages as read.
app.get("/api/messages/:clientId", authenticateToken, async (req: any, res) => {
  const clientId = Number(req.params.clientId);

  if (req.user.role === "client") {
    const ownProfile = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!ownProfile || ownProfile.client_id !== clientId) {
      return res.status(403).json({ message: "You can only view your own conversation." });
    }
  } else {
    const clientProfiles = await dbInstance.getClientProfiles();
    const client = clientProfiles.find((c) => c.client_id === clientId);
    if (!client) return res.status(404).json({ message: "Client not found." });
  }

  const messages = await dbInstance.getMessagesForClient(clientId);
  await dbInstance.markMessagesRead(clientId, req.user.role);
  res.json(messages);
});

// Send a message. Clients always send into their own thread; bookkeepers must specify
// which client's thread they're replying into.
app.post("/api/messages", authenticateToken, async (req: any, res) => {
  const { body, subject, client_id } = req.body;
  if (!body || !String(body).trim()) {
    return res.status(400).json({ message: "Please write a message." });
  }

  let targetClientId: number;
  let targetClient;
  if (req.user.role === "client") {
    const ownProfile = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!ownProfile) return res.status(404).json({ message: "Client profile not found." });
    targetClientId = ownProfile.client_id;
    targetClient = ownProfile;
  } else {
    if (!client_id) return res.status(400).json({ message: "Please choose which client to message." });
    targetClientId = Number(client_id);
    const clientProfiles = await dbInstance.getClientProfiles();
    targetClient = clientProfiles.find((c) => c.client_id === targetClientId);
    if (!targetClient) return res.status(404).json({ message: "Client not found." });
  }

  const newMessage = await dbInstance.addMessage({
    client_id: targetClientId,
    sender_id: req.user.user_id,
    sender_role: req.user.role,
    subject: subject ? String(subject).trim() : undefined,
    body: String(body).trim(),
  });

  // Notify whoever didn't send it
  if (req.user.role === "client") {
    const users = await dbInstance.getUsers();
    for (const bk of users.filter((u) => u.role === "bookkeeper")) {
      await dbInstance.addNotification(bk.user_id, `Message from ${targetClient!.business_name}: "${String(body).trim().slice(0, 80)}"`, "info", "messages");
    }
  } else {
    await dbInstance.addNotification((targetClient as any).user_id, `Message from your bookkeeper: "${String(body).trim().slice(0, 80)}"`, "info", "messages");
  }

  await dbInstance.logAudit(req.user.user_id, `Sent a message in ${targetClient!.business_name}'s thread`, "messages", newMessage.message_id);
  res.status(201).json(newMessage);
});

// 4. Compliance Monitors - Tax & Permits
app.get("/api/compliance", authenticateToken, async (req: any, res) => {
  const isBookkeeper = req.user.role === "bookkeeper";
  let targetClientId: number | undefined = undefined;

  if (!isBookkeeper) {
    const clientProf = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!clientProf) return res.json({ taxes: [], permits: [] });
    targetClientId = clientProf.client_id;
  }

  const taxes = await dbInstance.getTaxRecords(targetClientId);
  const permits = await dbInstance.getPermitRecords(targetClientId);

  res.json({ taxes, permits });
});

app.get("/api/compliance/summary", authenticateToken, async (req: any, res) => {
  const isBookkeeper = req.user.role === "bookkeeper";
  let targetClientId: number | undefined = undefined;

  if (!isBookkeeper) {
    const clientProf = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (clientProf) targetClientId = clientProf.client_id;
  }

  const taxes = await dbInstance.getTaxRecords(targetClientId);
  const permits = await dbInstance.getPermitRecords(targetClientId);

  let overdue = 0;
  let urgent = 0;
  let upcoming = 0;

  taxes.forEach((t) => {
    if (t.status === "overdue") overdue++;
    else if (t.status === "urgent") urgent++;
    else if (t.status === "upcoming") upcoming++;
  });

  permits.forEach((p) => {
    if (p.status === "overdue") overdue++;
    else if (p.status === "urgent") urgent++;
    else if (p.status === "upcoming") upcoming++;
  });

  res.json({ overdue, urgent, upcoming });
});

app.post("/api/compliance/tax", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const { client_id, tax_type, due_date, amount } = req.body;
  if (!client_id || !tax_type || !due_date || amount === undefined || amount === null || amount === "") {
    return res.status(400).json({ message: "Please provide all required Tax parameters." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date) || isNaN(Date.parse(due_date))) {
    return res.status(400).json({ message: "due_date must be a valid date in YYYY-MM-DD format." });
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ message: "Amount must be a positive number." });
  }

  const newTax = await dbInstance.addTaxObligation({
    client_id: Number(client_id),
    tax_type,
    due_date,
    amount: Number(amount),
    status: "upcoming",
  });

  await dbInstance.logAudit(req.user.user_id, `Created tax obligation: ${tax_type}`, "tax_records", newTax.tax_id);
  res.status(201).json(newTax);
});

app.post("/api/compliance/permit", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const { client_id, permit_type, expiry_date, fee } = req.body;
  if (!client_id || !permit_type || !expiry_date || !fee) {
    return res.status(400).json({ message: "Please provide all required Permit parameters." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry_date) || isNaN(Date.parse(expiry_date))) {
    return res.status(400).json({ message: "expiry_date must be a valid date in YYYY-MM-DD format." });
  }
  if (!Number.isFinite(Number(fee)) || Number(fee) <= 0) {
    return res.status(400).json({ message: "Fee must be a positive number." });
  }

  const newPermit = await dbInstance.addPermitObligation({
    client_id: Number(client_id),
    permit_type,
    expiry_date,
    fee: Number(fee),
    status: "upcoming",
  });

  await dbInstance.logAudit(req.user.user_id, `Created permit obligation: ${permit_type}`, "permit_records", newPermit.permit_id);
  res.status(201).json(newPermit);
});

app.put("/api/compliance/tax/:id", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const taxId = Number(req.params.id);
  const updated = await dbInstance.updateTaxObligation(taxId, req.body);
  if (!updated) {
    return res.status(404).json({ message: "Tax record not found." });
  }

  await dbInstance.logAudit(req.user.user_id, `Updated tax status: ${updated.tax_type} to ${updated.status}`, "tax_records", taxId);
  res.json(updated);
});

app.put("/api/compliance/permit/:id", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const permitId = Number(req.params.id);
  const updated = await dbInstance.updatePermitObligation(permitId, req.body);
  if (!updated) {
    return res.status(404).json({ message: "Permit record not found." });
  }

  await dbInstance.logAudit(req.user.user_id, `Updated permit status: ${updated.permit_type} to ${updated.status}`, "permit_records", permitId);
  res.json(updated);
});

app.delete("/api/compliance/tax/:id", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const taxId = Number(req.params.id);
  const deleted = await dbInstance.deleteTaxObligation(taxId);
  if (!deleted) {
    return res.status(404).json({ message: "Tax record not found." });
  }

  await dbInstance.logAudit(req.user.user_id, "Deleted tax compliance ledger target", "tax_records", taxId);
  res.json({ success: true });
});

app.delete("/api/compliance/permit/:id", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const permitId = Number(req.params.id);
  const deleted = await dbInstance.deletePermitObligation(permitId);
  if (!deleted) {
    return res.status(404).json({ message: "Permit record not found." });
  }

  await dbInstance.logAudit(req.user.user_id, "Deleted permit compliance checklist marker", "permit_records", permitId);
  res.json({ success: true });
});

// Trigger Compliance scan on-the-fly (Highly requested testing feature)
app.post("/api/compliance/scan", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  try {
    const results = await scanComplianceDeadlines();
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ message: "Scanning job compilations failed: " + error.message });
  }
});

// 5. Journal and General Ledger
app.get("/api/accounts", authenticateToken, async (req: any, res) => {
  const clientId = Number(req.query.clientId);
  if (!clientId) {
    return res.status(400).json({ message: "clientId query parameter required." });
  }

  if (req.user.role === "client") {
    const prof = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!prof || prof.client_id !== clientId) {
      return res.status(403).json({ message: "Unauthorized ledger credentials." });
    }
  }

  const accounts = await dbInstance.getAccounts(clientId);
  const ledger = await dbInstance.getGeneralLedger(clientId);
  // has_activity tells the frontend whether an account's type is still safely editable
  // (no posted ledger rows yet) without making a round trip to find out the hard way.
  const withActivity = accounts.map((a) => ({
    ...a,
    has_activity: ledger.some((g) => g.account_id === a.account_id),
  }));
  res.json(withActivity);
});

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;

app.post("/api/accounts", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const { client_id, account_name, account_type, account_code, balance } = req.body;

  if (!client_id || !account_name || !account_type) {
    return res.status(400).json({ message: "client_id, account_name, and account_type are required." });
  }
  if (!ACCOUNT_TYPES.includes(account_type)) {
    return res.status(400).json({ message: `account_type must be one of: ${ACCOUNT_TYPES.join(", ")}.` });
  }
  const openingBalance = balance !== undefined ? Number(balance) : 0;
  if (!Number.isFinite(openingBalance) || openingBalance < 0) {
    return res.status(400).json({ message: "Opening balance must be a non-negative number — enter how much this account currently holds, not a debit/credit-signed amount." });
  }

  const clientAccounts = await dbInstance.getAccounts(Number(client_id));
  const existing = clientAccounts.find((a) => a.account_name.toLowerCase() === String(account_name).trim().toLowerCase());
  if (existing) {
    return res.status(400).json({ message: "An account with this name already exists for this client." });
  }

  // Created at ₱0 regardless of the requested opening balance — postOpeningBalance
  // below brings it up to that amount through a real, balanced journal entry rather
  // than writing the number directly onto the row.
  const newAccount = await dbInstance.addAccount({
    client_id: Number(client_id),
    account_name: String(account_name).trim(),
    account_type,
    account_code: account_code ? String(account_code).trim() : undefined,
    balance: 0,
  });
  await dbInstance.logAudit(req.user.user_id, `Added chart-of-accounts entry: ${newAccount.account_name} (${newAccount.account_type})`, "accounts", newAccount.account_id);

  if (openingBalance > 0) {
    await postOpeningBalance(Number(client_id), newAccount, openingBalance);
  }

  const finalAccount = openingBalance > 0 ? (await dbInstance.getAccounts(Number(client_id))).find((a) => a.account_id === newAccount.account_id)! : newAccount;
  res.status(201).json(finalAccount);
});

app.put("/api/accounts/:id", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const accountId = Number(req.params.id);
  const { account_name, account_type, account_code, balance } = req.body;

  if (account_type !== undefined && !ACCOUNT_TYPES.includes(account_type)) {
    return res.status(400).json({ message: `account_type must be one of: ${ACCOUNT_TYPES.join(", ")}.` });
  }
  if (account_name !== undefined && !String(account_name).trim()) {
    return res.status(400).json({ message: "account_name cannot be empty." });
  }
  if (balance !== undefined && (!Number.isFinite(Number(balance)) || Number(balance) < 0)) {
    return res.status(400).json({ message: "Opening balance must be a non-negative number — enter how much this account currently holds, not a debit/credit-signed amount." });
  }

  try {
    const updated = await dbInstance.updateAccount(accountId, {
      account_name: account_name !== undefined ? String(account_name).trim() : undefined,
      account_type,
      account_code: account_code !== undefined ? String(account_code).trim() : undefined,
      // balance intentionally left out here — handled below via a real posted
      // adjustment (postOpeningBalance) instead of writing the number directly onto
      // the row, so it stays a traceable, balanced transaction like everything else.
    });
    if (!updated) {
      return res.status(404).json({ message: "Account not found." });
    }

    let finalAccount = updated;
    if (balance !== undefined) {
      const delta = Number(balance) - updated.balance;
      if (delta !== 0) {
        const ledger = await dbInstance.getGeneralLedger();
        if (ledger.some((g) => g.account_id === accountId)) {
          return res.status(400).json({ message: "This account already has posted transactions — its opening balance can't be edited directly anymore. Post a journal entry to adjust it instead." });
        }
        await postOpeningBalance(updated.client_id, updated, delta);
        const refreshed = (await dbInstance.getAccounts(updated.client_id)).find((a) => a.account_id === accountId);
        if (refreshed) finalAccount = refreshed;
      }
    }

    await dbInstance.logAudit(req.user.user_id, `Edited chart-of-accounts entry: ${finalAccount.account_name} (${finalAccount.account_type})`, "accounts", accountId);
    res.json(finalAccount);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/journal", authenticateToken, async (req: any, res) => {
  const clientId = Number(req.query.clientId);
  if (!clientId) {
    return res.status(400).json({ message: "clientId query parameter required." });
  }

  if (req.user.role === "client") {
    const prof = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!prof || prof.client_id !== clientId) {
      return res.status(403).json({ message: "Unauthorized journal access." });
    }
  }

  const [entries, accounts] = await Promise.all([dbInstance.getJournalEntries(clientId), dbInstance.getAccounts(clientId)]);
  // Expand journal lines for each entry as structured transaction records
  const nestedEntries = await Promise.all(
    entries.map(async (e) => {
      const rawLines = await dbInstance.getJournalLines(e.journal_id);
      const lines = rawLines.map((l) => {
        const acct = accounts.find((a) => a.account_id === l.account_id);
        return {
          ...l,
          account_name: acct ? acct.account_name : "Unknown Account",
          account_type: acct ? acct.account_type : "asset",
        };
      });
      return {
        ...e,
        lines,
      };
    })
  );

  res.json(nestedEntries);
});

// Shared by create and edit: double-entry lines must reference a real account, use
// non-negative amounts, and balance (total debits === total credits).
function validateJournalLines(entry_date: string, lines: any): string | null {
  if (!entry_date || !lines || !Array.isArray(lines) || lines.length < 2) {
    return "Invalid accounting lines. Double entry ledger requires at least two items.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry_date) || isNaN(Date.parse(entry_date))) {
    return "entry_date must be a valid date in YYYY-MM-DD format.";
  }

  const hasInvalidLine = lines.some((item: any) => {
    const debit = Number(item.debit ?? 0);
    const credit = Number(item.credit ?? 0);
    return !item.account_id || !Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0;
  });
  if (hasInvalidLine) {
    return "Each ledger line requires an account and non-negative debit/credit amounts.";
  }
  const hasMissingNarration = lines.some((item: any) => !item.narration || !String(item.narration).trim());
  if (hasMissingNarration) {
    return "Each ledger line requires its own narration (e.g. \"payment of rent\").";
  }

  const totalDebits = lines.reduce((sum: number, item: any) => sum + Number(item.debit || 0), 0);
  const totalCredits = lines.reduce((sum: number, item: any) => sum + Number(item.credit || 0), 0);
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    return `Unbalanced transaction! Total Debits (₱${totalDebits.toLocaleString()}) must match Total Credits (₱${totalCredits.toLocaleString()}).`;
  }

  return null;
}

// Every posted line's account_id must belong to the journal's own client_id — without
// this, a stale account list (e.g. the client dropdown switched faster than its
// accounts fetch resolved) could silently post a transaction against a different
// client's chart of accounts, corrupting their balances.
async function validateLinesBelongToClient(clientId: number, lines: { account_id: number }[]): Promise<string | null> {
  const clientAccounts = await dbInstance.getAccounts(clientId);
  const validIds = new Set(clientAccounts.map((a) => a.account_id));
  const foreignLine = lines.find((l) => !validIds.has(Number(l.account_id)));
  if (foreignLine) {
    return "One or more selected accounts do not belong to this client. Please refresh and try again.";
  }
  return null;
}

app.post("/api/journal", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const { client_id, entry_date, description, lines } = req.body;

  if (!client_id || !description) {
    return res.status(400).json({ message: "client_id and description are required." });
  }
  const validationError = validateJournalLines(entry_date, lines);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }
  const ownershipError = await validateLinesBelongToClient(Number(client_id), lines);
  if (ownershipError) {
    return res.status(400).json({ message: ownershipError });
  }

  try {
    const newEntry = await dbInstance.addJournalEntry(Number(client_id), entry_date, description, lines);
    await dbInstance.logAudit(req.user.user_id, `Created journal credit/debit transaction: ${description} (${newEntry.reference})`, "journal_entries", newEntry.journal_id);
    res.status(201).json(newEntry);
  } catch (error: any) {
    res.status(500).json({ message: "Journal posting compiled crash: " + error.message });
  }
});

app.put("/api/journal/:id", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const journalId = Number(req.params.id);
  const entries = await dbInstance.getJournalEntries();
  const existing = entries.find((e) => e.journal_id === journalId);
  if (!existing) {
    return res.status(404).json({ message: "Journal entry not found." });
  }

  const { entry_date, description, lines } = req.body;
  if (!description) {
    return res.status(400).json({ message: "description is required." });
  }
  const validationError = validateJournalLines(entry_date, lines);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }
  const ownershipError = await validateLinesBelongToClient(existing.client_id, lines);
  if (ownershipError) {
    return res.status(400).json({ message: ownershipError });
  }

  try {
    const updated = (await dbInstance.updateJournalEntry(journalId, entry_date, description, lines))!;
    await dbInstance.logAudit(req.user.user_id, `Edited journal transaction: ${description} (${updated.reference})`, "journal_entries", journalId);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ message: "Journal edit compiled crash: " + error.message });
  }
});

// Posted transactions can never be hard-deleted — that would let a bookkeeper erase
// evidence of a mistake instead of correcting it on the record. Corrections must go
// through PUT /api/journal/:id (an edit), which is fully audit-logged.
app.delete("/api/journal/:id", authenticateToken, requireRole("bookkeeper"), async (_req: any, res) => {
  res.status(403).json({ message: "Deleting posted transactions is disabled to protect financial integrity. Use Edit to correct a posted entry — every change is tracked in the audit log." });
});

// --- BATCH JOURNAL IMPORT (Excel) ---

app.get("/api/journal/import/template", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const clientId = Number(req.query.clientId);
  if (!clientId) {
    return res.status(400).json({ message: "clientId query parameter required." });
  }
  const accounts = await dbInstance.getAccounts(clientId);
  const buffer = buildImportTemplate(accounts);
  res.setHeader("Content-Disposition", `attachment; filename="DigiBok_Journal_Import_Template.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
});

// Dry-run only — parses and validates the uploaded sheet against this client's real
// Chart of Accounts, but never touches the database. The bookkeeper reviews the returned
// preview (unmapped accounts, missing narrations, per-entry and whole-file balance) before
// anything is posted.
app.post("/api/journal/import/preview", authenticateToken, requireRole("bookkeeper"), importUpload.single("file"), async (req: any, res) => {
  const clientId = Number(req.body.clientId);
  if (!clientId) {
    return res.status(400).json({ message: "clientId is required." });
  }
  if (!req.file) {
    return res.status(400).json({ message: "Please attach an .xlsx or .xls file." });
  }

  try {
    const accounts = await dbInstance.getAccounts(clientId);
    const result = parseAndValidateImport(req.file.buffer, accounts);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: "Couldn't read that spreadsheet — please use the provided template. (" + error.message + ")" });
  }
});

// Re-parses and re-validates the same re-uploaded file from scratch (never trusts a
// client-submitted "this was already validated" claim) and, only if it's fully clean,
// posts one journal entry per date-group inside a single all-or-nothing transaction.
app.post("/api/journal/import/confirm", authenticateToken, requireRole("bookkeeper"), importUpload.single("file"), async (req: any, res) => {
  const clientId = Number(req.body.clientId);
  if (!clientId) {
    return res.status(400).json({ message: "clientId is required." });
  }
  if (!req.file) {
    return res.status(400).json({ message: "Please attach an .xlsx or .xls file." });
  }

  let result;
  try {
    const accounts = await dbInstance.getAccounts(clientId);
    result = parseAndValidateImport(req.file.buffer, accounts);
  } catch (error: any) {
    return res.status(400).json({ message: "Couldn't read that spreadsheet — please use the provided template. (" + error.message + ")" });
  }

  if (result.hasErrors) {
    return res.status(400).json({ message: "This file still has errors or an unbalanced entry — re-check the preview before confirming.", ...result });
  }

  try {
    const entries = result.groups.map((g) => ({
      clientId,
      entry_date: g.date,
      description: `Batch import — ${req.file.originalname} (${g.date})`,
      lines: g.rows.map((r) => ({ account_id: r.accountId!, debit: r.debit, credit: r.credit, narration: r.narration })),
    }));
    const created = await dbInstance.addJournalEntriesBatch(entries);

    await dbInstance.logAudit(
      req.user.user_id,
      `Batch-imported ${created.length} journal entries (${result.rowCount} lines) from "${req.file.originalname}"`,
      "journal_entries",
      created[0]?.journal_id ?? clientId
    );

    res.status(201).json({ message: `Imported ${created.length} journal entries from ${result.rowCount} lines.`, entries: created });
  } catch (error: any) {
    res.status(500).json({ message: "Import posting failed: " + error.message });
  }
});

app.get("/api/ledger", authenticateToken, async (req: any, res) => {
  const clientId = Number(req.query.clientId);
  if (!clientId) {
    return res.status(400).json({ message: "clientId query parameter required." });
  }

  if (req.user.role === "client") {
    const prof = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!prof || prof.client_id !== clientId) {
      return res.status(403).json({ message: "Unauthorized general ledger access." });
    }
  }

  // Aggregate General Ledger lines by accounts
  const accounts = await dbInstance.getAccounts(clientId);
  const ledgerEntries = await dbInstance.getGeneralLedger(clientId);

  const aggregated = accounts.map((acct) => {
    // Rows are stored in insertion order, which drifts from chronological order once an
    // entry is backdated or an edit re-inserts its lines at the end — sort so the running
    // "balance" column (computed chronologically) reads top-to-bottom in date order.
    const lines = ledgerEntries
      .filter((l) => l.account_id === acct.account_id)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.journal_id - b.journal_id || a.ledger_id - b.ledger_id);
    return {
      account_id: acct.account_id,
      account_code: acct.account_code,
      account_name: acct.account_name,
      account_type: acct.account_type,
      current_balance: acct.balance,
      lines,
    };
  });

  res.json(aggregated);
});

// Chronological general ledger timeline (un-aggregated audit trail)
app.get("/api/ledger/lines", authenticateToken, async (req: any, res) => {
  const clientId = Number(req.query.clientId);
  if (!clientId) {
    return res.status(400).json({ message: "clientId query parameter required." });
  }

  if (req.user.role === "client") {
    const prof = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!prof || prof.client_id !== clientId) {
      return res.status(403).json({ message: "Unauthorized chronological access." });
    }
  }

  const entries = await dbInstance.getGeneralLedger(clientId);
  const sorted = entries
    .slice()
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.journal_id - a.journal_id || b.ledger_id - a.ledger_id); // latest first, chronologically
  res.json(sorted);
});

// 5a. Live Financial Statements (Trial Balance, Income Statement, Balance Sheet)
function isValidDateStr(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value));
}

async function checkClientLedgerAccess(req: any, res: any, clientId: number): Promise<boolean> {
  if (req.user.role === "client") {
    const prof = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!prof || prof.client_id !== clientId) {
      res.status(403).json({ message: "Unauthorized ledger credentials." });
      return false;
    }
  }
  return true;
}

app.get("/api/financials/trial-balance", authenticateToken, async (req: any, res) => {
  const clientId = Number(req.query.clientId);
  if (!clientId) return res.status(400).json({ message: "clientId query parameter required." });
  if (!(await checkClientLedgerAccess(req, res, clientId))) return;

  const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split("T")[0];
  if (!isValidDateStr(asOfDate)) {
    return res.status(400).json({ message: "asOfDate must be a valid date in YYYY-MM-DD format." });
  }
  res.json(await getTrialBalance(clientId, asOfDate));
});

app.get("/api/financials/income-statement", authenticateToken, async (req: any, res) => {
  const clientId = Number(req.query.clientId);
  if (!clientId) return res.status(400).json({ message: "clientId query parameter required." });
  if (!(await checkClientLedgerAccess(req, res, clientId))) return;

  const today = new Date().toISOString().split("T")[0];
  const startDate = (req.query.startDate as string) || `${new Date().getFullYear()}-01-01`;
  const endDate = (req.query.endDate as string) || today;
  if (!isValidDateStr(startDate) || !isValidDateStr(endDate)) {
    return res.status(400).json({ message: "startDate and endDate must be valid dates in YYYY-MM-DD format." });
  }
  res.json(await getIncomeStatement(clientId, startDate, endDate));
});

app.get("/api/financials/balance-sheet", authenticateToken, async (req: any, res) => {
  const clientId = Number(req.query.clientId);
  if (!clientId) return res.status(400).json({ message: "clientId query parameter required." });
  if (!(await checkClientLedgerAccess(req, res, clientId))) return;

  const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split("T")[0];
  if (!isValidDateStr(asOfDate)) {
    return res.status(400).json({ message: "asOfDate must be a valid date in YYYY-MM-DD format." });
  }
  res.json(await getBalanceSheet(clientId, asOfDate));
});

// 5b. Payments Module
app.get("/api/payments", authenticateToken, async (req: any, res) => {
  const isBookkeeper = req.user.role === "bookkeeper";
  let targetClientId: number | undefined = undefined;

  if (!isBookkeeper) {
    const clientProf = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!clientProf) return res.json([]);
    targetClientId = clientProf.client_id;
  }

  const payments = await dbInstance.getPayments(targetClientId);
  res.json(payments.slice().reverse()); // latest submissions first
});

const PAYMENT_METHODS = ["cash", "gcash", "bank_transfer", "check", "other"] as const;

app.post("/api/payments", authenticateToken, receiptUpload.single("file"), async (req: any, res) => {
  const { client_id, obligation_type, obligation_id, amount, payment_date, payment_method, reference_number, notes } = req.body;
  const file = req.file;
  const fail = (status: number, message: string) => {
    if (file) { try { fs.unlinkSync(file.path); } catch {} }
    return res.status(status).json({ message });
  };

  // "service_fee" (the client's own bookkeeper compensation) has no backing tax/permit
  // record, so obligation_id is a fixed sentinel (0) rather than a real record id.
  const isServiceFee = obligation_type === "service_fee";
  if (!obligation_type || (!isServiceFee && !obligation_id) || !amount || !payment_date || !payment_method || !reference_number) {
    return fail(400, "Please complete all required payment fields (obligation, amount, date, payment method, reference #).");
  }
  if (!["tax", "permit", "service_fee"].includes(obligation_type)) {
    return fail(400, "Invalid obligation type.");
  }
  if (!PAYMENT_METHODS.includes(payment_method)) {
    return fail(400, `payment_method must be one of: ${PAYMENT_METHODS.join(", ")}.`);
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return fail(400, "Amount must be a positive number.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payment_date) || isNaN(Date.parse(payment_date))) {
    return fail(400, "payment_date must be a valid date in YYYY-MM-DD format.");
  }

  const isBookkeeperSubmitting = req.user.role === "bookkeeper";
  let targetClientId: number;
  if (!isBookkeeperSubmitting) {
    const clientProf = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!clientProf) return fail(404, "Client profile not found.");
    targetClientId = clientProf.client_id;
  } else {
    if (!client_id) return fail(400, "client_id is required when a bookkeeper records a payment.");
    targetClientId = Number(client_id);
    const clientProfiles = await dbInstance.getClientProfiles();
    if (!clientProfiles.some((c) => c.client_id === targetClientId && c.status === "active")) {
      return fail(404, "Client not found.");
    }
  }

  // Resolve the underlying obligation to capture its label and verify it belongs to this client
  let obligationLabel = "";
  let obligationId = 0;
  if (obligation_type === "tax") {
    const taxRecords = await dbInstance.getTaxRecords(targetClientId);
    const tax = taxRecords.find((t) => t.tax_id === Number(obligation_id));
    if (!tax) return fail(404, "Tax obligation not found for this client.");
    obligationLabel = tax.tax_type;
    obligationId = tax.tax_id;
  } else if (obligation_type === "permit") {
    const permitRecords = await dbInstance.getPermitRecords(targetClientId);
    const permit = permitRecords.find((p) => p.permit_id === Number(obligation_id));
    if (!permit) return fail(404, "Permit obligation not found for this client.");
    obligationLabel = permit.permit_type;
    obligationId = permit.permit_id;
  } else {
    obligationLabel = "Bookkeeper Service Fee";
    obligationId = 0;
  }

  // Prevent duplicate pending submissions against the same obligation
  const existingPayments = await dbInstance.getPayments(targetClientId);
  const duplicate = existingPayments.find((p) => p.obligation_type === obligation_type && p.obligation_id === obligationId && p.status === "pending");
  if (duplicate) {
    return fail(400, "A payment for this obligation is already pending bookkeeper review.");
  }

  const newPayment = await dbInstance.addPayment({
    client_id: targetClientId,
    obligation_type,
    obligation_id: obligationId,
    obligation_label: obligationLabel,
    amount: Number(amount),
    payment_date,
    payment_method,
    reference_number,
    notes: notes || "",
    receipt_file_name: file ? file.filename : undefined,
    receipt_original_name: file ? file.originalname : undefined,
    receipt_mime_type: file ? file.mimetype : undefined,
  });

  // A bookkeeper recording a payment directly (e.g. cash collected in person) needs no
  // separate review step — they entering it themselves already is the verification — so
  // it posts to the ledger immediately instead of sitting pending self-confirmation.
  if (isBookkeeperSubmitting) {
    await dbInstance.logAudit(req.user.user_id, `Recorded payment for ${obligationLabel} (Ref# ${reference_number})`, "payments", newPayment.payment_id);
    try {
      const confirmed = await dbInstance.confirmPayment(newPayment.payment_id, req.user.user_id, true);
      return res.status(201).json(confirmed);
    } catch (error: any) {
      return res.status(500).json({ message: "Payment confirmation failed: " + error.message });
    }
  }

  await dbInstance.logAudit(req.user.user_id, `Submitted payment for ${obligationLabel} (Ref# ${reference_number})`, "payments", newPayment.payment_id);

  // Alert every bookkeeper user that a payment is awaiting confirmation
  const clientProfiles = await dbInstance.getClientProfiles();
  const client = clientProfiles.find((c) => c.client_id === targetClientId);
  const users = await dbInstance.getUsers();
  for (const bk of users.filter((u) => u.role === "bookkeeper")) {
    await dbInstance.addNotification(
      bk.user_id,
      `${client?.business_name || "A client"} submitted a payment of ₱${Number(amount).toLocaleString()} for "${obligationLabel}" — awaiting confirmation.`,
      "info",
      "payments"
    );
  }

  res.status(201).json(newPayment);
});

app.put("/api/payments/:id/confirm", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const paymentId = Number(req.params.id);
  try {
    const updated = await dbInstance.confirmPayment(paymentId, req.user.user_id, true);
    res.json(updated);
  } catch (error: any) {
    if (error.message === "Payment record not found.") {
      return res.status(404).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.put("/api/payments/:id/reject", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const paymentId = Number(req.params.id);
  const { rejection_reason } = req.body;
  const payment = await dbInstance.getPayment(paymentId);
  if (!payment) return res.status(404).json({ message: "Payment record not found." });
  if (payment.status !== "pending") {
    return res.status(400).json({ message: `This payment has already been ${payment.status}.` });
  }

  const combinedNotes = rejection_reason
    ? `${payment.notes ? payment.notes + " | " : ""}Rejected: ${rejection_reason}`
    : payment.notes;

  const updated = await dbInstance.updatePayment(paymentId, {
    status: "rejected",
    reviewed_at: new Date().toISOString(),
    notes: combinedNotes,
  });

  await dbInstance.logAudit(
    req.user.user_id,
    `Rejected payment submission for ${payment.obligation_label} (Ref# ${payment.reference_number})`,
    "payments",
    paymentId
  );

  const clientProfiles = await dbInstance.getClientProfiles();
  const client = clientProfiles.find((c) => c.client_id === payment.client_id);
  if (client) {
    await dbInstance.addNotification(
      client.user_id,
      `Your payment submission for "${payment.obligation_label}" (Ref# ${payment.reference_number}) was rejected. Please review and resubmit.`,
      "alert",
      "payments"
    );
  }

  res.json(updated);
});

app.get("/api/payments/:id/receipt", authenticateToken, async (req: any, res) => {
  const paymentId = Number(req.params.id);
  const payment = await dbInstance.getPayment(paymentId);
  if (!payment) return res.status(404).json({ message: "Payment record not found." });

  if (req.user.role === "client") {
    const clientProf = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!clientProf || clientProf.client_id !== payment.client_id) {
      return res.status(403).json({ message: "Unauthorized receipt access." });
    }
  }
  if (!payment.receipt_file_name) {
    return res.status(404).json({ message: "No proof of payment was attached to this record." });
  }

  const resolvedPath = path.join(RECEIPTS_DIR, payment.receipt_file_name);
  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).json({ message: "File physically missing from storage." });
  }

  res.setHeader("Content-Disposition", `inline; filename="${payment.receipt_original_name}"`);
  res.setHeader("Content-Type", payment.receipt_mime_type || "application/octet-stream");
  res.sendFile(resolvedPath);
});

// 6. Report Generation & Streams
app.get("/api/reports", authenticateToken, async (req: any, res) => {
  const clientId = Number(req.query.clientId);
  if (!clientId) {
    return res.status(400).json({ message: "clientId parameter required." });
  }

  if (req.user.role === "client") {
    const prof = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!prof || prof.client_id !== clientId) return res.json([]);
  }

  const reports = await dbInstance.getReports(clientId);
  res.json(reports);
});

app.post("/api/reports/generate", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const { client_id, report_type, period, start_date, end_date, as_of_date } = req.body;

  if (!client_id || !report_type || !period) {
    return res.status(400).json({ message: "Please specify client ID, report type, and accounting period." });
  }

  try {
    const fileResult = await generateReportPDF({
      clientId: Number(client_id),
      reportType: report_type,
      period,
      startDate: start_date,
      endDate: end_date,
      asOfDate: as_of_date,
    });

    const reportRec = await dbInstance.addReport({
      client_id: Number(client_id),
      report_type,
      period,
      file_path: fileResult.fileName, // Store file reference name
      file_size: fileResult.fileSize,
    });

    await dbInstance.logAudit(req.user.user_id, `Generated financial report file: ${report_type} (${period})`, "reports", reportRec.report_id);
    res.json(reportRec);
  } catch (error: any) {
    res.status(500).json({ message: "PDF construction engine failed: " + error.message });
  }
});

app.get("/api/reports/:id/download", authenticateToken, async (req: any, res) => {
  const reportId = Number(req.params.id);
  const reports = await dbInstance.getReports();
  const report = reports.find((r) => r.report_id === reportId);

  if (!report) {
    return res.status(404).json({ message: "Document not registered." });
  }

  if (req.user.role === "client") {
    const prof = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!prof || prof.client_id !== report.client_id) {
      return res.status(403).json({ message: "Unauthorized document access." });
    }
  }

  const resolvedPath = path.join(process.cwd(), "uploads", report.file_path);
  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).json({ message: "File physically deleted or not constructed properly on sandboxed container storage." });
  }

  res.setHeader("Content-Disposition", `attachment; filename="${report.file_path}"`);
  res.setHeader("Content-Type", "application/pdf");

  res.sendFile(resolvedPath);
});

// Emails an already-generated report PDF (as a real attachment, not a link) to whatever
// address the bookkeeper types in — e.g. an accredited accountant checking the books.
app.post("/api/reports/:id/email", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const reportId = Number(req.params.id);
  const { to } = req.body;
  if (!to || typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ message: "Please provide a valid recipient email address." });
  }

  const reports = await dbInstance.getReports();
  const report = reports.find((r) => r.report_id === reportId);
  if (!report) {
    return res.status(404).json({ message: "Report not found." });
  }

  const resolvedPath = path.join(process.cwd(), "uploads", report.file_path);
  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).json({ message: "The report file is missing from storage." });
  }

  const clientProfiles = await dbInstance.getClientProfiles();
  const client = clientProfiles.find((c) => c.client_id === report.client_id);

  try {
    await sendReportEmail(
      to,
      { businessName: client?.business_name || "Client", reportType: report.report_type, period: report.period },
      resolvedPath,
      report.file_path
    );
  } catch (e: any) {
    return res.status(500).json({ message: "Failed sending the report email: " + e.message });
  }

  await dbInstance.logAudit(req.user.user_id, `Emailed report "${report.report_type}" (${report.period}) to ${to}`, "reports", reportId);
  res.json({ message: `Report sent to ${to}.` });
});

app.delete("/api/reports/:id", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const reportId = Number(req.params.id);
  const deleted = await dbInstance.deleteReport(reportId);
  if (!deleted) {
    return res.status(404).json({ message: "Report information file not found." });
  }

  // Attempt to remove files from storage
  const filePath = path.join(process.cwd(), "uploads", deleted.file_path);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error("Failed to physical delete file:", e);
  }

  await dbInstance.logAudit(req.user.user_id, `Removed financial report entry: ${deleted.report_type}`, "reports", reportId);
  res.json({ success: true });
});

// 7. System User Notifications & Audit Logs
app.get("/api/notifications", authenticateToken, async (req: any, res) => {
  const list = await dbInstance.getNotifications(req.user.user_id);
  res.json(list.reverse()); // Latest notifications first
});

app.post("/api/notifications/read", authenticateToken, async (req: any, res) => {
  await dbInstance.markNotificationsRead(req.user.user_id);
  res.json({ success: true });
});

app.get("/api/audit-logs", authenticateToken, requireRole("bookkeeper"), async (req, res) => {
  const [auditLogs, users] = await Promise.all([dbInstance.getAuditLogs(), dbInstance.getUsers()]);
  const logs = auditLogs.map((l) => {
    const user = users.find((u) => u.user_id === l.user_id);
    return {
      ...l,
      user_name: user ? user.name : "System Daemon",
    };
  });
  res.json(logs.reverse());
});

// 8. Client Documents Module (BIR forms like 1701Q/2550M, certificates, and other file uploads)
app.get("/api/documents", authenticateToken, async (req: any, res) => {
  const isBookkeeper = req.user.role === "bookkeeper";
  let targetClientId: number | undefined = undefined;

  if (!isBookkeeper) {
    const clientProf = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!clientProf) return res.json([]);
    targetClientId = clientProf.client_id;
  }

  const docs = await dbInstance.getDocuments(targetClientId);
  res.json(docs.slice().reverse()); // latest uploads first
});

app.post("/api/documents", authenticateToken, documentUpload.single("file"), async (req: any, res) => {
  const { client_id, document_type, label, notes } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "Please attach a file to upload." });
  }
  if (!document_type || !label) {
    return res.status(400).json({ message: "Please provide a document type and label." });
  }

  let targetClientId: number;
  if (req.user.role === "client") {
    const clientProf = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!clientProf) {
      fs.unlinkSync(file.path);
      return res.status(404).json({ message: "Client profile not found." });
    }
    targetClientId = clientProf.client_id;
  } else {
    if (!client_id) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ message: "client_id is required when a bookkeeper uploads a document." });
    }
    targetClientId = Number(client_id);
    const clientProfiles = await dbInstance.getClientProfiles();
    if (!clientProfiles.some((c) => c.client_id === targetClientId && c.status === "active")) {
      fs.unlinkSync(file.path);
      return res.status(404).json({ message: "Client not found." });
    }
  }

  const newDoc = await dbInstance.addDocument({
    client_id: targetClientId,
    document_type,
    label,
    file_name: file.filename,
    original_name: file.originalname,
    file_size: (file.size / 1024).toFixed(1) + " KB",
    mime_type: file.mimetype,
    uploaded_by: req.user.user_id,
    uploaded_by_role: req.user.role,
    notes: notes || "",
  });

  await dbInstance.logAudit(req.user.user_id, `Uploaded document: ${label} (${document_type})`, "documents", newDoc.document_id);

  // If a client uploaded it, let the bookkeeper(s) know a new file is waiting for them
  if (req.user.role === "client") {
    const clientProfiles = await dbInstance.getClientProfiles();
    const client = clientProfiles.find((c) => c.client_id === targetClientId);
    const users = await dbInstance.getUsers();
    for (const bk of users.filter((u) => u.role === "bookkeeper")) {
      await dbInstance.addNotification(bk.user_id, `${client?.business_name || "A client"} uploaded a document: "${label}" (${document_type}).`, "info", "documents");
    }
  }

  res.status(201).json(newDoc);
});

app.put("/api/documents/:id", authenticateToken, requireRole("bookkeeper"), documentUpload.single("file"), async (req: any, res) => {
  const documentId = Number(req.params.id);
  const existing = await dbInstance.getDocument(documentId);
  if (!existing) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json({ message: "Document not found." });
  }

  const { document_type, label, notes } = req.body;
  const update: any = {};
  if (document_type) update.document_type = document_type;
  if (label) update.label = label;
  if (notes !== undefined) update.notes = notes;

  // Optional file replacement
  if (req.file) {
    const oldPath = path.join(DOCUMENTS_DIR, existing.file_name);
    if (fs.existsSync(oldPath)) {
      try { fs.unlinkSync(oldPath); } catch (e) { console.error("Failed removing replaced file:", e); }
    }
    update.file_name = req.file.filename;
    update.original_name = req.file.originalname;
    update.file_size = (req.file.size / 1024).toFixed(1) + " KB";
    update.mime_type = req.file.mimetype;
  }

  const updated = await dbInstance.updateDocument(documentId, update);
  await dbInstance.logAudit(req.user.user_id, `Updated document record: ${updated?.label}`, "documents", documentId);
  res.json(updated);
});

app.delete("/api/documents/:id", authenticateToken, requireRole("bookkeeper"), async (req: any, res) => {
  const documentId = Number(req.params.id);
  const deleted = await dbInstance.deleteDocument(documentId);
  if (!deleted) {
    return res.status(404).json({ message: "Document not found." });
  }

  const filePath = path.join(DOCUMENTS_DIR, deleted.file_name);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.error("Failed to physically delete document file:", e);
  }

  await dbInstance.logAudit(req.user.user_id, `Deleted document: ${deleted.label}`, "documents", documentId);
  res.json({ success: true });
});

app.get("/api/documents/:id/download", authenticateToken, async (req: any, res) => {
  const documentId = Number(req.params.id);
  const doc = await dbInstance.getDocument(documentId);
  if (!doc) {
    return res.status(404).send("Document not registered.");
  }

  if (req.user.role === "client") {
    const clientProf = await dbInstance.getClientProfileByUserId(req.user.user_id);
    if (!clientProf || clientProf.client_id !== doc.client_id) {
      return res.status(403).send("Unauthorized document access.");
    }
  }

  const resolvedPath = path.join(DOCUMENTS_DIR, doc.file_name);
  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).send("File physically missing from storage.");
  }

  res.setHeader("Content-Disposition", `attachment; filename="${doc.original_name}"`);
  res.setHeader("Content-Type", doc.mime_type || "application/octet-stream");
  res.sendFile(resolvedPath);
});


// --- GLOBAL ERROR HANDLER (multer file-filter/size rejections, and any rejection
// forwarded here by the async-handler wrapper defined near the top of this file) ---
app.use((err: any, req: any, res: any, next: any) => {
  if (!err) {
    return next();
  }
  // A handler that already started responding before failing can't be given a new
  // status — hand it to Express's default handler to close the connection.
  if (res.headersSent) {
    return next(err);
  }
  // Multer rejections and explicitly-tagged validation errors describe something the
  // caller did wrong, so their message is safe and useful to return. Anything else is
  // an unexpected server fault (most often a failed query) — log it for the operator
  // and return a generic 500 rather than telling the client it sent a bad request.
  const isClientError = err.name === "MulterError" || err.status === 400 || err.statusCode === 400;
  if (isClientError) {
    return res.status(400).json({ message: err.message || "Request failed." });
  }
  console.error(`[DigiBok Error] ${req.method} ${req.originalUrl} —`, err);
  res.status(500).json({ message: "Something went wrong on our end. Please try again." });
});

// Last-resort guards. The wrapper above routes async route failures to the error
// handler, but a rejection raised outside a request (a background cron tick, a pool
// client dropped by the server) has nowhere to surface and would otherwise exit the
// process. Log and stay up: a degraded server still serves everyone whose request
// doesn't touch the broken dependency.
process.on("unhandledRejection", (reason) => {
  console.error("[DigiBok Error] Unhandled promise rejection —", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[DigiBok Error] Uncaught exception —", err);
});

// --- VITE MIDDLEWARE SETUP FOR DEV & PRODUCTION BUILD STATIC PATHS ---
async function startServer() {
  // Provision the database before binding, so the server never accepts a request it can
  // only answer with a query against tables that do not exist yet. No-ops once applied.
  await ensureSchema();

  // Deriving the mode from the running artifact rather than from NODE_ENV alone: dev runs
  // this file as BACKEND/server.ts under tsx, while the deployed build runs as the esbuilt
  // dist/server.cjs. A host that leaves NODE_ENV unset would otherwise boot a Vite dev
  // server in production — slow, memory-hungry, and dependent on frontend sources and dev
  // tooling that a built image has no reason to carry.
  const runningBuiltBundle = path.basename(process.argv[1] || "").endsWith(".cjs");
  const isProduction = process.env.NODE_ENV === "production" || runningBuiltBundle;

  if (!isProduction) {
    // Frontend source (index.html, vite.config.ts) now lives in FRONTEND/, a sibling of
    // this file's BACKEND/ — Vite's default config auto-discovery only searches cwd and
    // its ancestors, so root/configFile must be passed explicitly or it won't be found.
    const frontendRoot = path.join(process.cwd(), "FRONTEND");
    const vite = await createViteServer({
      root: frontendRoot,
      configFile: path.join(frontendRoot, "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[DigiBok Launch] Server running on port ${PORT}`);
  });

  // Without this listener a failed bind surfaces as an uncaught exception, which the
  // last-resort guard above logs and swallows — leaving a process that is alive but
  // listening on nothing. A server that cannot bind has no degraded mode worth keeping,
  // so report the cause in one line and exit non-zero.
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[DigiBok Launch] Port ${PORT} is already in use — another DigiBok dev server is ` +
        `probably still running. Stop it, or start this one with a different PORT.`
      );
    } else if (err.code === "EACCES") {
      console.error(`[DigiBok Launch] Not permitted to bind port ${PORT}. Choose a port above 1023.`);
    } else {
      console.error(`[DigiBok Launch] Could not start the server on port ${PORT} —`, err);
    }
    process.exit(1);
  });
}

// Startup is all-or-nothing: if the schema could not be applied or the frontend
// middleware failed to build, there is nothing worth serving. Without this catch the
// rejection reaches the guard above, which logs it and leaves a live process bound to
// nothing — the shape of failure a platform can only report as a 502 on every request.
startServer().catch((err) => {
  console.error("[DigiBok Startup] Server failed to start —", err);
  process.exit(1);
});
