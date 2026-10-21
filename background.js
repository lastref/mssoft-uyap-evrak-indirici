// UYAP Evrak İndirici - arka plan servisi
// Sayfa betiği dosyayı çeker ve hash'ler; burası diske yazar ve kayıt tutar.

const ROOT_DIR = "UYAP";
const DOWNLOAD_TIMEOUT_MS = 180000;

// downloadId -> { resolve, timer }
const waiters = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "check") {
    handleCheck(msg).then(sendResponse);
    return true;
  }

  if (msg.type === "hashCheck") {
    handleHashCheck(msg).then(sendResponse);
    return true;
  }

  if (msg.type === "save") {
    handleSave(msg).then(sendResponse);
    return true;
  }

  // Yedek yol: dosyaId sayfanın kendi JS değişkeninden okunur.
  if (msg.type === "readDosya") {
    if (!sender.tab) {
      sendResponse(null);
      return;
    }
    chrome.scripting
      .executeScript({
        target: { tabId: sender.tab.id },
        world: "MAIN",
        func: () => {
          try {
            const d = window.dosya_bilgileri;
            return d && d.dosyaId ? { dosyaId: String(d.dosyaId), dosyaNo: d.dosyaNo, birimAdi: d.birimAdi } : null;
          } catch (_) {
            return null;
          }
        },
      })
      .then((r) => sendResponse(r && r[0] ? r[0].result : null))
      .catch(() => sendResponse(null));
    return true;
  }
});

// Ada göre: daha önce indirilmiş ve hâlâ diskte duran dosya var mı?
async function handleCheck(msg) {
  const store = await chrome.storage.local.get("done");
  const done = store.done || {};
  const existing = {};
  for (const rel of msg.relPaths || []) {
    const safeRel = safePath(msg.caseFolder, rel);
    if (!safeRel) continue;
    const relPath = `${ROOT_DIR}/${safeRel}`;
    try {
      const f = await findExisting(relPath, done[relPath]);
      if (f) existing[rel] = f;
    } catch (_) {}
  }
  return { existing };
}

// İçeriğe göre: aynı hash'li dosya bu dava klasöründe zaten var mı?
async function handleHashCheck(msg) {
  const store = await chrome.storage.local.get("hashes");
  const hashes = store.hashes || {};
  const byCase = hashes[msg.caseFolder] || {};
  const rec = byCase[msg.hash];
  if (!rec) return { filename: null };
  // Dosya silinmişse kaydı düşür.
  const hits = await chrome.downloads.search({ id: rec.id });
  if (hits.length && hits[0].exists && hits[0].state === "complete") return { filename: hits[0].filename };
  delete byCase[msg.hash];
  hashes[msg.caseFolder] = byCase;
  await chrome.storage.local.set({ hashes });
  return { filename: null };
}

async function handleSave(msg) {
  const safeRel = safePath(msg.caseFolder, msg.relPath);
  const ext = SAFE_EXT.has(String(msg.ext || "").toLowerCase()) ? String(msg.ext).toLowerCase() : "udf";
  if (!safeRel) return { ok: false, error: "Geçersiz dosya yolu" };
  const relPath = `${ROOT_DIR}/${safeRel}.${ext}`;
  let result = await downloadTo(msg.dataUrl, relPath);
  if (result.error && msg.fallbackUrl) {
    // data: URL reddedildiyse sunucudan doğrudan indir (çerezler tarayıcıda).
    result = await downloadTo(msg.fallbackUrl, relPath);
  }
  if (result.error) return { ok: false, error: result.error };

  const store = await chrome.storage.local.get(["done", "hashes"]);
  const done = store.done || {};
  const hashes = store.hashes || {};
  done[`${ROOT_DIR}/${safeRel}`] = { id: result.id, filename: result.filename, at: Date.now() };
  if (msg.hash) {
    hashes[msg.caseFolder] = hashes[msg.caseFolder] || {};
    hashes[msg.caseFolder][msg.hash] = { id: result.id, filename: result.filename };
  }
  await chrome.storage.local.set({ done, hashes });
  return { ok: true, filename: result.filename };
}

async function findExisting(relPath, record) {
  if (record && record.id != null) {
    const hits = await chrome.downloads.search({ id: record.id });
    if (hits.length && hits[0].exists && hits[0].state === "complete") return hits[0].filename;
  }
  // Kayıt yoksa (ör. uzantı verisi silinmiş) indirme geçmişinden bak.
  // Tam bileşen eşleşmesi: başta ayraç, sonda uzantı. "/" hem macOS/Linux hem Windows ayracıyla eşleşsin.
  const regex = "(^|[/\\\\])" + escapeRegex(relPath).replace(/\//g, "[/\\\\]") + "\\.[A-Za-z0-9]{1,5}$";
  const hits = await chrome.downloads.search({ filenameRegex: regex, exists: true, state: "complete" });
  for (const h of hits) {
    const norm = h.filename.replace(/\\/g, "/");
    const idx = norm.lastIndexOf("/" + relPath + ".");
    if (idx >= 0 && /^[A-Za-z0-9]{1,5}$/.test(norm.slice(idx + relPath.length + 2))) return h.filename;
  }
  return null;
}

const SAFE_EXT = new Set(["pdf", "udf", "tif", "jpg", "png", "zip", "doc", "docx", "xml", "txt"]);

// Dava klasörü ve göreli yol: her bileşen temiz olmalı. Şüpheli bir şey varsa null.
function safePath(caseFolder, relPath) {
  const parts = [caseFolder, ...String(relPath || "").split("/")];
  const out = [];
  for (const raw of parts) {
    const p = String(raw || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim();
    if (!p || p === "." || p === ".." || /^\.+$/.test(p) || p.startsWith(".") || p.endsWith(".") || p.length > 120) return null;
    out.push(p);
  }
  return out.join("/");
}

function downloadTo(url, filename) {
  return new Promise((resolve) => {
    chrome.downloads.download({ url, filename, conflictAction: "overwrite", saveAs: false }, (id) => {
      if (chrome.runtime.lastError || id == null) {
        resolve({ error: chrome.runtime.lastError ? chrome.runtime.lastError.message : "İndirme başlatılamadı" });
        return;
      }
      waitForDownload(id).then(async (state) => {
        if (state !== "complete") {
          try { await chrome.downloads.erase({ id }); } catch (_) {}
          resolve({ error: state === "timeout" ? "Zaman aşımı" : "Yazma kesildi" });
          return;
        }
        const hits = await chrome.downloads.search({ id });
        resolve({ id, filename: hits.length ? hits[0].filename : filename });
      });
    });
  });
}

function waitForDownload(id) {
  return new Promise((resolve) => {
    // Çok küçük dosyalar onChanged gelmeden bitmiş olabilir; önce bir bak.
    chrome.downloads.search({ id }, (hits) => {
      if (hits.length && (hits[0].state === "complete" || hits[0].state === "interrupted")) {
        resolve(hits[0].state);
        return;
      }
      const timer = setTimeout(() => {
        waiters.delete(id);
        chrome.downloads.cancel(id, () => resolve("timeout"));
      }, DOWNLOAD_TIMEOUT_MS);
      waiters.set(id, { resolve, timer });
    });
  });
}

chrome.downloads.onChanged.addListener((delta) => {
  const w = waiters.get(delta.id);
  if (!w || !delta.state) return;
  const state = delta.state.current;
  if (state === "complete" || state === "interrupted") {
    clearTimeout(w.timer);
    waiters.delete(delta.id);
    w.resolve(state);
  }
});

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
