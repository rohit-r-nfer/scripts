#!/usr/bin/env node

/**
 * SBOM Generator Script
 *
 * This script clones git repositories and generates Software Bill of Materials (SBOM)
 * using syft in CycloneDX JSON format.
 *
 * Prerequisites:
 * - syft must be installed (https://github.com/anchore/syft)
 * - git must be installed
 *
 * Usage: node sbom-generator.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Configuration
const TEMP_DIR = path.join(__dirname, ".sbom-temp");
const OUTPUT_DIR = path.join(__dirname, "sbom-output");

// Projects configuration
const projects = [
  {
    name: "watchmate-ui",
    title: "WatchMate UI",
    tag: "v1.0.10",
    gitUrl: "https://github.com/lumenbiomics/watchmate-ui.git",
  },
  {
    name: "3d-heart",
    title: "3D Heart",
    tag: "v2.0.4",
    gitUrl: "https://github.com/lumenbiomics/3d-heart.git",
  },
  {
    name: "three-js-utils",
    title: "Three.js Utils",
    tag: "v3.0.2",
    gitUrl: "https://github.com/lumenbiomics/three-js-utils.git",
  },
  {
    name: "geodesic-path",
    title: "Geodesic Path",
    tag: "v1.0.5",
    gitUrl: "https://github.com/lumenbiomics/geodesic-path.js.git",
  },
  {
    name: "us-dicom-viewer",
    title: "US DICOM Viewer",
    tag: "v1.0.11",
    gitUrl: "https://github.com/lumenbiomics/us-dicom-viewer.git",
  },
  {
    name: "utils",
    title: "Utils",
    tag: "v2.0.3",
    gitUrl: "https://github.com/lumenbiomics/utils.js.git",
  },
  {
    name: "tee-ui-components",
    title: "Tee UI Components",
    tag: "v1.0.15",
    gitUrl: "https://github.com/lumenbiomics/tee-ui-components.git",
  },
  {
    name: "anu",
    title: "Anu",
    tag: "v1.0.10",
    gitUrl: "https://github.com/lumenbiomics/anu.git",
  },
];

/**
 * Execute a shell command and log the output
 */
function exec(command, options = {}) {
  console.log(`\n$ ${command}`);
  try {
    const output = execSync(command, {
      stdio: "inherit",
      ...options,
    });
    return output;
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    throw error;
  }
}

/**
 * Check if required tools are installed
 */
function checkPrerequisites() {
  console.log("Checking prerequisites...");

  try {
    execSync("which syft", { stdio: "pipe" });
    console.log("✓ syft is installed");
  } catch (error) {
    console.error(
      "✗ syft is not installed. Please install it from https://github.com/anchore/syft"
    );
    process.exit(1);
  }

  try {
    execSync("which git", { stdio: "pipe" });
    console.log("✓ git is installed");
  } catch (error) {
    console.error("✗ git is not installed. Please install git.");
    process.exit(1);
  }
}

/**
 * Create necessary directories
 */
function setupDirectories() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

/**
 * Clean up temporary directory
 */
function cleanup() {
  console.log("\nCleaning up temporary files...");
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  console.log("✓ Cleanup complete");
}

/**
 * Clone a git repository at a specific tag
 */
function cloneRepository(project) {
  const repoPath = path.join(TEMP_DIR, project.name);

  console.log(`\n=== Processing: ${project.title} ===`);

  // Remove existing directory if it exists
  if (fs.existsSync(repoPath)) {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }

  // Clone the repository
  console.log(`Cloning ${project.gitUrl}...`);
  exec(
    `git clone --depth 1 --branch ${project.tag} ${project.gitUrl} ${repoPath}`
  );

  return repoPath;
}

/**
 * Generate SBOM for a project
 */
function generateSBOM(project, repoPath) {
  const outputFile = path.join(OUTPUT_DIR, `${project.name}.json`);

  console.log(`Generating SBOM for ${project.title}...`);

  // Build the syft command
  const command = `syft dir:${repoPath} --source-name "${project.title}" --source-version ${project.tag} --exclude ./examples --exclude ./example --exclude ./node_modules -o cyclonedx-json > ${outputFile}`;

  exec(command);

  console.log(`✓ SBOM generated: ${outputFile}`);

  // Display file size
  const stats = fs.statSync(outputFile);
  const fileSizeInKB = (stats.size / 1024).toFixed(2);
  console.log(`  File size: ${fileSizeInKB} KB`);
}

/**
 * Main execution function
 */
function main() {
  console.log("=".repeat(60));
  console.log("SBOM Generator - Starting");
  console.log("=".repeat(60));

  checkPrerequisites();
  setupDirectories();

  let successCount = 0;
  let failCount = 0;

  for (const project of projects) {
    try {
      const repoPath = cloneRepository(project);
      generateSBOM(project, repoPath);
      successCount++;
    } catch (error) {
      console.error(`\n✗ Failed to process ${project.name}:`, error.message);
      failCount++;
    }
  }

  cleanup();

  console.log("\n" + "=".repeat(60));
  console.log("SBOM Generation Complete");
  console.log("=".repeat(60));
  console.log(`✓ Successful: ${successCount}`);
  console.log(`✗ Failed: ${failCount}`);
  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
}

// Run the script
if (require.main === module) {
  main();
}
