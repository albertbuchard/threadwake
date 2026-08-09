#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (mode !== "production" && mode !== "qa") {
  throw new Error("Usage: node scripts/verify-build.mjs <production|qa>");
}

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(appRoot, "dist", mode === "qa" ? "qa" : "client");
const indexPath = path.join(buildRoot, "index.html");
const index = readFileSync(indexPath, "utf8");
const entryMatch = index.match(/<script[^>]+src="([^"]+\.js)"/u);
if (!entryMatch) throw new Error("No JavaScript entry was found in " + indexPath + ".");

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  });
}

const files = filesUnder(buildRoot).sort();
const scripts = files.filter((file) => file.endsWith(".js"));
const scriptText = scripts.map((file) => readFileSync(file, "utf8")).join("\n");
const instrumentationMarkers = [
  "__THREADWAKE_MEASUREMENTS__",
  "threadwake-performance-mirror",
  "instrumentation-installed",
];
const markerState = Object.fromEntries(
  instrumentationMarkers.map((marker) => [marker, scriptText.includes(marker)]),
);
if (mode === "production" && Object.values(markerState).some(Boolean)) {
  throw new Error("Production build contains QA instrumentation: " + JSON.stringify(markerState));
}
if (mode === "qa" && Object.values(markerState).some((present) => !present)) {
  throw new Error("QA build omitted expected instrumentation: " + JSON.stringify(markerState));
}

const entryPath = path.join(buildRoot, entryMatch[1].replace(/^\//u, ""));
const entryBytes = statSync(entryPath).size;
const entryCeilingBytes = 444_077;
if (entryBytes > entryCeilingBytes) {
  throw new Error("Application entry is " + entryBytes + " bytes; ceiling is " + entryCeilingBytes + ".");
}
const records = files.map((file) => {
  const bytes = readFileSync(file);
  return path.relative(buildRoot, file).replaceAll(path.sep, "/")
    + "\0"
    + createHash("sha256").update(bytes).digest("hex")
    + "\n";
});
const digest = createHash("sha256").update(records.join("")).digest("hex");
const totalBytes = files.reduce((sum, file) => sum + statSync(file).size, 0);

console.log(JSON.stringify({
  schemaVersion: "threadwake-app-build-verification/v1",
  mode,
  fileCount: files.length,
  totalBytes,
  entryBytes,
  entryCeilingBytes,
  instrumentationMarkers: markerState,
  manifestDigestSha256: digest,
}, null, 2));
