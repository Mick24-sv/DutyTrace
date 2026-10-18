/**
 * RFC 4180 compliant CSV generator.
 * Properly escapes quotes, commas, newlines, and handles null/undefined values.
 *
 * @param {Array<{ header: string, key?: string, format?: (row: any) => any }>} columns
 * @param {Array<object>} rows
 * @returns {string}
 */
export function generateCsv(columns, rows) {
  const escapeCell = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = columns.map((c) => escapeCell(c.header)).join(',');
  const dataLines = rows.map((row) =>
    columns
      .map((c) => {
        const raw = c.format ? c.format(row) : c.key ? row[c.key] : '';
        return escapeCell(raw);
      })
      .join(','),
  );

  return [headerLine, ...dataLines].join('\r\n');
}

