import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const forbiddenImports = [
  "@actual-app/crdt",
  "@actual-app/semantic-postgres",
  "@actual-app/web",
  "react",
];

const forbiddenBrowserStorage = ["localStorage", "sessionStorage", "indexedDB"];

test("Ember app keeps the clean presentation boundary", async () => {
  const files = await sourceFiles(new URL("../app/", import.meta.url));
  assert.ok(files.length > 0, "expected Ember application source files");

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const forbiddenImport of forbiddenImports) {
      assert.doesNotMatch(
        source,
        new RegExp(
          `(?:from\\s+|import\\s*\\()(['\"])${escapeRegExp(forbiddenImport)}`,
        ),
        `${file} imports forbidden boundary ${forbiddenImport}`,
      );
    }
    for (const storageName of forbiddenBrowserStorage) {
      assert.doesNotMatch(
        source,
        new RegExp(`\\b${storageName}\\b`),
        `${file} persists auth or domain state through ${storageName}`,
      );
    }
  }
});

async function sourceFiles(directoryUrl) {
  const directory = fileURLToPath(directoryUrl);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(
        ...(await sourceFiles(new URL(`${entry.name}/`, directoryUrl))),
      );
    } else if (/\.(?:ts|gts|js|gjs)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
