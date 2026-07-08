#!/usr/bin/env node

/**
 * Test Report Generator
 *
 * Clones each configured repo at a tag, runs npm install and tests, collects
 * files from test-results (or a per-project override), renames with a project
 * prefix, stages them in one folder, and zips the bundle.
 *
 * Prerequisites: git, npm, zip (CLI)
 *
 * Usage: node scripts/test-report-generator.cjs
 *
 * Env:
 *   CLONE_CONCURRENCY=1   sequential git clones (default)
 *   TEST_CONCURRENCY=3    parallel install/test (default; CONCURRENCY alias)
 *   CLONE_TIMEOUT_MS      git clone timeout (default 5m)
 *   INSTALL_TIMEOUT_MS    npm install timeout (default 15m)
 *   TEST_TIMEOUT_MS       npm test timeout (default 30m)
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const TEMP_DIR = path.join(__dirname, "..", ".test-report-temp");
const OUTPUT_DIR = path.join(__dirname, "..", "test-report-output");
const STAGE_DIR = path.join(OUTPUT_DIR, "stage");
const DEFAULT_TEST_COMMAND = "npm run test";
const DEFAULT_TEST_RESULTS_DIR = "test-results";

const CLONE_TIMEOUT_MS = parseEnvInt("CLONE_TIMEOUT_MS", 5 * 60 * 1000);
const INSTALL_TIMEOUT_MS = parseEnvInt("INSTALL_TIMEOUT_MS", 15 * 60 * 1000);
const TEST_TIMEOUT_MS = parseEnvInt("TEST_TIMEOUT_MS", 30 * 60 * 1000);
const KILL_GRACE_MS = 5000;

function isTruthyEnv(value) {
  if (!value) return false;
  return ["1", "true", "yes", "y", "on"].includes(String(value).toLowerCase());
}

function isFalsyEnv(value) {
  if (value === undefined || value === null) return false;
  return ["0", "false", "no", "n", "off"].includes(String(value).toLowerCase());
}

/**
 * @param {string} name
 * @param {number} fallback
 */
function parseEnvInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Default: suppress command output. Opt out with SUPPRESS_CONSOLE=0/false/off.
const SUPPRESS_CONSOLE =
  process.env.SUPPRESS_CONSOLE === undefined
    ? false
    : !isFalsyEnv(process.env.SUPPRESS_CONSOLE);

/**
 * @typedef {{ source: string; dest?: string }} TestArtifact
 * @typedef {{
 *   name: string;
 *   title: string;
 *   tag: string;
 *   gitUrl: string;
 *   installCommand?: string;
 *   testCommand?: string;
 *   testResultsDir?: string;
 *   artifacts?: TestArtifact[]; // if set, only these files; else copy all files in testResultsDir
 * }} Project
 */

/** @type {Project[]} */
const projects = [
  {
    name: "watchmate-ui",
    title: "WatchMate UI",
    tag: "v1.0.20",
    gitUrl: "https://github.com/lumenbiomics/watchmate-ui.git",
    artifacts: [
      { source: "test-report.csv" },
      { source: "watchmateUiReport.html", dest: "test-report.html" },
    ],
  },
  {
    name: "watchmate-ui-viewer",
    title: "WatchMate UI Viewer",
    tag: "v1.1.5",
    gitUrl: "https://github.com/lumenbiomics/watchmate-ui.git",
    artifacts: [
      { source: "test-report.csv" },
      { source: "watchmateUiReport.html", dest: "test-report.html" },
    ],
  },
  {
    name: "3d-heart",
    title: "3D Heart",
    tag: "v3.0.1",
    gitUrl: "https://github.com/lumenbiomics/3d-heart.git",
    artifacts: [
      { source: "verbose-test-report.html", dest: "test-report.html" },
      { source: "test-report.csv" },
    ],
  },
  {
    name: "three-js-utils",
    title: "Three.js Utils",
    tag: "v3.0.7",
    gitUrl: "https://github.com/lumenbiomics/three-js-utils.git",
    artifacts: [
      { source: "verbose-test-report.html", dest: "test-report.html" },
      { source: "test-report.csv" },
    ],
  },
  {
    name: "geodesic-path",
    title: "Geodesic Path",
    tag: "v1.0.7",
    gitUrl: "https://github.com/lumenbiomics/geodesic-path.js.git",
    testCommand: "npm run test:all",
    artifacts: [
      { source: "test-report-cpp.csv" },
      { source: "test-report-cpp.html" },
      { source: "test-report.csv" },
      { source: "verbose-test-report.html", dest: "test-report.html" },
    ],
  },
  {
    name: "us-dicom-viewer",
    title: "US DICOM Viewer",
    tag: "v1.0.17",
    gitUrl: "https://github.com/lumenbiomics/us-dicom-viewer.git",
    artifacts: [
      { source: "test-report.csv" },
      { source: "usDicomViewerReport.html", dest: "test-report.html" },
    ],
  },
  {
    name: "utils-js",
    title: "Utils",
    tag: "v3.0.6",
    gitUrl: "https://github.com/lumenbiomics/utils.js.git",
    artifacts: [
      { source: "test-report.csv" },
      { source: "utilsJsReport.html", dest: "test-report.html" },
    ],
  },
  {
    name: "tee-ui-components",
    title: "Tee UI Components",
    tag: "v3.0.1",
    gitUrl: "https://github.com/lumenbiomics/tee-ui-components.git",
    testCommand: "npm run build && npm run test",
    artifacts: [
      { source: "test-report.csv" },
      { source: "teeUiComponentsReport.html", dest: "test-report.html" },
    ],
  },
  {
    name: "tee-laac-ui",
    title: "Tee LAAC UI",
    tag: "v1.0.7",
    gitUrl: "https://github.com/lumenbiomics/tee-laac-ui.git",
    artifacts: [
      { source: "test-report.csv" },
      { source: "teeLaacUiReport.html", dest: "test-report.html" },
    ],
  },
  {
    name: "anu",
    title: "Anu",
    tag: "v1.1.3",
    testCommand: "npm run unit-test",
    gitUrl: "https://github.com/lumenbiomics/anu.git",
    artifacts: [
      { source: "test-report.csv" },
      { source: "anuReport.html", dest: "test-report.html" },
    ],
  },
  {
    name: "formanu",
    title: "Formanu",
    tag: "v0.0.4",
    gitUrl: "https://github.com/lumenbiomics/formbae.git",
    artifacts: [
      { source: "test-report.csv" },
      { source: "formanuReport.html", dest: "test-report.html" },
    ],
  },
];

function exec(command, options = {}) {
  if (!SUPPRESS_CONSOLE) console.log(`\n$ ${command}`);
  try {
    execSync(command, {
      stdio: SUPPRESS_CONSOLE ? "pipe" : "inherit",
      ...options,
    });
  } catch (err) {
    if (SUPPRESS_CONSOLE) {
      const stdout = err?.stdout ? String(err.stdout) : "";
      const stderr = err?.stderr ? String(err.stderr) : "";
      if (stdout.trim()) process.stdout.write(stdout);
      if (stderr.trim()) process.stderr.write(stderr);
    }
    throw err;
  }
}

function execQuiet(command, options = {}) {
  execSync(command, { stdio: "pipe", ...options });
}

function prefixLine(label, line) {
  if (!line) return;
  process.stdout.write(`[${label}] ${line}\n`);
}

/**
 * Run a shell command asynchronously and stream output with a prefix label.
 * @param {string} command
 * @param {{ cwd?: string; label?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<void>}
 */
function execAsync(command, options = {}) {
  const label = options.label ?? "cmd";
  const timeoutMs = options.timeoutMs ?? 0;
  prefixLine(label, `$ ${command}`);

  return new Promise((resolve, reject) => {
    /** @type {import('readline').Interface | undefined} */
    let outRl;
    /** @type {import('readline').Interface | undefined} */
    let errRl;
    /** @type {NodeJS.Timeout | undefined} */
    let killTimer;
    /** @type {NodeJS.Timeout | undefined} */
    let timeoutTimer;
    let settled = false;

    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env ?? process.env,
    });

    /** @type {Buffer[]} */
    const outChunks = [];
    /** @type {Buffer[]} */
    const errChunks = [];

    const flushCapturedOutput = () => {
      if (!SUPPRESS_CONSOLE) return;
      const out = Buffer.concat(outChunks).toString("utf8");
      const err = Buffer.concat(errChunks).toString("utf8");
      if (out.trim()) process.stdout.write(out);
      if (err.trim()) process.stderr.write(err);
    };

    const closeReaders = () => {
      outRl?.close();
      errRl?.close();
    };

    const killChild = () => {
      if (child.killed) return;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, KILL_GRACE_MS);
    };

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      closeReaders();
      if (error) reject(error);
      else resolve();
    };

    if (!SUPPRESS_CONSOLE) {
      outRl = readline.createInterface({ input: child.stdout });
      errRl = readline.createInterface({ input: child.stderr });
      outRl.on("line", (line) => prefixLine(label, line));
      errRl.on("line", (line) => prefixLine(label, line));
    } else {
      child.stdout.on("data", (b) => outChunks.push(Buffer.from(b)));
      child.stderr.on("data", (b) => errChunks.push(Buffer.from(b)));
    }

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        prefixLine(
          label,
          `Command timed out after ${Math.round(timeoutMs / 1000)}s, killing...`,
        );
        killChild();
        finish(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
      }, timeoutMs);
    }

    child.on("error", (err) => finish(err));
    child.on("close", (code, signal) => {
      if (settled) return;
      if (code === 0) return finish();

      flushCapturedOutput();
      const signalNote = signal ? `, signal ${signal}` : "";
      finish(new Error(`Command failed (${code}${signalNote}): ${command}`));
    });
  });
}

/**
 * @template T
 * @param {(attempt: number) => Promise<T>} fn
 * @param {{ attempts?: number; backoffMs?: number; label?: string; onRetry?: (error: Error, attempt: number) => void }} [options]
 * @returns {Promise<T>}
 */
async function execWithRetry(fn, options = {}) {
  const attempts = options.attempts ?? 3;
  const backoffMs = options.backoffMs ?? 5000;
  const label = options.label ?? "cmd";
  /** @type {Error | undefined} */
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= attempts) break;

      options.onRetry?.(lastError, attempt);
      const delay = backoffMs * 3 ** (attempt - 1);
      prefixLine(
        label,
        `Attempt ${attempt}/${attempts} failed, retrying in ${Math.round(delay / 1000)}s...`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Concurrency limiter
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
  console.log("Checking prerequisites...");
  for (const bin of ["git", "npm", "zip"]) {
    try {
      execQuiet(`which ${bin}`);
      console.log(`✓ ${bin} is available`);
    } catch {
      console.error(`✗ ${bin} is required but was not found in PATH.`);
      process.exit(1);
    }
  }
}

function setupDirectories() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  fs.mkdirSync(STAGE_DIR, { recursive: true });
}

function cleanup() {
  console.log("\nCleaning up clone directory...");
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  console.log("✓ Cleanup complete");
}

/**
 * @param {Project} project
 * @param {Map<string, string>} cloneCacheByGitUrl
 * @returns {Promise<string>}
 */
async function cloneRepositoryAsync(project, cloneCacheByGitUrl) {
  const repoPath = path.join(TEMP_DIR, project.name);
  prefixLine(project.name, `=== Cloning: ${project.title} ===`);

  const removePartial = () => {
    if (fs.existsSync(repoPath)) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  };

  const referencePath = cloneCacheByGitUrl.get(project.gitUrl);
  let useReference = Boolean(referencePath);

  if (referencePath) {
    prefixLine(
      project.name,
      `Will try reference clone from ${referencePath} (same git URL)`,
    );
  }

  removePartial();

  await execWithRetry(
    async (attempt) => {
      if (attempt > 1) removePartial();
      prefixLine(
        project.name,
        `Cloning ${project.gitUrl} @ ${project.tag} (attempt ${attempt})...`,
      );

      const referenceArg =
        useReference && referencePath
          ? `--reference ${JSON.stringify(referencePath)}`
          : "";

      const cloneCmd = [
        "git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 clone",
        "--depth 1",
        `--branch ${JSON.stringify(project.tag)}`,
        referenceArg,
        JSON.stringify(project.gitUrl),
        JSON.stringify(repoPath),
      ]
        .filter(Boolean)
        .join(" ");

      await execAsync(cloneCmd, {
        label: project.name,
        timeoutMs: CLONE_TIMEOUT_MS,
      });
    },
    {
      attempts: 3,
      backoffMs: 5000,
      label: project.name,
      onRetry: (error) => {
        const message = error.message;
        const stalled = message.includes("timed out");
        if (useReference) {
          useReference = false;
          prefixLine(
            project.name,
            "Reference clone unavailable; retrying without --reference...",
          );
        } else {
          prefixLine(
            project.name,
            stalled
              ? "Clone stalled (timed out or low speed), cleaning up and retrying..."
              : "Clone failed, cleaning up and retrying...",
          );
        }
        removePartial();
      },
    },
  );

  if (!cloneCacheByGitUrl.has(project.gitUrl)) {
    cloneCacheByGitUrl.set(project.gitUrl, repoPath);
  }

  return repoPath;
}

/**
 * Async version for parallel runs.
 * @param {Project} project
 * @param {string} repoPath
 * @returns {Promise<boolean>} true if tests exited 0
 */
async function installAndTestAsync(project, repoPath) {
  const label = project.name;
  const installCmd = project.installCommand ?? "npm install";
  prefixLine(label, `Installing dependencies (${installCmd})...`);
  await execAsync(installCmd, {
    cwd: repoPath,
    label,
    timeoutMs: INSTALL_TIMEOUT_MS,
  });

  const testCmd = project.testCommand ?? DEFAULT_TEST_COMMAND;
  prefixLine(label, `Running tests: ${testCmd}`);
  const testEnv = {
    ...process.env,
    VITEST_MAX_WORKERS: process.env.VITEST_MAX_WORKERS ?? "2",
  };
  try {
    await execAsync(testCmd, {
      cwd: repoPath,
      label,
      timeoutMs: TEST_TIMEOUT_MS,
      env: testEnv,
    });
    return true;
  } catch {
    prefixLine(
      label,
      "⚠ Tests exited with a non-zero code; still collecting test-results if present.",
    );
    return false;
  }
}

/**
 * @param {Project} project
 * @param {string} repoPath
 * @returns {Promise<{ project: Project; testsOk: boolean; ok: boolean; reason?: string }>}
 */
async function processProjectAsync(project, repoPath) {
  try {
    const testsOk = await installAndTestAsync(project, repoPath);
    await collectTestArtifactsAsync(project, repoPath);
    return { project, testsOk, ok: true };
  } catch (error) {
    const reason = error?.message ? String(error.message) : String(error);
    prefixLine(project.name, `✗ Failed: ${reason}`);
    return { project, testsOk: false, ok: false, reason };
  }
}

/**
 * @param {Project} project
 * @param {string} repoPath
 * @returns {Promise<void>}
 */
async function collectTestArtifactsAsync(project, repoPath) {
  const resultsRel = project.testResultsDir ?? DEFAULT_TEST_RESULTS_DIR;
  const resultsPath = path.join(repoPath, resultsRel);

  if (!fs.existsSync(resultsPath)) {
    prefixLine(
      project.name,
      `✗ No folder ${resultsRel}; skipping artifact copy.`,
    );
    return;
  }

  /** @type {{ sourcePath: string; destBase: string }[]} */
  const plan = [];

  if (project.artifacts?.length) {
    for (const art of project.artifacts) {
      const src = path.join(resultsPath, art.source);
      if (!fs.existsSync(src)) {
        prefixLine(project.name, `✗ Missing expected file: ${art.source}`);
        continue;
      }
      const destBase = art.dest ?? path.basename(art.source);
      plan.push({ sourcePath: src, destBase });
    }
  } else {
    const entries = fs.readdirSync(resultsPath, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      plan.push({
        sourcePath: path.join(resultsPath, ent.name),
        destBase: ent.name,
      });
    }
  }

  await Promise.all(
    plan.map(async ({ sourcePath, destBase }) => {
      const prefixed = `${project.name}-${destBase}`;
      const destPath = path.join(STAGE_DIR, prefixed);
      await fs.promises.copyFile(sourcePath, destPath);
      prefixLine(project.name, `Copied → ${prefixed}`);
    }),
  );
}

/**
 * @param {string} zipPath
 */
function createZip(zipPath) {
  const files = fs.readdirSync(STAGE_DIR);
  if (files.length === 0) {
    console.warn("No files staged; skipping zip.");
    return;
  }
  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath, { force: true });
  }
  const quoted = files.map((f) => JSON.stringify(f)).join(" ");
  exec(
    `cd ${JSON.stringify(STAGE_DIR)} && zip -q ${JSON.stringify(
      zipPath,
    )} ${quoted}`,
  );
  console.log(`\n✓ Zip created: ${zipPath}`);
}

async function main() {
  console.log("=".repeat(60));
  console.log("Test Report Generator - Starting");
  console.log("=".repeat(60));

  const overallStart = process.hrtime.bigint();

  checkPrerequisites();
  setupDirectories();

  let successCount = 0;
  let failCount = 0;
  /** @type {{ name: string; title: string; reason: string }[]} */
  const erroredProjects = [];
  /** @type {{ name: string; title: string }[]} */
  const testFailedProjects = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const zipPath = path.join(OUTPUT_DIR, `test-reports-${stamp}.zip`);

  const cloneConcurrency = parseEnvInt("CLONE_CONCURRENCY", 1);
  const testConcurrencyFallback = parseEnvInt("TEST_CONCURRENCY", 0);
  const legacyConcurrency = parseEnvInt("CONCURRENCY", 0);
  const testConcurrency =
    testConcurrencyFallback > 0
      ? testConcurrencyFallback
      : legacyConcurrency > 0
        ? legacyConcurrency
        : 3;

  console.log(
    `Clone concurrency: ${cloneConcurrency} (CLONE_CONCURRENCY), test concurrency: ${testConcurrency} (TEST_CONCURRENCY / CONCURRENCY)`,
  );
  console.log(
    `Timeouts: clone=${Math.round(CLONE_TIMEOUT_MS / 1000)}s, install=${Math.round(INSTALL_TIMEOUT_MS / 1000)}s, test=${Math.round(TEST_TIMEOUT_MS / 1000)}s`,
  );
  if (SUPPRESS_CONSOLE) {
    console.log(
      "SUPPRESS_CONSOLE is enabled: hiding successful git/npm/zip output; failures will print captured logs.",
    );
  }

  /** @type {Map<string, string>} */
  const cloneCacheByGitUrl = new Map();
  /** @type {Map<string, string>} */
  const repoPaths = new Map();
  /** @type {Map<string, string>} */
  const cloneErrors = new Map();

  const cloneLimiter = createLimiter(cloneConcurrency);

  console.log("\n--- Phase 1: Cloning repositories ---");
  await Promise.all(
    projects.map((project) =>
      cloneLimiter(async () => {
        try {
          const repoPath = await cloneRepositoryAsync(
            project,
            cloneCacheByGitUrl,
          );
          repoPaths.set(project.name, repoPath);
        } catch (error) {
          const reason =
            error?.message ? String(error.message) : String(error);
          cloneErrors.set(project.name, reason);
          prefixLine(project.name, `✗ Clone failed after retries: ${reason}`);
        }
      }),
    ),
  );

  const testLimiter = createLimiter(testConcurrency);

  console.log("\n--- Phase 2: Install, test, and collect artifacts ---");
  const results = await Promise.all(
    projects.map((project) =>
      testLimiter(async () => {
        if (cloneErrors.has(project.name)) {
          return {
            project,
            testsOk: false,
            ok: false,
            reason: cloneErrors.get(project.name),
          };
        }
        const repoPath = repoPaths.get(project.name);
        if (!repoPath) {
          return {
            project,
            testsOk: false,
            ok: false,
            reason: "Clone path missing after phase 1",
          };
        }
        prefixLine(project.name, `=== Processing: ${project.title} ===`);
        return processProjectAsync(project, repoPath);
      }),
    ),
  );

  for (const r of results) {
    if (r.ok && r.testsOk) {
      successCount++;
      continue;
    }

    failCount++;
    if (!r.ok) {
      erroredProjects.push({
        name: r.project.name,
        title: r.project.title,
        reason: r.reason ?? "Unknown error",
      });
    } else if (!r.testsOk) {
      testFailedProjects.push({ name: r.project.name, title: r.project.title });
    }
  }

  createZip(zipPath);
  cleanup();

  const overallEnd = process.hrtime.bigint();
  const overallSeconds = Number(overallEnd - overallStart) / 1e9;

  console.log("\n" + "=".repeat(60));
  console.log("Test Report Generation Complete");
  console.log("=".repeat(60));
  console.log(`Projects with passing tests: ${successCount}`);
  console.log(`Projects with failures or clone/install errors: ${failCount}`);
  console.log(`Total time: ${overallSeconds.toFixed(2)}s`);
  if (testFailedProjects.length) {
    console.log("\nProjects with failing tests:");
    for (const p of testFailedProjects) {
      console.log(`- ${p.name} (${p.title})`);
    }
  }
  if (erroredProjects.length) {
    console.log("\nProjects with errors (clone/install/run/copy):");
    for (const p of erroredProjects) {
      console.log(`- ${p.name} (${p.title}): ${p.reason}`);
    }
  }
  console.log(`\nOutput zip: ${zipPath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
