#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = __dirname;
const htmlFile = path.resolve(repoRoot, process.argv[2] || "index.html");
const oneDFile = path.resolve(repoRoot, "sweep-results/1d-sweeps.json");
const twoDFile = path.resolve(repoRoot, "sweep-results/2d-heatmaps.json");
const scenariosFile = path.resolve(repoRoot, "sweep-results/scenarios.json");

function readJson(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing file: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

if (!fs.existsSync(htmlFile)) {
  console.error(`HTML file not found: ${htmlFile}`);
  process.exit(1);
}

const oneD = readJson(oneDFile);
const twoD = readJson(twoDFile);
const scenarios = readJson(scenariosFile);

const payload = {
  sweeps1D: oneD.sweeps || {},
  heatmaps: twoD.heatmaps || {},
  scenarios: scenarios.scenarios || {}
};

const embedBlock = `  <script>const OVERNIGHT_SWEEP = ${JSON.stringify(payload)};</script>\n`;
const overnightPattern = /^\s*<script>const OVERNIGHT_SWEEP = [\s\S]*?<\/script>\n?/m;
const legacyPattern = /^\s*<script>const SWEEP_DATA = [\s\S]*?<\/script>\n?/m;

let html = fs.readFileSync(htmlFile, "utf8");

if (overnightPattern.test(html)) {
  html = html.replace(overnightPattern, embedBlock);
} else if (legacyPattern.test(html)) {
  html = html.replace(legacyPattern, embedBlock);
} else if (html.includes("</body>")) {
  html = html.replace("</body>", `${embedBlock}</body>`);
} else {
  console.error("Could not find an existing embedded data block or </body>.");
  process.exit(1);
}

fs.writeFileSync(htmlFile, html, "utf8");

console.log(`Embedded OVERNIGHT_SWEEP into ${path.relative(repoRoot, htmlFile)}`);
console.log(`1D sweeps: ${Object.keys(payload.sweeps1D).length}`);
console.log(`2D heatmaps: ${Object.keys(payload.heatmaps).length}`);
console.log(`Scenarios: ${Object.keys(payload.scenarios).length}`);
