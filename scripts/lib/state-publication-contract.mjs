import { execFileSync } from "node:child_process";

export const STATE_COMMIT_TRAILER = "skip-checks: true";

const STATE_PATHS = [
  /^docs\/tracker\/GUIDE\.md$/,
  /^docs\/tracker\/cards\/MOV-\d{4}\.md$/,
  /^docs\/tracker\/work-orders\/MOV-WO-\d{3}\.md$/,
  /^docs\/tracker\/(?:board|guide)\.html$/,
  /^docs\/tracker\/tracker\.json$/,
  /^docs\/planning\/assist-with-moving-project-philosophy\.(?:md|html)$/,
];

export function parseNameStatus(output) {
  if (!output.trim()) return [];
  return output.trim().split("\n").map((line) => {
    const fields = line.split("\t");
    if (fields.length !== 2) return { status: "?", path: line, raw: line };
    return { status: fields[0], path: fields[1], raw: line };
  });
}

export function rejectedStateChanges(changes) {
  return changes.filter(({ status, path }) =>
    !["A", "M"].includes(status) ||
    !STATE_PATHS.some((pattern) => pattern.test(path)),
  );
}

export function hasStateCommitTrailer(message) {
  return message.trimEnd().split("\n").at(-1)?.trim() === STATE_COMMIT_TRAILER;
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function inspectStateRange({
  base,
  head,
  cwd = process.cwd(),
  singleCommit = false,
}) {
  const fullSha = /^[0-9a-f]{40}$/i;
  if (!fullSha.test(base ?? "") || !fullSha.test(head ?? "")) {
    throw new Error("base and head must be full 40-character commit SHAs");
  }
  git(cwd, ["cat-file", "-e", `${base}^{commit}`]);
  git(cwd, ["cat-file", "-e", `${head}^{commit}`]);
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", base, head], {
      cwd,
      stdio: "ignore",
    });
  } catch {
    throw new Error("base is not an ancestor of head");
  }
  const commits = git(cwd, ["rev-list", "--reverse", `${base}..${head}`]).split("\n").filter(Boolean);
  if (!commits.length) throw new Error("state range has no commits");
  if (singleCommit && commits.length !== 1) {
    throw new Error(`direct GitHub state range must contain exactly one commit; found ${commits.length}`);
  }
  const changes = [];
  let parent = base;
  for (const commit of commits) {
    const parents = git(cwd, ["rev-list", "--parents", "-n", "1", commit]).split(/\s+/);
    if (parents.length !== 2 || parents[1] !== parent) {
      throw new Error("state range must be linear and contain no merge commits");
    }
    const message = git(cwd, ["show", "--no-patch", "--format=%B", commit]);
    if (!hasStateCommitTrailer(message)) {
      throw new Error(`state commit ${commit} is missing the final publication trailer`);
    }
    const commitChanges = parseNameStatus(
      git(cwd, ["diff", "--name-status", "--no-renames", parent, commit]),
    );
    if (!commitChanges.length) throw new Error(`state commit ${commit} has no changed paths`);
    const rejected = rejectedStateChanges(commitChanges);
    if (rejected.length) {
      throw new Error(`mixed or non-state paths: ${rejected.map(({ raw }) => raw).join(", ")}`);
    }
    changes.push(...commitChanges);
    parent = commit;
  }
  return { changes, base, head };
}
