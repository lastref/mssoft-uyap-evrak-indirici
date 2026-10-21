// Bağımlılıksız test paketi: node --test
// Güvenlik korumalarını (SECURITY.md) ve yol/uzantı doğrulamasını değişmez olarak kilitler.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const contentSrc = read("content.js");
const backgroundSrc = read("background.js");

// ---------- manifest ----------

test("manifest: MV3, sürüm CHANGELOG ile uyumlu", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(read("CHANGELOG.md").includes(`[${manifest.version}]`), "CHANGELOG sürümü içermeli");
});

test("manifest: yalnızca üç izin, host yalnızca UYAP", () => {
  assert.deepEqual([...manifest.permissions].sort(), ["downloads", "scripting", "storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://vatandas.uyap.gov.tr/*"]);
  for (const cs of manifest.content_scripts) {
    for (const m of cs.matches) assert.match(m, /^https:\/\/vatandas\.uyap\.gov\.tr\/main\/jsp\/vatandas\//);
  }
});

test("manifest: dış erişim kapalı", () => {
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(manifest.optional_permissions, undefined);
});

test("manifest: marka ve ana sayfa", () => {
  assert.equal(manifest.author, "MSSoft");
  assert.match(manifest.name, /^MSSoft /);
  assert.match(manifest.homepage_url, /^https:\/\/github\.com\/lastref\/mssoft-uyap-evrak-indirici$/);
});

// ---------- tehlikeli sink'ler ----------

test("kaynak: innerHTML / eval / document.write yok", () => {
  const banned = [/\binnerHTML\b/, /\bouterHTML\b/, /insertAdjacentHTML/, /\beval\s*\(/, /new\s+Function\b/, /document\.write/];
  for (const src of [contentSrc, backgroundSrc]) {
    for (const re of banned) assert.doesNotMatch(src, re, `yasak sink: ${re}`);
  }
});

test("kaynak: UYAP dışına istek yok", () => {
  const urls = (contentSrc + backgroundSrc).match(/https?:\/\/[^\s"'`)]+/g) || [];
  for (const u of urls) {
    assert.ok(/^https:\/\/(vatandas\.uyap\.gov\.tr|github\.com\/lastref)/.test(u), `beklenmeyen URL: ${u}`);
  }
  assert.doesNotMatch(contentSrc + backgroundSrc, /importScripts\s*\(|new\s+XMLHttpRequest|new\s+WebSocket/);
});

test("kaynak: fetch yalnızca göreli UYAP uçlarına", () => {
  const endpoints = [...contentSrc.matchAll(/new URL\("([^"]+)", location\.href\)/g)].map((m) => m[1]);
  assert.ok(endpoints.length >= 4);
  for (const e of endpoints) assert.match(e, /^[a-z_]+\.(ajx|uyap)$/);
});

// ---------- arka plan: yol ve uzantı doğrulaması ----------

// chrome.downloads.search hem callback hem promise biçimiyle çağrılır; taklit ikisini de destekler.
function searchStub(impl) {
  return (q, cb) => {
    const r = Promise.resolve(impl(q));
    if (cb) r.then(cb);
    return r;
  };
}

function loadBackground() {
  const listeners = {};
  const chrome = {
    runtime: { onMessage: { addListener: (fn) => (listeners.message = fn) } },
    downloads: { onChanged: { addListener: () => {} }, search: searchStub(() => []), download: () => {} },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    scripting: { executeScript: async () => [] },
  };
  const ctx = { chrome, setTimeout, clearTimeout, console };
  vm.createContext(ctx);
  vm.runInContext(backgroundSrc, ctx, { filename: "background.js" });
  // const/let bildirimleri bağlam nesnesine çıkmaz; elle al.
  ctx.SAFE_EXT = vm.runInContext("SAFE_EXT", ctx);
  return ctx;
}

test("safePath: normal yol geçer, bileşenler korunur", () => {
  const { safePath } = loadBackground();
  assert.equal(
    safePath("Antalya 17. Asliye Ceza Mahkemesi 2025-711", "2026-13 (Talimat Dosyası)/2026-02-18_Adli Tıptan Rapor Talebi_2211_Ek1"),
    "Antalya 17. Asliye Ceza Mahkemesi 2025-711/2026-13 (Talimat Dosyası)/2026-02-18_Adli Tıptan Rapor Talebi_2211_Ek1"
  );
});

test("safePath: traversal, boş bileşen, gizli dosya, denetim karakteri reddedilir", () => {
  const { safePath } = loadBackground();
  assert.equal(safePath("x", "../../etc/passwd"), null);
  assert.equal(safePath("..", "a"), null);
  assert.equal(safePath("x", "a/./b"), null);
  assert.equal(safePath("x", "a//b"), null);
  assert.equal(safePath("", "a"), null);
  assert.equal(safePath("x", ".gitconfig"), null);
  assert.equal(safePath("x", "a."), null);
  assert.equal(safePath("x", "a\u0000b"), "x/ab");
  assert.equal(safePath("x", "a\\b"), "x/ab");
  assert.equal(safePath("x", "y".repeat(121)), null);
});

test("SAFE_EXT: yalnızca bilinen uzantılar", () => {
  const { SAFE_EXT } = loadBackground();
  for (const e of ["pdf", "udf", "tif", "jpg", "png", "zip", "doc", "docx", "xml", "txt"]) assert.ok(SAFE_EXT.has(e), e);
  for (const e of ["html", "htm", "exe", "js", "bat", "sh", "svg", "lnk"]) assert.ok(!SAFE_EXT.has(e), e);
});

test("handleSave: tanınmayan uzantı udf olur, kötü yol reddedilir", async () => {
  const ctx = loadBackground();
  let requested = null;
  ctx.chrome.downloads.download = (opts, cb) => {
    requested = opts;
    cb(7);
  };
  ctx.chrome.downloads.search = searchStub(() => [{ id: 7, state: "complete", exists: true, filename: "/dl/" + (requested ? requested.filename : "") }]);
  const ok = await ctx.handleSave({ caseFolder: "Dava", relPath: "2026-01-01_Tur_1", ext: "exe", hash: "h", dataUrl: "data:application/octet-stream;base64,AA==" });
  assert.equal(ok.ok, true);
  assert.equal(requested.filename, "UYAP/Dava/2026-01-01_Tur_1.udf");
  assert.equal(requested.conflictAction, "overwrite");
  assert.equal(requested.saveAs, false);

  const bad = await ctx.handleSave({ caseFolder: "Dava", relPath: "../x", ext: "pdf", dataUrl: "data:,x" });
  assert.equal(bad.ok, false);
});

test("findExisting: tam bileşen eşleşmesi, benzer adlar eşleşmez", async () => {
  const ctx = loadBackground();
  const rel = "UYAP/Dava/2026-10-15_Genel Karar-Müzekkere_17647";
  const files = [
    "/Users/x/Downloads/UYAP/Dava/2026-10-15_Genel Karar-Müzekkere_17647_Ek1.pdf",
    "/Users/x/Downloads/XUYAP/Dava/2026-10-15_Genel Karar-Müzekkere_17647.pdf",
    "C:\\Users\\x\\Downloads\\UYAP\\Dava\\2026-10-15_Genel Karar-Müzekkere_17647.pdf",
  ];
  ctx.chrome.downloads.search = searchStub((q) => {
    if (q.filenameRegex) {
      const re = new RegExp(q.filenameRegex);
      return files.filter((f) => re.test(f)).map((f) => ({ filename: f, exists: true, state: "complete" }));
    }
    return [];
  });
  const hit = await ctx.findExisting(rel, null);
  assert.equal(hit, files[2]);
});

// ---------- content: uzantı normalizasyonu (kaynak metninden) ----------

test("content: normalizeExt haritası allowlist ile aynı", () => {
  const m = contentSrc.match(/const map = \{([^}]+)\}/);
  assert.ok(m, "normalizeExt haritası bulunmalı");
  // Kaynak metni çalıştırılmaz; yalnızca `anahtar: "değer"` çiftleri sözcüksel olarak okunur.
  const map = {};
  for (const pair of m[1].split(",")) {
    if (!pair.trim()) continue;
    const kv = pair.match(/^\s*([a-z0-9]+)\s*:\s*"([a-z0-9]+)"\s*$/);
    assert.ok(kv, `beklenmeyen harita girdisi: ${pair.trim()}`);
    map[kv[1]] = kv[2];
  }
  assert.ok(Object.keys(map).length >= 8);
  const { SAFE_EXT } = loadBackground();
  for (const v of Object.values(map)) assert.ok(SAFE_EXT.has(v), `allowlist dışı: ${v}`);
  assert.equal(map.html, undefined);
  assert.equal(map.exe, undefined);
});

test("content: hata sayfası kontrolü ve PDF imzası var", () => {
  assert.match(contentSrc, /startsWith\("%PDF"\)/);
  assert.match(contentSrc, /text\/html/);
  assert.match(contentSrc, /nosession/);
});

// ---------- paketleme ----------

test("paket listesi: test ve geliştirme dosyaları dağıtıma girmez", () => {
  const pkg = read("scripts/package.js");
  for (const f of ["manifest.json", "content.js", "background.js", "panel.css", "LICENSE", "NOTICE"]) assert.ok(pkg.includes(`"${f}"`), f);
  assert.ok(!pkg.includes('"test/'));
  assert.ok(!pkg.includes('"scripts/'));
});
