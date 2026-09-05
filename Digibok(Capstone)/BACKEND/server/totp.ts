import crypto from "crypto";
import bcrypt from "bcryptjs";
import { generateSecret, generateURI, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";
import { verify as verifyTotpToken } from "@otplib/totp";

// otplib's root `verify()` is generic over TOTP/HOTP, so its return type omits
// `timeStep` (HOTP has no notion of time steps) even though we always pass the
// default "totp" strategy. Using @otplib/totp's own `verify` directly keeps the
// properly-narrowed result type so `result.timeStep` below type-checks. Unlike the
// root package's functional API, @otplib/totp does NOT default these plugins, so
// both must be passed explicitly or verification throws Base32PluginMissingError.
const cryptoPlugin = new NobleCryptoPlugin();
const base32Plugin = new ScureBase32Plugin();

const ISSUER = "DigiBok Sipocot";

// 20 random bytes (160-bit), Base32-encoded — the otplib default and the same
// strength Google Authenticator / Authy expect.
export function generateTotpSecret(): string {
  return generateSecret();
}

// otpauth:// URI for QR-code enrollment. Label is the bookkeeper's email so
// their authenticator app shows which account the code belongs to.
export function buildOtpauthUri(email: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

export interface TotpVerifyResult {
  valid: boolean;
  timeStep?: number;
}

// Verifies a 6-digit TOTP code against `secret`.
//
// - epochTolerance: 30 accepts the previous/current/next 30s window, absorbing
//   normal phone/server clock drift without widening the guessable window much.
// - afterTimeStep (when provided) rejects any code from a time step already
//   consumed by a prior successful verification — replay protection so a
//   code can't be reused if it were ever intercepted or shoulder-surfed.
export async function verifyTotpCode(secret: string, token: string, afterTimeStep?: number): Promise<TotpVerifyResult> {
  const cleaned = String(token || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) {
    return { valid: false };
  }

  const result = await verifyTotpToken({
    secret,
    token: cleaned,
    crypto: cryptoPlugin,
    base32: base32Plugin,
    epochTolerance: 30,
    afterTimeStep,
  });

  if (result.valid) {
    return { valid: true, timeStep: result.timeStep };
  }
  return { valid: false };
}

// Backup codes — for when the bookkeeper's phone is lost/dead/offline.
// No 0/O/1/I, matching the same transcription-safe alphabet used for client invite codes.
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateBackupCodes(count = 8): string[] {
  const part = () =>
    Array.from({ length: 5 }, () => BACKUP_CODE_ALPHABET[crypto.randomInt(BACKUP_CODE_ALPHABET.length)]).join("");
  return Array.from({ length: count }, () => `${part()}-${part()}`);
}

export function hashBackupCodes(codes: string[]): string[] {
  return codes.map((c) => bcrypt.hashSync(c, 10));
}

export function isBackupCodeFormat(input: string): boolean {
  return /^[A-Z0-9]{5}-[A-Z0-9]{5}$/i.test(input.trim());
}

// Returns the index of the matching hashed code (so the caller can splice it out —
// each backup code is single-use), or -1 if none match.
export function matchBackupCode(inputCode: string, hashedCodes: string[]): number {
  const normalized = inputCode.trim().toUpperCase();
  return hashedCodes.findIndex((hash) => bcrypt.compareSync(normalized, hash));
}
