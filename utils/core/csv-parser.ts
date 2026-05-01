export interface CsvRow {
  [header: string]: string;
}

export interface ParseCsvOptions {
  delimiter?: string;
  hasHeader?: boolean;
  skipEmptyLines?: boolean;
  trimFields?: boolean;
}

export interface ParseCsvResult {
  headers: string[];
  rows: CsvRow[];
  errors: string[];
}

export function parseCsv(text: string, options: ParseCsvOptions = {}): ParseCsvResult {
  const { delimiter = ',', hasHeader = true, skipEmptyLines = true, trimFields = true } = options;
  const rows: string[][] = [];
  const errors: string[] = [];
  let current = '';
  let inQuotes = false;
  let currentRow: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(trimFields ? current.trim() : current);
        current = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(trimFields ? current.trim() : current);
        if (char === '\r') i++;
        if (skipEmptyLines && currentRow.length === 1 && currentRow[0] === '') {
          currentRow = [];
          current = '';
          continue;
        }
        rows.push(currentRow);
        currentRow = [];
        current = '';
      } else if (char === '\r') {
        currentRow.push(trimFields ? current.trim() : current);
        if (skipEmptyLines && currentRow.length === 1 && currentRow[0] === '') {
          currentRow = [];
          current = '';
          continue;
        }
        rows.push(currentRow);
        currentRow = [];
        current = '';
      } else {
        current += char;
      }
    }
  }

  if (current || currentRow.length > 0) {
    currentRow.push(trimFields ? current.trim() : current);
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return { headers: [], rows: [], errors };
  }

  let headers: string[];
  let dataRows: string[][];

  if (hasHeader) {
    headers = rows[0];
    dataRows = rows.slice(1);
  } else {
    const maxCols = Math.max(...rows.map((r) => r.length));
    headers = Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`);
    dataRows = rows;
  }

  const parsedRows: CsvRow[] = [];
  for (const row of dataRows) {
    const obj: CsvRow = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = row[i] ?? '';
    }
    parsedRows.push(obj);
  }

  return { headers, rows: parsedRows, errors };
}

export function generateCsv(
  data: CsvRow[],
  options: { delimiter?: string; includeHeader?: boolean } = {}
): string {
  const { delimiter = ',', includeHeader = true } = options;
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const lines: string[] = [];

  if (includeHeader) {
    lines.push(headers.map((h) => escapeCsvField(h, delimiter)).join(delimiter));
  }

  for (const row of data) {
    const values = headers.map((h) => escapeCsvField(row[h] ?? '', delimiter));
    lines.push(values.join(delimiter));
  }

  return lines.join('\n');
}

function escapeCsvField(field: string, delimiter: string): string {
  if (field.includes(delimiter) || field.includes('"') || field.includes('\n') || field.includes('\r')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0];
  const candidates = [',', '\t', ';', '|'];
  let bestDelimiter = ',';
  let maxCount = 0;

  for (const delim of candidates) {
    const count = firstLine.split(delim).length;
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}
