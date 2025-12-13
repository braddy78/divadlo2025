#!/usr/bin/env node
/**
 * Build shows.json from shows.csv for GitHub Pages.
 * - Input:  data/shows.csv
 * - Output: data/shows.json
 *
 * CSV columns (header row required):
 * Datum,Nazev,Soubor,Misto,Mesto,Hostovacka,StazenoZR,Zanry,Hodnoceni,Komentar
 *
 * Notes:
 * - Hostovacka / StazenoZR: A/N (case-insensitive). Blank -> N.
 * - Zanry can contain multiple values separated by: ; | ,   (e.g. "činohra;site specific")
 * - Hodnoceni: number 0-100 (blank allowed)
 */

import fs from "node:fs";
import path from "node:path";

const INPUT = path.join("data", "shows.csv");
const OUTPUT = path.join("data", "shows.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ",") {
      row.push(cur);
      cur = "";
      i += 1;
      continue;
    }

    if (ch === "\n") {
      row.push(cur);
      cur = "";
      // ignore empty trailing line
      if (row.some(c => c.trim() !== "")) rows.push(row);
      row = [];
      i += 1;
      continue;
    }

    if (ch === "\r") {
      i += 1;
      continue;
    }

    cur += ch;
    i += 1;
  }

  // last cell
  row.push(cur);
  if (row.some(c => c.trim() !== "")) rows.push(row);

  return rows;
}

function normBool(v) {
  const t = (v || "").trim().toUpperCase();
  return t === "A" || t === "Y" || t === "YES" || t === "TRUE" || t === "1";
}

function splitGenres(v) {
  const raw = (v || "").trim();
  if (!raw) return [];
  // allow comma inside quoted cell; split after CSV parsing
  return raw
    .split(/[;|,]/g)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.toLowerCase());
}

function toNumberOrNull(v) {
  const t = (v || "").trim().replace("%", "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`Missing ${INPUT}`);
    process.exit(1);
  }
  const csvText = fs.readFileSync(INPUT, "utf8");
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    console.error("CSV is empty (need header + at least one row).");
    process.exit(1);
  }

  const header = rows[0].map(h => (h || "").trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const required = ["Datum","Nazev","Soubor","Misto","Mesto","Hostovacka","StazenoZR","Zanry","Hodnoceni","Komentar"];
  const missing = required.filter(r => idx[r] === undefined);
  if (missing.length) {
    console.error("Missing columns in CSV header:", missing.join(", "));
    console.error("Found header:", header.join(" | "));
    process.exit(1);
  }

  const shows = rows.slice(1).map((r, rowIndex) => {
    const get = (name) => (r[idx[name]] ?? "").trim();

    const date = get("Datum");
    const title = get("Nazev");
    const theatre = get("Soubor");
    const place = get("Misto");
    const city = get("Mesto");
    const host = normBool(get("Hostovacka"));
    const removed = normBool(get("StazenoZR"));
    const genres = splitGenres(get("Zanry"));
    const rating = toNumberOrNull(get("Hodnoceni"));
    const comment = get("Komentar");

    if (!date || !title) {
      console.warn(`Row ${rowIndex+2}: missing Datum or Nazev -> skipped`);
      return null;
    }

    return { date, title, theatre, place, city, host, removed, genres, rating, comment };
  }).filter(Boolean);

  const out = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "data/shows.csv",
    shows
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote ${OUTPUT} (${shows.length} shows)`);
}

main();
