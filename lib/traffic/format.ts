const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const small = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const tiny = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 2 });

/** Short form for tables: 1.2K, 3.4M, 0.28. */
export function formatRate(n: number) {
  if (n === 0) return "0";
  if (n < 0.01) return tiny.format(n);
  if (n < 10) return small.format(n);
  if (n < 10000) return full.format(n);
  return compact.format(n);
}

/** Exact form for tooltips. */
export function formatExact(n: number) {
  return n < 10 ? small.format(n) : full.format(n);
}
