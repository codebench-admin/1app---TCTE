// Escapes a single value for CSV: wraps in quotes and doubles any inner
// quotes if the value contains a comma, quote, or newline.
function escapeCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// columns: [{ key, header }]; rows: array of plain objects
export function toCsv(columns, rows) {
  const header = columns.map(c => escapeCell(c.header)).join(',');
  const lines = rows.map(row => columns.map(c => escapeCell(row[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}
