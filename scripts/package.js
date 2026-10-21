#!/usr/bin/env node
// Dağıtım zip'i üretir: yalnızca uzantının çalışması için gereken dosyalar.
// Kullanım: node scripts/package.js  ->  dist/mssoft-uyap-evrak-indirici-<sürüm>.zip

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const NAME = "mssoft-uyap-evrak-indirici";
const FILES = [
  "manifest.json",
  "content.js",
  "background.js",
  "panel.css",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "LICENSE",
  "NOTICE",
];

const dist = path.join(ROOT, "dist");
const stage = path.join(dist, NAME);
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

for (const f of FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) throw new Error("Eksik dosya: " + f);
  const dst = path.join(stage, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

const zipName = `${NAME}-${manifest.version}.zip`;
const zipPath = path.join(dist, zipName);
fs.rmSync(zipPath, { force: true });
execFileSync("zip", ["-r", "-X", "-q", zipName, NAME], { cwd: dist, stdio: "inherit" });
fs.rmSync(stage, { recursive: true, force: true });

const size = fs.statSync(zipPath).size;
console.log(`${path.relative(ROOT, zipPath)} (${(size / 1024).toFixed(1)} KB)`);
