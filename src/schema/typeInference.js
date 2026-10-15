const DATE_PATTERNS = [
  /^\d{4}-\d{1,2}-\d{1,2}([T ]\d{1,2}:\d{2}(:\d{2})?)?$/,
  /^\d{4}\/\d{1,2}\/\d{1,2}$/,
  /^[A-Za-z]{3,9} \d{1,2},? \d{4}$/,
];
// 15/01/2026, 01/15/2026, 15-01-26, 15.01.2026 (optionally with a time).
// Checked by hand because Date.parse reads these month-first and rejects any
// day-first date after the 12th.
const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})( \d{1,2}:\d{2}(:\d{2})?)?$/;
// 15-Jan-2026, 15 Jan 2026, 15-January-26
const DAY_MONTH_NAME_DATE = /^(\d{1,2})[- ]([A-Za-z]{3,9})[- ](\d{2}|\d{4})$/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const CURRENCY = /^[₹$€£]\s?/;

const BOOL_TRUE = new Set(["true", "yes", "y"]);
const BOOL_FALSE = new Set(["false", "no", "n"]);

function isBooleanValue(v) {
  if (typeof v === "boolean") return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return BOOL_TRUE.has(s) || BOOL_FALSE.has(s);
  }
  return false;
}

function isDateValue(v) {
  if (v instanceof Date && !isNaN(v)) return true;
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  const num = s.match(NUMERIC_DATE);
  if (num) {
    const a = +num[1], b = +num[2];
    return a >= 1 && b >= 1 && ((a <= 31 && b <= 12) || (a <= 12 && b <= 31));
  }
  const named = s.match(DAY_MONTH_NAME_DATE);
  if (named) return +named[1] >= 1 && +named[1] <= 31 && MONTHS.includes(named[2].slice(0, 3).toLowerCase());
  if (!DATE_PATTERNS.some((re) => re.test(s))) return false;
  return !isNaN(Date.parse(s));
}

// Numbers as people type them in spreadsheets: 1,250 / 1,23,456 / ₹1,250.50
function cleanNumber(s) {
  return s.trim().replace(CURRENCY, "").replace(/,/g, "");
}

function isIntegerValue(v) {
  if (typeof v === "number") return Number.isInteger(v);
  if (typeof v !== "string") return false;
  const s = cleanNumber(v);
  if (s === "" || isNaN(s)) return false;
  return /^-?\d+$/.test(s);
}

function isDecimalValue(v) {
  if (typeof v === "number") return isFinite(v);
  if (typeof v !== "string") return false;
  const s = cleanNumber(v);
  if (s === "" || isNaN(s)) return false;
  return /^-?\d*\.?\d+$/.test(s) || /^-?\d+\.?\d*$/.test(s);
}

/**
 * Infers a column type from a sample of raw values.
 * Returns one of: "integer" | "decimal" | "date" | "boolean" | "text"
 */
export function inferColumnType(values) {
  const sample = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== "").slice(0, 200);
  if (!sample.length) return "text";

  const allBool = sample.every(isBooleanValue);
  if (allBool) return "boolean";

  const allDate = sample.every(isDateValue);
  if (allDate) return "date";

  const allInt = sample.every(isIntegerValue);
  if (allInt) return "integer";

  const allDecimal = sample.every(isDecimalValue);
  if (allDecimal) return "decimal";

  return "text";
}

export function buildColumnsFromRows(rows, headerOrder) {
  const headers = headerOrder && headerOrder.length ? headerOrder : Object.keys(rows[0] || {});
  return headers.map((name) => {
    const values = rows.map((r) => r[name]);
    return { name, type: inferColumnType(values) };
  });
}
