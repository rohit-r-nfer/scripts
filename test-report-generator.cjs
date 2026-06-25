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
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const TEMP_DIR = path.join(__dirname, "..", ".test-report-temp");
const OUTPUT_DIR = path.join(__dirname, "..", "test-report-output");
const STAGE_DIR = path.join(OUTPUT_DIR, "stage");
const DEFAULT_TEST_COMMAND = "npm run test";
const DEFAULT_TEST_RESULTS_DIR = "test-results";

function isTruthyEnv(value) {
  if (!value) return false;
  return ["1", "true", "yes", "y", "on"].includes(String(value).toLowerCase());
}

function isFalsyEnv(value) {
  if (value === undefined || value === null) return false;
  return ["0", "false", "no", "n", "off"].includes(String(value).toLowerCase());
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
    tag: "dev",
    gitUrl: "https://github.com/lumenbiomics/watchmate-ui.git",
    artifacts: [
      { source: "test-report.csv" },
      { source: "watchmateUiReport.html", dest: "test-report.html" },
    ],
  },
  {
    name: "3d-heart",
    title: "3D Heart",
    tag: "v3.0.0",
    gitUrl: "https://github.com/lumenbiomics/3d-heart.git",
    artifacts: [
      { source: "verbose-test-report.html", dest: "test-report.html" },
      { source: "test-report.csv" },
    ],
  },
  {
    name: "three-js-utils",
    title: "Three.js Utils",
    tag: "v3.0.4",
    gitUrl: "https://github.com/lumenbiomics/three-js-utils.git",
    artifacts: [
      { source: "verbose-test-report.html", dest: "test-report.html" },
      { source: "test-report.csv" },
    ],
  },
  {
    name: "geodesic-path",
    title: "Geodesic Path",
    tag: "v1.0.5",
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
    tag: "dev",
    gitUrl: "https://github.com/lumenbiomics/us-dicom-viewer.git",
    artifacts: [
      { source: "test-report.csv" },
      { source: "usDicomViewerReport.html", dest: "test-report.html" },
    ],
  },
  {
    name: "utils-js",
    title: "Utils",
    tag: "dev",
    gitUrl: "https://github.com/lumenbiomics/utils.js.git",
    artifacts: [
      { source: "test-report.csv" },
      { source: "utilsJsReport.html", dest: "test-report.html" },
    ],
  },
  {
    name: "tee-ui-components",
    title: "Tee UI Components",
    tag: "dev",
    gitUrl: "https://github.com/lumenbiomics/tee-ui-components.git",
    artifacts: [
      { source: "test-report.csv" },
      { source: "teeUiComponentsReport.html", dest: "test-report.html" },
    ],
  },
  {
    name: "tee-laac-ui",
    title: "Tee LAAC UI",
    tag: "dev",
    gitUrl: "https://github.com/lumenbiomics/tee-laac-ui.git",
    artifacts: [
      { source: "test-report.csv" },
      { source: "teeLaacUiReport.html", dest: "test-report.html" },
    ],
  },
  {
    name: "anu",
    title: "Anu",
    tag: "dev",
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
    tag: "dev",
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

    if (!SUPPRESS_CONSOLE) {
      const outRl = readline.createInterface({ input: child.stdout });
      const errRl = readline.createInterface({ input: child.stderr });
      outRl.on("line", (line) => prefixLine(label, line));
      errRl.on("line", (line) => prefixLine(label, line));
      child.on("close", () => {
        outRl.close();
        errRl.close();
      });
    }

    /** @type {Buffer[]} */
    const outChunks = [];
    /** @type {Buffer[]} */
    const errChunks = [];

    if (SUPPRESS_CONSOLE) {
      child.stdout.on("data", (b) => outChunks.push(Buffer.from(b)));
      child.stderr.on("data", (b) => errChunks.push(Buffer.from(b)));
    }

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) return resolve();

      if (SUPPRESS_CONSOLE) {
        const out = Buffer.concat(outChunks).toString("utf8");
        const err = Buffer.concat(errChunks).toString("utf8");
        if (out.trim()) process.stdout.write(out);
        if (err.trim()) process.stderr.write(err);
      }

      reject(new Error(`Command failed (${code}): ${command}`));
    });
  });
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
 * Async clone for parallel runs.
 * @param {Project} project
 * @returns {Promise<string>}
 */
async function cloneRepositoryAsync(project) {
  const repoPath = path.join(TEMP_DIR, project.name);
  prefixLine(project.name, `=== Processing: ${project.title} ===`);

  if (fs.existsSync(repoPath)) {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }

  prefixLine(project.name, `Cloning ${project.gitUrl} @ ${project.tag}...`);
  await execAsync(
    `git clone --depth 1 --branch ${project.tag} ${project.gitUrl} ${repoPath}`,
    { label: project.name },
  );

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
  await execAsync(installCmd, { cwd: repoPath, label });

  const testCmd = project.testCommand ?? DEFAULT_TEST_COMMAND;
  prefixLine(label, `Running tests: ${testCmd}`);
  try {
    await execAsync(testCmd, { cwd: repoPath, label });
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

  const envConcurrency = Number.parseInt(process.env.CONCURRENCY ?? "", 10);
  const defaultConcurrency = Math.max(
    2,
    Math.min(4, Math.floor((os.cpus()?.length ?? 4) / 2)),
  );
  const concurrency =
    Number.isFinite(envConcurrency) && envConcurrency > 0
      ? envConcurrency
      : defaultConcurrency;
  console.log(
    `Running with concurrency: ${concurrency} (set CONCURRENCY=N to override)`,
  );
  if (SUPPRESS_CONSOLE) {
    console.log(
      "SUPPRESS_CONSOLE is enabled: hiding successful git/npm/zip output; failures will print captured logs.",
    );
  }

  const limit = createLimiter(concurrency);

  const results = await Promise.all(
    projects.map((project) =>
      limit(async () => {
        try {
          const repoPath = await cloneRepositoryAsync(project);
          const testsOk = await installAndTestAsync(project, repoPath);
          await collectTestArtifactsAsync(project, repoPath);
          return { project, testsOk, ok: true };
        } catch (error) {
          const reason = error?.message ? String(error.message) : String(error);
          prefixLine(project.name, `✗ Failed: ${reason}`);
          return { project, testsOk: false, ok: false, reason };
        }
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
