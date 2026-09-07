/**
 * Imports the couple's guest-list CSV into Convex.
 *
 *   pnpm tsx tools/import-guests.ts <csv-path> [--dry-run]
 *
 * `--dry-run` parses and reports without touching the deployment, and needs no
 * network access — run it first, read the warnings, then run it for real.
 */

import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import process from "node:process";

import { api } from "../convex/_generated/api.js";
import { GuestCsvError, type ParsedParty, parseGuestCsv } from "../src/lib/guest-csv.ts";

const USAGE = "Usage: pnpm tsx tools/import-guests.ts <csv-path> [--dry-run]";

/**
 * Minimal `.env.local` reader. The importer is run by hand, so it should not depend on
 * whichever dotenv wrapper the dev script happens to use.
 */
function readConvexUrl(): string {
  const fromEnv = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL;
  if (fromEnv) return fromEnv;

  let contents: string;
  try {
    contents = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    throw new Error("No VITE_CONVEX_URL in the environment and no .env.local to read it from.");
  }

  for (const line of contents.split("\n")) {
    const match = /^\s*(?:export\s+)?VITE_CONVEX_URL\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = (match[1] ?? "").trim().replace(/^["']|["']$/g, "");
    if (value) return value;
  }

  throw new Error("VITE_CONVEX_URL is not set in .env.local.");
}

function countBy<K extends string>(rows: readonly ParsedParty[], pick: (row: ParsedParty) => K): string {
  const counts = new Map<K, number>();
  for (const row of rows) counts.set(pick(row), (counts.get(pick(row)) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${key} ${count}`)
    .join(", ");
}

function printParseReport(path: string, rows: readonly ParsedParty[], warnings: readonly string[]): void {
  const namedSeats = rows.reduce((total, row) => total + row.headCount, 0);
  const plusOnes = rows.filter((row) => row.plusOneAllowed).length;

  console.log(`Source:            ${path}`);
  console.log(`Parties parsed:    ${rows.length}`);
  console.log(`Named seats:       ${namedSeats}`);
  console.log(`Plus-ones allowed: ${plusOnes}`);
  console.log(`Maximum guests:    ${namedSeats + plusOnes}`);
  console.log(`By wave:           ${countBy(rows, (row) => row.wave)}`);
  console.log(`By who:            ${countBy(rows, (row) => row.who)}`);
  console.log(`By link:           ${countBy(rows, (row) => row.link)}`);
  console.log(`Save-the-date sent: ${rows.filter((row) => row.saveTheDateSent).length}`);
  console.log(`Early declines:     ${rows.filter((row) => row.earlyDecline).length}`);
  console.log(`With a note:        ${rows.filter((row) => row.note !== undefined).length}`);
  console.log(`With an email:      ${rows.filter((row) => row.contactEmail !== undefined).length}`);

  console.log(`\nWarnings: ${warnings.length}`);
  for (const warning of warnings) console.log(`  - ${warning}`);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const paths = args.filter((arg) => !arg.startsWith("--"));

  if (paths.length !== 1) {
    console.error(USAGE);
    return 1;
  }
  const [csvPath] = paths as [string];

  const { rows, warnings } = parseGuestCsv(readFileSync(csvPath, "utf8"));
  printParseReport(csvPath, rows, warnings);

  if (dryRun) {
    console.log("\nDRY RUN — nothing was written to Convex.");
    return 0;
  }

  const client = new ConvexHttpClient(readConvexUrl());
  const report = await client.mutation(api.parties.importParties, { rows });

  console.log("\nImported.");
  console.log(`  created:   ${report.created}`);
  console.log(`  updated:   ${report.updated}`);
  console.log(`  unchanged: ${report.unchanged}`);
  console.log(`  in the database but not in this CSV: ${report.missingFromCsv.length}`);
  for (const party of report.missingFromCsv) {
    console.log(`    - ${party.displayName} (${party.importKey})`);
  }
  for (const warning of report.warnings) console.log(`  ! ${warning}`);

  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  if (error instanceof GuestCsvError) {
    // The sheet needs fixing; say so plainly rather than dumping a stack trace.
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
