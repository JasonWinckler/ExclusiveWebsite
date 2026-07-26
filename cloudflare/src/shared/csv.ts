import { ApiError } from "./http";

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

function delimiterFor(text: string): "," | ";" {
  let comma = 0;
  let semicolon = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (character === "\r" || character === "\n")) {
      break;
    } else if (!quoted && character === ",") comma += 1;
    else if (!quoted && character === ";") semicolon += 1;
  }
  return semicolon > comma ? ";" : ",";
}

export function parseCsv(text: string, maxRows = 2_000, maxColumns = 64): CsvTable {
  const normalized = text.replace(/^\uFEFF/, "");
  if (!normalized || normalized.includes("\u0000")) throw new ApiError(400, "INVALID_CSV");
  const delimiter = delimiterFor(normalized);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]!;
    if (quoted) {
      if (character === '"') {
        if (normalized[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += character;
      continue;
    }
    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      row.push(cell);
      cell = "";
      if (row.length > maxColumns) throw new ApiError(400, "CSV_TOO_MANY_COLUMNS");
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && normalized[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      if (rows.length > maxRows + 1) throw new ApiError(400, "CSV_TOO_MANY_ROWS");
    } else cell += character;
  }
  if (quoted) throw new ApiError(400, "INVALID_CSV_QUOTES");
  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  if (rows.length < 2) throw new ApiError(400, "CSV_HAS_NO_TRANSACTIONS");
  const headers = rows.shift()!.map((header) => header.trim());
  if (
    headers.length < 2 || headers.length > maxColumns ||
    headers.some((header) => !header || header.length > 128) ||
    new Set(headers.map((header) => header.toLocaleLowerCase("de-DE"))).size !== headers.length
  ) throw new ApiError(400, "INVALID_CSV_HEADERS");
  if (rows.some((values) => values.length !== headers.length)) {
    throw new ApiError(400, "INCONSISTENT_CSV_COLUMNS");
  }
  return { headers, rows };
}
