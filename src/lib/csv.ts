/** Minimal, dependency-free CSV parsing that copes with quoted fields and CRLF. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();
  if (!clean) return { headers: [], rows: [] };

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += char;
  }
  record.push(field);
  records.push(record);

  const [headerRow, ...dataRows] = records;
  const headers = headerRow.map((h) => h.trim());
  const rows = dataRows
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { headers, rows };
}

export function toCsv(rows: Record<string, unknown>[], headers?: string[]) {
  if (!rows.length) return (headers ?? []).join(',');
  const cols = headers ?? Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => escape(r[c])).join(','))].join('\n');
}

export const STUDENT_IMPORT_TEMPLATE = [
  'admissionNumber,firstName,lastName,gender,dateOfBirth,bloodGroup,addressLine,city,className,sectionName,rollNumber,guardianName,guardianPhone,guardianRelation',
  'DPA-2001,Rahul,Sharma,MALE,2015-06-12,B+,42 Green Park,New Delhi,Class 5,A,1,Rajesh Sharma,9810000001,FATHER',
  'DPA-2002,Sneha,Verma,FEMALE,2015-09-03,O+,17 Hauz Khas,New Delhi,Class 5,A,2,Nitin Verma,9810000002,FATHER',
].join('\n');
