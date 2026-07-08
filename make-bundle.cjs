#!/usr/bin/env node

/**
 * Dev Bundle Generator
 *
 * Clones each configured repo at a tag/branch, archives into a stage folder,
 * and produces a tarball for local dev setup (samd, non-samd, or viewer worlds).
 *
 * Prerequisites: git
 *
 * Usage: ./scripts/make-bundle.cjs <samd|non-samd|viewer>
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const TEMP_DIR = path.join(__dirname, ".make-bundle-temp");
const OUTPUT_DIR = path.join(os.homedir(), "test-dev-setup");

/**
 * @typedef {{ folder: string; gitUrl: string }} RepoDef
 * @typedef {{ folder: string; ref: string }} RepoPin
 * @typedef {{ folder: string; gitUrl: string; ref: string }} RepoRef
 */

/** Shared repo catalog (folder + gitUrl). Keys match tarball top-level folder names. */
/** @type {Record<string, RepoDef>} */
const REPOS = {
  "utils.js": {
    folder: "utils.js",
    gitUrl: "https://github.com/lumenbiomics/utils.js.git",
  },
  "three-js-utils": {
    folder: "three-js-utils",
    gitUrl: "https://github.com/lumenbiomics/three-js-utils.git",
  },
  "geodesic-path.js": {
    folder: "geodesic-path.js",
    gitUrl: "https://github.com/lumenbiomics/geodesic-path.js.git",
  },
  "us-dicom-viewer": {
    folder: "us-dicom-viewer",
    gitUrl: "https://github.com/lumenbiomics/us-dicom-viewer.git",
  },
  anu: {
    folder: "anu",
    gitUrl: "https://github.com/lumenbiomics/anu.git",
  },
  formbae: {
    folder: "formbae",
    gitUrl: "https://github.com/lumenbiomics/formbae.git",
  },
  "3d-heart": {
    folder: "3d-heart",
    gitUrl: "https://github.com/lumenbiomics/3d-heart.git",
  },
  "tee-ui-components": {
    folder: "tee-ui-components",
    gitUrl: "https://github.com/lumenbiomics/tee-ui-components.git",
  },
  "watchmate-ui": {
    folder: "watchmate-ui",
    gitUrl: "https://github.com/lumenbiomics/watchmate-ui.git",
  },
  "tee-laac-ui": {
    folder: "tee-laac-ui",
    gitUrl: "https://github.com/lumenbiomics/tee-laac-ui.git",
  },
};

// Keep repo order in sync with `dev-dependency-resolution.sh` (topological order).
// Edit refs independently per world — no shared tag state across bundles.

/** @type {RepoPin[]} */
const SAMD_MAPPING = [
  { folder: "utils.js", ref: "v2.0.3" },
  { folder: "three-js-utils", ref: "v3.0.2" },
  { folder: "geodesic-path.js", ref: "v1.0.5" },
  { folder: "us-dicom-viewer", ref: "v1.0.11" },
  { folder: "anu", ref: "v1.0.11" },
  { folder: "3d-heart", ref: "v2.0.7" },
  { folder: "tee-ui-components", ref: "v1.0.21" },
  { folder: "watchmate-ui", ref: "v1.0.20" },
];

/** @type {RepoPin[]} */
const NON_SAMD_MAPPING = [
  { folder: "utils.js", ref: "v3.0.6" },
  { folder: "three-js-utils", ref: "v3.0.7" },
  { folder: "geodesic-path.js", ref: "v1.0.7" },
  { folder: "us-dicom-viewer", ref: "v1.0.17" },
  { folder: "anu", ref: "v1.1.3" },
  { folder: "formbae", ref: "v0.0.4" },
  { folder: "3d-heart", ref: "v3.0.1" },
  { folder: "tee-ui-components", ref: "v3.0.1" },
  { folder: "tee-laac-ui", ref: "v1.0.7" },
];

/** @type {RepoPin[]} */
const VIEWER_MAPPING = [
  { folder: "utils.js", ref: "v3.0.6" },
  { folder: "three-js-utils", ref: "v3.0.7" },
  { folder: "geodesic-path.js", ref: "v1.0.7" },
  { folder: "us-dicom-viewer", ref: "v1.0.17" },
  { folder: "anu", ref: "v1.1.3" },
  { folder: "3d-heart", ref: "v3.0.1" },
  { folder: "tee-ui-components", ref: "v3.0.1" },
  { folder: "watchmate-ui", ref: "v1.1.5" },
];

/**
 * @param {RepoPin[]} mapping
 * @returns {RepoRef[]}
 */
function resolveWorld(mapping) {
  return mapping.map(({ folder, ref }) => {
    const repo = REPOS[folder];
    if (!repo) {
      throw new Error(`Unknown repo folder in mapping: ${folder}`);
    }
    return { ...repo, ref };
  });
}

/** @type {Record<string, { repos: RepoRef[] }>} */
const worlds = {
  samd: { repos: resolveWorld(SAMD_MAPPING) },
  "non-samd": { repos: resolveWorld(NON_SAMD_MAPPING) },
  viewer: { repos: resolveWorld(VIEWER_MAPPING) },
};

function prefixLine(label, line) {
  if (!line) return;
  process.stdout.write(`[${label}] ${line}\n`);
}

/**
 * @param {string} command
 * @param {{ cwd?: string; label?: string }} [options]
 * @returns {Promise<void>}
 */
function execAsync(command, options = {}) {
  const label = options.label ?? "cmd";
  prefixLine(label, `$ ${command}`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const outRl = readline.createInterface({ input: child.stdout });
    const errRl = readline.createInterface({ input: child.stderr });
    outRl.on("line", (line) => prefixLine(label, line));
    errRl.on("line", (line) => prefixLine(label, line));
    child.on("close", () => {
      outRl.close();
      errRl.close();
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`Command failed (${code}): ${command}`));
    });
  });
}

function execSyncQuiet(command, options = {}) {
  execSync(command, { stdio: "pipe", ...options });
}

/**
 * @param {number} max
 */
function createLimiter(max) {
  /** @type {(() => void)[]} */
  const queue = [];
  let active = 0;

  const next = () => {
    if (active >= max) return;
    const run = queue.shift();
    if (!run) return;
    active++;
    run();
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push(() => {
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}

function checkPrerequisites() {
  try {
    execSyncQuiet("which git");
  } catch {
    console.error("git is required but was not found in PATH.");
    process.exit(1);
  }
}

/**
 * @param {RepoRef} repo
 * @param {string} cloneRoot
 * @param {string} stageDir
 */
async function cloneAndArchiveRepo(repo, cloneRoot, stageDir) {
  const label = repo.folder;
  const clonePath = path.join(cloneRoot, repo.folder);

  prefixLine(label, `=== Cloning ${repo.gitUrl} @ ${repo.ref} ===`);

  if (fs.existsSync(clonePath)) {
    fs.rmSync(clonePath, { recursive: true, force: true });
  }

  await execAsync(
    `git clone --depth 1 --branch ${JSON.stringify(repo.ref)} ${JSON.stringify(repo.gitUrl)} ${JSON.stringify(clonePath)}`,
    { label },
  );

  prefixLine(label, "Archiving...");
  execSyncQuiet(
    `git -C ${JSON.stringify(clonePath)} archive --prefix=${JSON.stringify(`${repo.folder}/`)} --format=tar HEAD | tar -xf - -C ${JSON.stringify(stageDir)}`,
    { shell: "/bin/bash" },
  );

  prefixLine(label, "Done");
}

function printUsage() {
  console.error("usage: make-bundle.cjs <samd|non-samd|viewer>");
}

async function main() {
  const worldName = process.argv[2];
  const world = worlds[worldName ?? ""];

  if (!world) {
    printUsage();
    process.exit(1);
  }

  checkPrerequisites();

  const stageDir = path.join(TEMP_DIR, "stage");
  const cloneRoot = path.join(TEMP_DIR, "clones");

  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });
  fs.mkdirSync(cloneRoot, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const envConcurrency = Number.parseInt(process.env.CONCURRENCY ?? "", 10);
  const defaultConcurrency = Math.max(
    2,
    Math.min(4, Math.floor((os.cpus()?.length ?? 4) / 2)),
  );
  const concurrency =
    Number.isFinite(envConcurrency) && envConcurrency > 0
      ? envConcurrency
      : defaultConcurrency;

  console.log(`Building ${worldName} bundle (concurrency: ${concurrency})`);

  const limit = createLimiter(concurrency);
  const results = await Promise.all(
    world.repos.map((repo) =>
      limit(async () => {
        try {
          await cloneAndArchiveRepo(repo, cloneRoot, stageDir);
          return { repo, ok: true };
        } catch (error) {
          const reason = error?.message ? String(error.message) : String(error);
          prefixLine(repo.folder, `Failed: ${reason}`);
          return { repo, ok: false, reason };
        }
      }),
    ),
  );

  const failures = results.filter((r) => !r.ok);
  if (failures.length) {
    console.error("\nFailed repos:");
    for (const f of failures) {
      console.error(`- ${f.repo.folder} @ ${f.repo.ref}: ${f.reason}`);
    }
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    process.exit(1);
  }

  const tarballPath = path.join(OUTPUT_DIR, `${worldName}-bundle.tar.gz`);
  if (fs.existsSync(tarballPath)) {
    fs.rmSync(tarballPath, { force: true });
  }

  execSyncQuiet(
    `tar -czf ${JSON.stringify(tarballPath)} -C ${JSON.stringify(stageDir)} .`,
  );

  fs.rmSync(TEMP_DIR, { recursive: true, force: true });

  console.log(`\nBundle created: ${tarballPath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
