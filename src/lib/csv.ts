import { z } from "zod";
import { email as emailSchema } from "@/lib/validation/schemas";

/**
 * Tiny CSV reader for the student import (name, email, credits). Handles quoted fields,
 * escaped quotes, CRLF line endings and an optional header row. No dependency needed.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, ""); // strip BOM from Excel exports
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === ";") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/**
 * Writes one CSV cell. Quotes values that need it, and neutralises spreadsheet formulas: a text cell that starts with
 * = + - @ (or a tab / carriage return) would be executed by Excel/Sheets, so it gets a leading apostrophe.
 * Real numbers (e.g. -5) are written as-is.
 */
export function csvCell(value: string | number): string {
  let v = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return /[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Rows to CSV text (CRLF line endings, UTF-8 BOM so Excel opens accents correctly). */
export function toCsv(rows: (string | number)[][]): string {
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export interface ImportRow { name: string; email: string; credits: number }
export interface ImportResult { rows: ImportRow[]; errors: { line: number; message: string }[] }

const rowSchema = z.object({
  name: z.string().trim().min(1, "Name is missing").max(80),
  email: emailSchema,
  credits: z.coerce.number().int().min(0, "Credits must be 0 or more").max(100, "Credits must be 100 or fewer"),
});

export const MAX_IMPORT_ROWS = 200;

/** Parse + validate CSV text. Columns: name, email, credits (credits optional). Duplicate emails are skipped. */
export function parseStudentCsv(text: string): ImportResult {
  const raw = parseCsv(text);
  const result: ImportResult = { rows: [], errors: [] };
  if (!raw.length) return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };

  // Skip a header row like "name,email,credits"
  const hasHeader = /name/i.test(raw[0][0] ?? "") && /mail/i.test(raw[0][1] ?? "");
  const body = hasHeader ? raw.slice(1) : raw;
  if (body.length > MAX_IMPORT_ROWS) return { rows: [], errors: [{ line: 1, message: `Please import at most ${MAX_IMPORT_ROWS} students at a time.` }] };

  const seen = new Set<string>();
  body.forEach((cells, i) => {
    const line = i + 1 + (hasHeader ? 1 : 0);
    const parsed = rowSchema.safeParse({ name: cells[0] ?? "", email: cells[1] ?? "", credits: (cells[2] ?? "").trim() === "" ? 0 : cells[2] });
    if (!parsed.success) return result.errors.push({ line, message: parsed.error.issues[0]?.message ?? "Invalid row" });
    if (seen.has(parsed.data.email)) return result.errors.push({ line, message: `${parsed.data.email} appears twice` });
    seen.add(parsed.data.email);
    result.rows.push(parsed.data);
  });
  return result;
}
