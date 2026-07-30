const DATE_PATTERNS = [
  /^\d{4}-\d{1,2}-\d{1,2}([T ]\d{1,2}:\d{2}(:\d{2})?)?$/,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
  /^\d{1,2}-\d{1,2}-\d{2,4}$/,
  /^\d{4}\/\d{1,2}\/\d{1,2}$/,
  /^[A-Za-z]{3,9} \d{1,2},? \d{4}$/,
];

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
  if (!DATE_PATTERNS.some((re) => re.test(s))) return false;
  const t = Date.parse(s);
  return !isNaN(t);
}

function isIntegerValue(v) {
  if (typeof v === "number") return Number.isInteger(v);
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (s === "" || isNaN(s)) return false;
  return /^-?\d+$/.test(s);
}

function isDecimalValue(v) {
  if (typeof v === "number") return isFinite(v);
  if (typeof v !== "string") return false;
  const s = v.trim().replace(/,/g, "");
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
