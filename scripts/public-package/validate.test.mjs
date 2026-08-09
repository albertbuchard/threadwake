import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNoSymlinkedPath,
  CANONICAL_APP_IMPORT_PATH,
  CURRENT_FILES_PATH,
  loadRepositorySnapshot,
  PLACEMENT_EVIDENCE_PATH,
  PublicPackageValidationError,
  validatePublicPackageSnapshot,
} from "./validate.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const currentSnapshot = loadRepositorySnapshot(repositoryRoot);
const currentFileCount = currentSnapshot.files.size;

function cloneSnapshot(snapshot = currentSnapshot) {
  return {
    // Snapshot bytes are treated as immutable. Tests replace the one buffer they
    // mutate, so sharing all unchanged buffers avoids copying the bundled server
    // for every adversarial case.
    files: new Map(snapshot.files),
    symlinkPaths: new Set(snapshot.symlinkPaths),
  };
}

function mutateJson(path, mutate) {
  const snapshot = cloneSnapshot();
  const value = JSON.parse(snapshot.files.get(path).toString("utf8"));
  mutate(value);
  snapshot.files.set(path, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
  return snapshot;
}

function appendText(path, text) {
  const snapshot = cloneSnapshot();
  snapshot.files.set(path, Buffer.concat([snapshot.files.get(path), Buffer.from(text)]));
  return snapshot;
}

function mutateSkillFrontmatter(mutate) {
  const snapshot = cloneSnapshot();
  const path = "plugins/threadwake/skills/threadwake/SKILL.md";
  snapshot.files.set(path, Buffer.from(mutate(snapshot.files.get(path).toString("utf8"))));
  return snapshot;
}

function expectInvalid(snapshot, expected) {
  assert.throws(
    () => validatePublicPackageSnapshot(snapshot),
    (error) => error instanceof PublicPackageValidationError && expected.test(error.message),
  );
}

test("validates the exact current package metadata and file inventory", () => {
  assert.deepEqual(validatePublicPackageSnapshot(cloneSnapshot()), { fileCount: currentFileCount });
});

test("rejects a modified first-party license", () => {
  const snapshot = cloneSnapshot();
  snapshot.files.set("LICENSE", Buffer.from("Apache License 2.0\nmodified\n"));
  expectInvalid(snapshot, /unmodified official Apache License 2\.0 text/);
});

test("rejects unresolved public-policy placeholders", () => {
  expectInvalid(appendText("PRIVACY.md", "\n[APPROVAL REQUIRED]\n"), /unresolved draft or approval language/);
});

test("rejects a missing public support route", () => {
  const snapshot = cloneSnapshot();
  const contents = snapshot.files.get("SUPPORT.md").toString("utf8");
  snapshot.files.set("SUPPORT.md", Buffer.from(contents.replaceAll("https://github.com/albertbuchard/threadwake/issues", "")));
  expectInvalid(snapshot, /missing required public commitment/);
});

test("rejects non-HTTPS plugin policy metadata", () => {
  const snapshot = mutateJson("plugins/threadwake/.codex-plugin/plugin.json", (plugin) => {
    plugin.interface.privacyPolicyURL = "http://example.invalid/privacy";
  });
  expectInvalid(snapshot, /must be an absolute HTTPS URL/);
});

test("rejects drift in an exact canonical app import", () => {
  const snapshot = mutateJson(CANONICAL_APP_IMPORT_PATH, (manifest) => {
    manifest.allowlist.find((entry) => entry.destinationPath === "app/src/App.tsx").sourceSha256 = "0".repeat(64);
  });
  expectInvalid(snapshot, /exact import hash changed for app\/src\/App\.tsx/);
});

test("rejects drift in the released Codex task-link contract", () => {
  const snapshot = cloneSnapshot();
  snapshot.files.set("app/src/codex-task-links.ts", Buffer.from("export const drift = true;\n"));
  expectInvalid(snapshot, /exact import hash changed for app\/src\/codex-task-links\.ts/);
});

test("rejects private canonical input classes even when they target the public app", () => {
  const snapshot = mutateJson(CANONICAL_APP_IMPORT_PATH, (manifest) => {
    manifest.allowlist[0].sourcePath = "qa/private-runtime-receipt.json";
  });
  expectInvalid(snapshot, /private or release-only canonical input is forbidden/);
});

test("rejects non-public source repository identities in the public import manifest", () => {
  const snapshot = mutateJson(CANONICAL_APP_IMPORT_PATH, (manifest) => {
    manifest.source.repositoryPath = "parent/private-project";
    manifest.source.commit = "0".repeat(40);
  });
  expectInvalid(snapshot, /unknown key repositoryPath|unknown key commit/);
});

test("rejects an app file without import provenance", () => {
  const snapshot = cloneSnapshot();
  const path = "app/src/unreviewed.ts";
  snapshot.files.set(path, Buffer.from("export const unreviewed = true;\n"));
  const currentFiles = JSON.parse(snapshot.files.get(CURRENT_FILES_PATH).toString("utf8"));
  currentFiles.files.push(path);
  currentFiles.files.sort();
  snapshot.files.set(CURRENT_FILES_PATH, Buffer.from(`${JSON.stringify(currentFiles, null, 2)}\n`));
  expectInvalid(snapshot, /app file has no import provenance: app\/src\/unreviewed\.ts/);
});

test("rejects a failed nine-point placement result", () => {
  const snapshot = mutateJson(PLACEMENT_EVIDENCE_PATH, (receipt) => {
    receipt.scenarios[0].controls[10][6] = "111101111";
  });
  expectInvalid(snapshot, /all nine elementFromPoint and elementsFromPoint results must resolve/);
});

test("rejects a required control outside the active viewport", () => {
  const snapshot = mutateJson(PLACEMENT_EVIDENCE_PATH, (receipt) => {
    receipt.scenarios[1].controls[10][1][3] = 601;
  });
  expectInvalid(snapshot, /must be completely inside the active viewport/);
});

test("rejects a missing placement scenario", () => {
  const snapshot = mutateJson(PLACEMENT_EVIDENCE_PATH, (receipt) => {
    receipt.scenarios.pop();
  });
  expectInvalid(snapshot, /must contain the five required scenarios in the expected order/);
});

test("rejects a known hit code when it occludes the wrong control", () => {
  const snapshot = mutateJson(PLACEMENT_EVIDENCE_PATH, (receipt) => {
    receipt.scenarios[0].controls[0][4] = "AEEEEEEEE";
  });
  expectInvalid(snapshot, /contains an unexpected occluder for this control/);
});

for (const path of [
  ".github/workflows/unreviewed.yml",
  "packages/unreviewed/package.json",
  "docs/private-note.md",
  "docs/handoff-release.md",
]) {
  test(`rejects unexpected current-package path ${path}`, () => {
    const snapshot = cloneSnapshot();
    snapshot.files.set(path, Buffer.from("synthetic test content\n"));
    expectInvalid(snapshot, /unexpected repository file/);
  });
}

test("rejects a path omitted from the exact manifest", () => {
  const snapshot = mutateJson(CURRENT_FILES_PATH, (manifest) => {
    manifest.files = manifest.files.filter((path) => path !== "README.md");
  });
  expectInvalid(snapshot, /unexpected repository file: README\.md/);
});

test("rejects a manifest path missing from the repository", () => {
  const snapshot = cloneSnapshot();
  snapshot.files.delete("README.md");
  expectInvalid(snapshot, /manifest path is missing from the repository: README\.md/);
});

test("rejects duplicate manifest paths", () => {
  const snapshot = mutateJson(CURRENT_FILES_PATH, (manifest) => {
    manifest.files.push("README.md");
    manifest.files.sort();
  });
  expectInvalid(snapshot, /duplicate manifest path README\.md/);
});

const syntheticV4Id = ["00000000", "0000", "4000", "8000", "000000000001"].join("-");
const syntheticV7Id = ["00000000", "0000", "7000", "8000", "000000000002"].join("-");
for (const [label, content] of [
  ["v4 task_id assignment", `task_id: ${syntheticV4Id}`],
  ["v4 thread-id assignment", `thread-id = "${syntheticV4Id}"`],
  ["v7 thread_id assignment", `thread_id: ${syntheticV7Id}`],
  ["v4 tasks route", `/tasks/${syntheticV4Id}`],
  ["v7 threads route", `/threads/${syntheticV7Id}`],
]) {
  test(`rejects private task or thread UUID in ${label}`, () => {
    expectInvalid(appendText("README.md", `\n${content}\n`), /private task\/thread UUID/);
  });
}

test("rejects a quoted JSON client_secret assignment", () => {
  const key = ["client", "secret"].join("_");
  const value = ["synthetic", "credential", "value"].join("-");
  expectInvalid(appendText("README.md", `\n{"${key}":"${value}"}\n`), /quoted JSON\/YAML credential assignment/);
});

test("rejects quoted YAML and shell credential assignments", () => {
  const value = ["synthetic", "credential", "value"].join("-");
  const yamlKey = ["access", "token"].join("_");
  const shellKey = ["API", "KEY"].join("_");
  expectInvalid(appendText("README.md", `\n${yamlKey}: "${value}"\n`), /YAML credential assignment/);
  expectInvalid(appendText("README.md", `\nexport ${shellKey}='${value}'\n`), /shell credential assignment/);
});

const javascriptCredentialValue = ["synthetic", "javascript", "credential"].join("-");
const camelCredentialKey = ["client", "Secret"].join("");
for (const [label, content, expected] of [
  [
    "const declaration",
    `const ${camelCredentialKey} = "${javascriptCredentialValue}";`,
    /JavaScript credential declaration/,
  ],
  [
    "snake-case object property",
    `const config = { ${["client", "secret"].join("_")}: "${javascriptCredentialValue}" };`,
    /object credential assignment/,
  ],
  [
    "hyphenated quoted object property",
    `const config = { "${["access", "token"].join("-")}": "${javascriptCredentialValue}" };`,
    /quoted JSON\/YAML credential assignment|object credential assignment/,
  ],
  [
    "camel-case property assignment",
    `config.${camelCredentialKey} = "${javascriptCredentialValue}";`,
    /property credential assignment/,
  ],
  [
    "bracket property assignment",
    `config["${camelCredentialKey}"] = "${javascriptCredentialValue}";`,
    /property credential assignment/,
  ],
]) {
  test(`rejects JavaScript credential context ${label}`, () => {
    expectInvalid(appendText("README.md", `\n${content}\n`), expected);
  });
}

const expressionOpening = "$" + "{{ ";
for (const [label, expression] of [
  ["secret dot form", expressionOpening + "secrets." + "DEPLOY_TOKEN }}"],
  ["secret single-quoted bracket form", expressionOpening + "secrets [ '" + "DEPLOY_TOKEN' ] }}"],
  ["secret double-quoted bracket form", expressionOpening + 'secrets["' + 'DEPLOY_TOKEN"] }}'],
  ["github.token dot form", expressionOpening + "github." + "token }}"],
  ["github.token single-quoted bracket form", expressionOpening + "github [ '" + "token' ] }}"],
  ["github.token double-quoted bracket form", expressionOpening + 'github["' + 'token"] }}'],
]) {
  test(`rejects GitHub Actions ${label}`, () => {
    expectInvalid(
      appendText(".github/workflows/ci.yml", `\n# ${expression}\n`),
      /GitHub Actions secret or github\.token expression/,
    );
  });
}

test("rejects a credential-bearing URL", () => {
  const url = "https://" + "release-user" + ":" + "synthetic-passphrase" + "@" + "private.invalid/path";
  expectInvalid(appendText("README.md", `\n${url}\n`), /credential-bearing URL/);
});

test("rejects private repository and provider receipt assignments", () => {
  const value = ["synthetic", "provider", "receipt"].join("-");
  const jsonKey = ["provider", "receipt"].join("_");
  const shellKey = ["PRIVATE", "REPOSITORY", "ROOT"].join("_");
  expectInvalid(
    appendText("README.md", `\n{"${jsonKey}":"${value}"}\n`),
    /quoted private repository\/location\/deployment\/provider receipt/,
  );
  expectInvalid(
    appendText("README.md", `\nexport ${shellKey}='/srv/synthetic-private-repository'\n`),
    /shell private repository\/location\/deployment\/provider receipt/,
  );
});

const privateRepositoryValue = "https://" + "private.invalid" + "/synthetic/repository";
for (const [label, content, expected] of [
  [
    "snake-case URL object property",
    `{"${["private", "repository", "url"].join("_")}":"${privateRepositoryValue}"}`,
    /quoted private repository\/location\/deployment\/provider receipt/,
  ],
  [
    "camel-case JavaScript declaration",
    `const ${["private", "Repository", "Url"].join("")} = "${privateRepositoryValue}";`,
    /JavaScript private repository\/location\/deployment\/provider declaration/,
  ],
  [
    "camel-case property assignment",
    `config.${["private", "Repository", "Path"].join("")} = "/srv/synthetic-private-repository";`,
    /property private repository\/location\/deployment\/provider assignment/,
  ],
]) {
  test(`rejects private repository context ${label}`, () => {
    expectInvalid(appendText("README.md", `\n${content}\n`), expected);
  });
}

test("does not reject public repository metadata or placeholder prose", () => {
  const publicMetadata =
    "const repositoryUrl = \"https://github.com/threadwake/public\";\n" +
    "The clientSecret placeholder is supplied by the host at runtime.\n" +
    "const clientSecret = process.env.CLIENT_SECRET;\n" +
    "const clientSecretPlaceholder = \"synthetic-public-label\";\n" +
    "metadata.privateRepositoryUrlLabel = \"synthetic-public-label\";\n";
  assert.deepEqual(validatePublicPackageSnapshot(appendText("README.md", `\n${publicMetadata}`)), {
    fileCount: currentFileCount,
  });
});

for (const scriptName of ["precheck:public-package", "postcheck:public-package", "preinstall"]) {
  test(`rejects unexpected root lifecycle script ${scriptName}`, () => {
    const snapshot = mutateJson("package.json", (rootPackage) => {
      rootPackage.scripts[scriptName] = "node -e \"process.exit(0)\"";
    });
    expectInvalid(snapshot, new RegExp(`unknown key ${scriptName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  });
}

test("rejects malformed plugin semantic versions", () => {
  const snapshot = mutateJson("plugins/threadwake/.codex-plugin/plugin.json", (plugin) => {
    plugin.version = "1.2";
  });
  expectInvalid(snapshot, /strict semantic version syntax/);
});

test("rejects a skills reference pointed at assets", () => {
  const snapshot = mutateJson("plugins/threadwake/.codex-plugin/plugin.json", (plugin) => {
    plugin.skills = "./assets/";
  });
  expectInvalid(snapshot, /must equal \.\/skills\//);
});

test("rejects an invalid plugin brand color", () => {
  const snapshot = mutateJson("plugins/threadwake/.codex-plugin/plugin.json", (plugin) => {
    plugin.interface.brandColor = "blue";
  });
  expectInvalid(snapshot, /must use #RRGGBB syntax/);
});

for (const prompts of [[], ["one", "two", "three", "four"]]) {
  test(`rejects ${prompts.length} starter prompts`, () => {
    const snapshot = mutateJson("plugins/threadwake/.codex-plugin/plugin.json", (plugin) => {
      plugin.interface.defaultPrompt = prompts;
    });
    expectInvalid(snapshot, /defaultPrompt: must contain between 1 and 3 entries/);
  });
}

for (const field of ["policy", "category"]) {
  test(`rejects a marketplace plugin missing ${field}`, () => {
    const snapshot = mutateJson(".agents/plugins/marketplace.json", (marketplace) => {
      delete marketplace.plugins[0][field];
    });
    expectInvalid(snapshot, new RegExp(`missing required key ${field}`));
  });
}

test("rejects a marketplace missing its interface", () => {
  const snapshot = mutateJson(".agents/plugins/marketplace.json", (marketplace) => {
    delete marketplace.interface;
  });
  expectInvalid(snapshot, /missing required key interface/);
});

for (const [path, mutate] of [
  ["plugins/threadwake/.codex-plugin/plugin.json", (plugin) => { plugin.unreviewed = true; }],
  [".agents/plugins/marketplace.json", (marketplace) => { marketplace.unreviewed = true; }],
]) {
  test(`rejects unknown keys in ${path}`, () => {
    expectInvalid(mutateJson(path, mutate), /unknown key unreviewed/);
  });
}

for (const invalidPath of ["./../outside.svg", ".\\assets\\threadwake-mark.svg"]) {
  test(`rejects non-contained or non-POSIX plugin path ${invalidPath}`, () => {
    const snapshot = mutateJson("plugins/threadwake/.codex-plugin/plugin.json", (plugin) => {
      plugin.interface.logo = invalidPath;
    });
    expectInvalid(snapshot, /must be a plugin-relative \.\/ path|traverse the plugin root/);
  });
}

test("rejects altered MCP commands and arguments", () => {
  const snapshot = mutateJson("plugins/threadwake/.mcp.json", (mcp) => {
    mcp.mcpServers.threadwake.args[4] = "forge";
  });
  expectInvalid(snapshot, /must launch the exact contained fixture stdio bundle/);
});

test("rejects an invalid Threadwake skill frontmatter name", () => {
  const snapshot = cloneSnapshot();
  const contents = snapshot.files.get("plugins/threadwake/skills/threadwake/SKILL.md").toString("utf8");
  snapshot.files.set(
    "plugins/threadwake/skills/threadwake/SKILL.md",
    Buffer.from(contents.replace("name: threadwake", "name: Not-Threadwake")),
  );
  expectInvalid(snapshot, /lowercase kebab-case identity/);
});

test("accepts supported double-quoted and YAML single-quoted frontmatter strings", () => {
  const snapshot = mutateSkillFrontmatter((contents) =>
    contents
      .replace("name: threadwake", 'name: "threadwake"')
      .replace(/^description:.*$/m, "description: 'Threadwake''s quoted description.'"),
  );
  assert.deepEqual(validatePublicPackageSnapshot(snapshot), { fileCount: currentFileCount });
});

for (const [label, rawValue, expected] of [
  ["true scalar", "true", /implicit boolean or null scalars/],
  ["null scalar", "null", /implicit boolean or null scalars/],
  ["numeric scalar", "42", /numeric scalars are not supported/],
  ["literal block scalar", "|", /block scalar syntax is not supported/],
  ["folded block scalar", ">", /block scalar syntax is not supported/],
  ["flow sequence", "[threadwake]", /flow collection syntax is not supported/],
  ["flow mapping", "{ value: threadwake }", /flow collection syntax is not supported/],
  ["unterminated quote", '"unterminated', /malformed or unterminated double-quoted string/],
]) {
  test(`rejects unsupported skill frontmatter ${label}`, () => {
    const snapshot = mutateSkillFrontmatter((contents) =>
      contents.replace(/^description:.*$/m, `description: ${rawValue}`),
    );
    expectInvalid(snapshot, expected);
  });
}

for (const [label, extraLine, expected] of [
  ["duplicate key", "name: duplicate", /duplicate frontmatter key name/],
  ["unknown key", "unexpected: value", /unknown key unexpected/],
]) {
  test(`rejects skill frontmatter ${label}`, () => {
    const snapshot = mutateSkillFrontmatter((contents) =>
      contents.replace("\n---\n", `\n${extraLine}\n---\n`),
    );
    expectInvalid(snapshot, expected);
  });
}

test("rejects duplicate intentional public assertions", () => {
  const marker = "unit-other-tenant-" + "secret";
  expectInvalid(appendText("README.md", `\n${marker}\n`), /exact occurrences changed/);
});

test("rejects .app.json and hook files", () => {
  for (const path of ["plugins/threadwake/.app.json", "plugins/threadwake/hooks/setup.sh"]) {
    const snapshot = cloneSnapshot();
    snapshot.files.set(path, Buffer.from("{}\n"));
    expectInvalid(snapshot, /unregistered app configuration|unsupported lifecycle hook/);
  }
});

test("rejects a symlinked ancestor", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "threadwake-public-validator-"));
  const realDirectory = join(temporaryRoot, "real");
  mkdirSync(realDirectory);
  writeFileSync(join(realDirectory, "file.txt"), "synthetic\n");
  symlinkSync(realDirectory, join(temporaryRoot, "linked"), "dir");
  try {
    assert.throws(
      () => assertNoSymlinkedPath(temporaryRoot, "linked/file.txt"),
      (error) => error instanceof PublicPackageValidationError && /symlinked path component linked/.test(error.message),
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
