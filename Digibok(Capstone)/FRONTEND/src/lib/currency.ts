// Shared currency formatter so every screen renders peso amounts identically: always
// 2 decimals, thousands separators, and accounting-style parentheses for negatives
// (₱-1,234.56 has no accounting convention; (₱1,234.56) does).
export function money(n: number): string {
  const abs = Math.abs(n);
  const formatted = `₱${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 ? `(${formatted})` : formatted;
}
