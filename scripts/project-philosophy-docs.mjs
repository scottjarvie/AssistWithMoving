#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const markdownRelativePath =
  "docs/planning/assist-with-moving-project-philosophy.md";
const htmlRelativePath =
  "docs/planning/assist-with-moving-project-philosophy.html";
const markdownPath = join(repositoryRoot, markdownRelativePath);
const htmlPath = join(repositoryRoot, htmlRelativePath);
// Construct the retired slug so repository-wide stale-reference searches do not
// mistake this validation guard for a live reference.
const oldCanonicalName = ["assist", "with", "moving", "core", "philosophy"].join(
  "-",
);
const sourceOpen = '<script id="markdown-source" type="text/plain">\n';
const sourceClose = "    </script>";

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`Missing ${label} marker in ${htmlRelativePath}`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function assertShell(html) {
  const required = [
    `content="${markdownRelativePath}"`,
    "Assist With Moving — Project Philosophy Reader",
    'aria-label="Assist With Moving Project Philosophy"',
    'href="assist-with-moving-project-philosophy.md"',
    "data-source-digest-short",
    "data-source-digest-full",
  ];

  for (const value of required) {
    if (!html.includes(value)) {
      throw new Error(`Missing required reader value: ${value}`);
    }
  }

  if (html.includes(oldCanonicalName)) {
    throw new Error(`Stale canonical name remains: ${oldCanonicalName}`);
  }
}

function render(html, markdown) {
  assertShell(html);

  const sourceStart = html.indexOf(sourceOpen);
  if (sourceStart < 0) {
    throw new Error(`Missing embedded Markdown opening marker in ${htmlRelativePath}`);
  }

  const contentStart = sourceStart + sourceOpen.length;
  const contentEnd = html.indexOf(sourceClose, contentStart);
  if (contentEnd < 0) {
    throw new Error(`Missing embedded Markdown closing marker in ${htmlRelativePath}`);
  }

  const digest = createHash("sha256").update(markdown).digest("hex");
  const shortDigest = `${digest.slice(0, 8)}…${digest.slice(-7)}`;
  let rendered = html.slice(0, contentStart) + markdown + html.slice(contentEnd);

  rendered = replaceRequired(
    rendered,
    /(name="source-sha256"\s+content=")[a-f0-9]{64}(")/,
    `$1${digest}$2`,
    "source digest metadata",
  );
  rendered = replaceRequired(
    rendered,
    /(<dd data-source-digest-short>)[^<]*(<\/dd>)/,
    `$1${shortDigest}$2`,
    "short source digest",
  );
  rendered = replaceRequired(
    rendered,
    /(<span data-source-digest-full>)[a-f0-9]{64}(<\/span>)/,
    `$1${digest}$2`,
    "full source digest",
  );

  return { digest, rendered };
}

const checkOnly = process.argv.slice(2).includes("--check");
const markdown = readFileSync(markdownPath, "utf8");
const html = readFileSync(htmlPath, "utf8");
const { digest, rendered } = render(html, markdown);

if (checkOnly) {
  if (rendered !== html) {
    throw new Error(
      `${htmlRelativePath} is stale; run npm run docs:project-philosophy`,
    );
  }
  console.log(`Project Philosophy reader is synchronized (${digest}).`);
} else {
  if (rendered !== html) {
    writeFileSync(htmlPath, rendered);
    console.log(`Regenerated ${htmlRelativePath} (${digest}).`);
  } else {
    console.log(`Project Philosophy reader already synchronized (${digest}).`);
  }
}
