import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const distDirectory = resolve(packageRoot, "dist");
const pluginServerDirectory = fileURLToPath(
  new URL("../../../plugins/threadwake/server/", import.meta.url),
);
const distBundlePath = resolve(distDirectory, "threadwake-mcp.mjs");
const pluginBundlePath = resolve(pluginServerDirectory, "threadwake-mcp.mjs");
const pluginNoticesPath = resolve(pluginServerDirectory, "THIRD_PARTY_NOTICES.txt");

await Promise.all([
  mkdir(distDirectory, { recursive: true }),
  mkdir(pluginServerDirectory, { recursive: true }),
]);

const result = await build({
  absWorkingDir: packageRoot,
  banner: {
    js: "#!/usr/bin/env node",
  },
  bundle: true,
  charset: "utf8",
  entryPoints: ["src/cli.ts"],
  format: "esm",
  legalComments: "eof",
  logLevel: "info",
  metafile: true,
  minify: false,
  outfile: distBundlePath,
  platform: "node",
  sourcemap: false,
  target: "node22",
  treeShaking: true,
  write: false,
});

const bundle = result.outputFiles?.find((output) => output.path === distBundlePath);
if (bundle === undefined) {
  throw new Error("The MCP build did not produce the expected dependency-bundled executable.");
}

const dependencyRoots = new Set();
for (const inputPath of Object.keys(result.metafile.inputs)) {
  const absoluteInputPath = resolve(packageRoot, inputPath);
  const marker = `${sep}node_modules${sep}`;
  const markerIndex = absoluteInputPath.lastIndexOf(marker);
  if (markerIndex === -1) {
    continue;
  }

  const dependencyPath = absoluteInputPath.slice(markerIndex + marker.length).split(sep);
  const packageParts = dependencyPath[0]?.startsWith("@")
    ? dependencyPath.slice(0, 2)
    : dependencyPath.slice(0, 1);
  if (packageParts.length === 0 || packageParts.some((part) => part === undefined || part === "")) {
    throw new Error(`Could not resolve the bundled package for ${inputPath}.`);
  }

  dependencyRoots.add(
    `${absoluteInputPath.slice(0, markerIndex + marker.length)}${packageParts.join(sep)}`,
  );
}

const noticeEntries = [];
for (const dependencyRoot of [...dependencyRoots].sort()) {
  const metadata = JSON.parse(await readFile(resolve(dependencyRoot, "package.json"), "utf8"));
  const files = await readdir(dependencyRoot);
  const licenseFile = files
    .filter((file) => /^(?:licen[cs]e|copying)(?:\..*)?$/i.test(file))
    .sort((left, right) => left.localeCompare(right))[0];
  if (
    typeof metadata.name !== "string" ||
    typeof metadata.version !== "string" ||
    typeof metadata.license !== "string" ||
    licenseFile === undefined
  ) {
    throw new Error(`Bundled dependency metadata or license text is incomplete at ${dependencyRoot}.`);
  }

  const licenseText = (await readFile(resolve(dependencyRoot, licenseFile), "utf8"))
    .replaceAll("\r\n", "\n")
    .trim();
  noticeEntries.push({
    key: `${metadata.name}@${metadata.version}`,
    text: [
      "===============================================================================",
      `${metadata.name}@${metadata.version}`,
      `Declared license: ${metadata.license}`,
      `Source license file: ${licenseFile}`,
      "-------------------------------------------------------------------------------",
      licenseText,
    ].join("\n"),
  });
}

noticeEntries.sort((left, right) => left.key.localeCompare(right.key));
const notices = [
  "Threadwake MCP bundled third-party notices",
  "",
  "This file is generated from the pinned dependency metadata and the esbuild input",
  "graph. It covers third-party code embedded in threadwake-mcp.mjs. It does not",
  "declare or grant a license for Threadwake's first-party source code.",
  "",
  ...noticeEntries.map((entry) => entry.text),
  "",
].join("\n");

await Promise.all([
  writeFile(distBundlePath, bundle.contents),
  writeFile(pluginBundlePath, bundle.contents),
  writeFile(pluginNoticesPath, notices, "utf8"),
]);
