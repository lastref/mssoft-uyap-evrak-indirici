// UYAP Evrak İndirici - sayfa betiği
// Dava modalında Evrak sekmesi yüklenince evrak ağacını toplar, seçmeli bir liste çizer,
// seçilenleri arka plan servisine gönderir.

(() => {
  "use strict";

  const PANEL_ID = "uyd-panel";
  const DELAY_MS = 300;
  const MAX_DATAURL_BYTES = 40 * 1024 * 1024;
  const MIME_EXT = {
    "application/pdf": "pdf",
    "image/tiff": "tif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "application/zip": "zip",
  };
  const STATUS_TEXT = {
    idle: "",
    pending: "sırada",
    done: "indirildi",
    skipped: "zaten var",
    exists: "zaten var",
    error: "hata",
    stopped: "durduruldu",
  };

  const state = {
    dosyaIdRaw: null, // script içindeki hali (tırnaklı olabilir)
    dosyaId: null, // tırnaksız
    yargiTuru: "1",
    caseFolder: "",
    caseName: "",
    items: [],
    running: false,
    stopRequested: false,
    autoStart: false,
    savePdf: true,
    lastAutoStartedFor: null,
    closedFor: null, // kullanıcı paneli bu dosya için kapattıysa tekrar açma
    scanning: false,
    counts: null,
  };

  let panel = null;
  let ui = {};
  let scanTimer = null;

  init();

  async function init() {
    try {
      const s = await chrome.storage.local.get(["autoStart", "savePdf"]);
      if (typeof s.autoStart === "boolean") state.autoStart = s.autoStart;
      if (typeof s.savePdf === "boolean") state.savePdf = s.savePdf;
    } catch (_) {}

    const mo = new MutationObserver(() => {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(checkForTree, 400);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    checkForTree();
  }

  // ---------- Algılama ----------

  function checkForTree() {
    const container = document.querySelector("#dosya_evrak_bilgileri_result");
    const browser = container && container.querySelector("#browser");
    if (!browser) return;

    const scriptText = [...container.querySelectorAll("script")].map((s) => s.textContent).join("\n");
    const m = scriptText.match(/var\s+dosyaId\s*=\s*'([^']+)'/);
    const raw = m ? m[1] : null;
    if (!raw) {
      // Script DOM'da kalmamışsa sayfa dünyasından oku.
      chrome.runtime.sendMessage({ type: "readDosya" }).then((d) => {
        if (d && d.dosyaId && d.dosyaId !== state.dosyaId && state.closedFor !== d.dosyaId) {
          prepare(d.dosyaId, scriptText);
        }
      }).catch(() => {});
      return;
    }
    const clean = stripQuotes(raw);
    if (clean === state.dosyaId && (panel || state.closedFor === clean)) return;
    prepare(raw, scriptText);
  }

  async function prepare(dosyaIdRaw, scriptText) {
    if (state.scanning) return;
    state.scanning = true;
    state.dosyaIdRaw = dosyaIdRaw;
    state.dosyaId = stripQuotes(dosyaIdRaw);
    state.items = [];
    state.counts = null;
    state.running = false;

    const yt = scriptText.match(/downloadDoc\([^)]*?,\s*'(\d+)'\s*\)/);
    state.yargiTuru = yt ? yt[1] : "1";

    ensurePanel();
    setStatus("Evrak listesi taranıyor…");
    ui.list.textContent = "";
    ui.start.disabled = true;

    try {
      const first = await fetchPage(1);
      const pt = first.text.match(/var\s+pageTotal\s*=\s*(\d+)/);
      const pageTotal = pt ? Math.max(1, parseInt(pt[1], 10)) : 1;

      let collected = collect(first.doc);
      state.caseName = collected.caseName;
      let docs = collected.docs;
      for (let n = 2; n <= pageTotal; n++) {
        setStatus(`Sayfa ${n}/${pageTotal} okunuyor…`);
        const page = await fetchPage(n);
        docs = docs.concat(collect(page.doc).docs);
      }

      // Aynı evrak "Son 20 Evrak" ve kendi kategorisinde iki kez görünür; metadata ile tekille.
      const seen = new Set();
      const items = [];
      for (const d of docs) {
        if (seen.has(d.key)) continue;
        seen.add(d.key);
        items.push({ ...d, url: buildDownloadUrl(d.evrakId), status: "idle", selected: true, detail: "" });
      }
      state.items = items;
      state.caseFolder = sanitize(state.caseName) || `Dosya_${Date.now()}`;

      renderMeta();
      setStatus("Diskteki dosyalar kontrol ediliyor…");
      await markExisting();

      renderList();
      ui.start.disabled = false;
      const existing = items.filter((i) => i.status === "exists").length;
      setStatus(
        items.length
          ? `${items.length} evrak bulundu${existing ? `, ${existing} tanesi zaten inmiş` : ""}. İndirilecekleri seçip başlatın.`
          : "Bu dosyada evrak bulunamadı."
      );

      if (state.autoStart && items.some((i) => i.selected) && state.lastAutoStartedFor !== state.dosyaId) {
        state.lastAutoStartedFor = state.dosyaId;
        start();
      }
    } catch (e) {
      setStatus("Liste alınamadı: " + (e && e.message ? e.message : e), true);
    } finally {
      state.scanning = false;
    }
  }

  async function markExisting() {
    try {
      const res = await chrome.runtime.sendMessage({
        type: "check",
        caseFolder: state.caseFolder,
        relPaths: state.items.map((i) => i.relPath),
      });
      const existing = (res && res.existing) || {};
      for (const it of state.items) {
        if (existing[it.relPath]) {
          it.status = "exists";
          it.selected = false;
          it.filename = existing[it.relPath];
        }
      }
    } catch (_) {}
  }

  async function fetchPage(n) {
    const url = new URL("dosya_evrak_bilgileri_brd.ajx", location.href);
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams({ dosyaId: state.dosyaIdRaw, pageNumber: String(n) }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Sunucu ${res.status} döndürdü`);
    if (text.includes("nosession")) throw new Error("Oturum düşmüş, yeniden giriş yapın");
    if (text.indexOf("<error>") > 0) throw new Error("Sunucu hata döndürdü");
    const doc = new DOMParser().parseFromString(text, "text/html");
    return { text, doc };
  }

  // ---------- Ağaç ayrıştırma ----------

  function collect(doc) {
    const browser = doc.querySelector("#browser");
    if (!browser) return { caseName: "", docs: [] };

    const rootFolder = browser.querySelector(":scope > li > span.folder");
    const caseName = rootFolder ? rootFolder.textContent.trim() : "";
    const docs = [];

    browser.querySelectorAll("span.file[evrak_id]").forEach((span) => {
      const evrakId = stripQuotes(span.getAttribute("evrak_id") || "");
      if (!evrakId) return;
      const label = span.textContent.replace(/\s+/g, " ").trim();
      const li = span.closest("li");
      const isAttachment = span.hasAttribute("ana_evrak_id");

      // Talimat dosyası gibi alt dosyalar ayrı klasöre gider.
      const subdirs = [];
      let p = li ? li.parentElement : null;
      while (p && p !== browser) {
        if (p.tagName === "LI") {
          const f = p.querySelector(":scope > span.folder");
          if (f) {
            const t = f.textContent.trim();
            if (/^\d{4}\/\d+/.test(t)) subdirs.unshift(sanitize(t));
          }
        }
        p = p.parentElement;
      }

      let meta;
      let displayLabel = label;
      let info = "";
      if (isAttachment) {
        const parentLi = li && li.parentElement ? li.parentElement.closest("li") : null;
        const parentSpan = parentLi ? parentLi.querySelector(":scope > span.file") : null;
        const pm = parentSpan ? parseMeta(parentSpan) : null;
        const anaId = span.getAttribute("ana_evrak_id") || "";
        const ekNo = (label.match(/Ek\s*(\d+)/i) || [])[1];
        const suffix = ekNo ? `Ek${ekNo}` : sanitize(label);
        const base = pm ? pm.base : `Evrak_${sanitize(anaId) || "0"}`;
        meta = { base: `${base}_${suffix}`, key: `ek|${anaId}|${label}` };
        const parentLabel = parentSpan ? parentSpan.textContent.replace(/\s+/g, " ").trim() : "";
        displayLabel = parentLabel ? `${parentLabel} — ${label}` : label;
        info = pm ? pm.info : "";
      } else {
        meta = parseMeta(span);
        info = meta.info;
      }

      docs.push({
        evrakId,
        label: displayLabel,
        info,
        isAttachment,
        group: subdirs.join(" / "),
        relPath: [...subdirs, meta.base].join("/"),
        key: subdirs.join("/") + "|" + meta.key,
      });
    });

    return { caseName, docs };
  }

  // Tooltip metninden Birim Evrak No, onay tarihi ve türü çıkarır.
  function parseMeta(span) {
    const title = span.getAttribute("title") || span.getAttribute("data-original-title") || "";
    const fields = {};
    title
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .forEach((line) => {
        const i = line.indexOf(":");
        if (i > 0) fields[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      });

    const label = span.textContent.replace(/\s+/g, " ").trim();
    const evrakNo = fields["birim evrak no"] || "";
    const tarih = fields["evrakın onaylandığı tarih"] || fields["evrakin onaylandigi tarih"] || (label.match(/\d{2}\/\d{2}\/\d{4}/) || [])[0] || "";
    const tur = fields["türü"] || fields["turu"] || label.replace(/\s*\d{2}\/\d{2}\/\d{4}\s*$/, "");
    const gonderen = fields["gönderen yer/kişi"] || fields["gonderen yer/kisi"] || "";

    const iso = toIsoDate(tarih);
    const parts = [iso, sanitize(tur)].filter(Boolean);
    if (evrakNo) parts.push(sanitize(evrakNo));
    const base = parts.join("_") || sanitize(label) || "Evrak";
    const key = evrakNo ? `ev|${evrakNo}|${tarih}|${tur}` : `ev|${label}`;
    const infoBits = [];
    if (evrakNo) infoBits.push(`Evrak No ${evrakNo}`);
    if (gonderen) infoBits.push(gonderen);
    return { base, key, info: infoBits.join(" · ") };
  }

  function buildDownloadUrl(evrakId) {
    const u = new URL("download_document_brd.uyap", location.href);
    u.search =
      "evrakId=" + encodeURIComponent(evrakId) +
      "&dosyaId=" + encodeURIComponent(state.dosyaId) +
      "&yargiTuru=" + encodeURIComponent(state.yargiTuru);
    return u.toString();
  }

  // ---------- İndirme ----------

  async function start() {
    if (state.running) return;
    const chosen = state.items.filter((it) => it.selected);
    if (!chosen.length) {
      setStatus("İndirilecek evrak seçilmedi.", true);
      return;
    }
    for (const it of chosen) {
      it.status = "pending";
      it.detail = "";
      updateRow(it);
    }
    state.running = true;
    state.stopRequested = false;
    state.counts = { total: chosen.length, done: 0, skipped: 0, error: 0, stopped: 0 };
    renderCounts();
    setRunningUi(true);

    const c = state.counts;
    for (const it of chosen) {
      if (state.stopRequested) {
        it.status = "stopped";
        c.stopped++;
        updateRow(it);
        continue;
      }
      setStatus(`${c.done + c.skipped + c.error}/${c.total} işlendi · ${it.label}`);
      try {
        const r = await downloadOne(it);
        it.status = r.status;
        it.detail = r.detail || "";
        if (r.filename) it.filename = r.filename;
        it.selected = false;
        c[r.status === "done" ? "done" : "skipped"]++;
      } catch (e) {
        it.status = "error";
        it.detail = e && e.message ? e.message : String(e);
        c.error++;
        if (/oturum/i.test(it.detail)) {
          updateRow(it);
          renderCounts();
          break;
        }
      }
      updateRow(it);
      renderCounts();
      await sleep(DELAY_MS);
    }

    state.running = false;
    setRunningUi(false);
    const bits = [`${c.done} indirildi`];
    if (c.skipped) bits.push(`${c.skipped} zaten vardı`);
    if (c.error) bits.push(`${c.error} hata`);
    if (c.stopped) bits.push(`${c.stopped} durduruldu`);
    setStatus("Tamamlandı. " + bits.join(", ") + ".");
    updateSelectionUi();
  }

  function stop() {
    state.stopRequested = true;
    setStatus("Durduruluyor, süren indirme bitince kesilecek…");
  }

  // Tek evrak: ad kontrolü -> tür -> (PDF dene) -> ham indir -> hash kontrolü -> kaydet
  async function downloadOne(it) {
    const chk = await chrome.runtime.sendMessage({ type: "check", caseFolder: state.caseFolder, relPaths: [it.relPath] });
    const existingName = chk && chk.existing && chk.existing[it.relPath];
    if (existingName) return { status: "skipped", filename: existingName };

    const mime = await getMimeType(it.evrakId);

    let blob = null;
    let ext = null;
    let sourceUrl = null;
    if (state.savePdf) {
      const r = await fetchDoc(buildViewUrl(it.evrakId, mime));
      if (r && r.isPdf) {
        blob = r.blob;
        ext = "pdf";
        sourceUrl = r.url;
      }
    }
    if (!blob) {
      const r = await fetchDoc(it.url);
      if (!r) throw new Error("Sunucu evrak yerine hata sayfası döndürdü");
      blob = r.blob;
      ext = r.isPdf ? "pdf" : r.ext || extFromMimeType(mime);
      sourceUrl = r.url;
    }

    const hash = await sha256(blob);
    const dup = await chrome.runtime.sendMessage({ type: "hashCheck", caseFolder: state.caseFolder, hash });
    if (dup && dup.filename) {
      return { status: "skipped", filename: dup.filename, detail: "Aynı içerik zaten var: " + dup.filename.split(/[\\/]/).pop() };
    }

    const dataUrl = blob.size <= MAX_DATAURL_BYTES ? await blobToDataUrl(blob) : null;
    const res = await chrome.runtime.sendMessage({
      type: "save",
      caseFolder: state.caseFolder,
      relPath: it.relPath,
      ext,
      hash,
      dataUrl: dataUrl || sourceUrl,
      fallbackUrl: sourceUrl,
    });
    if (!res || !res.ok) throw new Error(res && res.error ? res.error : "Diske yazılamadı");
    return { status: "done", filename: res.filename };
  }

  // Sunucuya evrak türünü sorar (Udf, Pdf, Tiff...). Site tırnaklı gönderiyor, aynısını yapıyoruz.
  async function getMimeType(evrakId) {
    try {
      const res = await fetch(new URL("dosya_evrak_turu_brd.ajx", location.href), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
        body: new URLSearchParams({ evrakId: `"${evrakId}"` }),
      });
      const text = await res.text();
      if (text.includes("nosession")) throw new Error("Oturum düşmüş, yeniden giriş yapın");
      const m = text.match(/<MimeTypes>([^<]*)<\/MimeTypes>/);
      return m ? m[1].trim() : "";
    } catch (e) {
      if (/oturum/i.test(String(e.message))) throw e;
      return "";
    }
  }

  // Evrakı çeker. Hata sayfası dönerse null. PDF ise isPdf=true.
  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Sunucu ${res.status} döndürdü`);
    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    const disp = res.headers.get("content-disposition") || "";
    const blob = await res.blob();
    if (blob.size === 0) return null;

    const head = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
    const headText = new TextDecoder("latin1").decode(head);
    const isPdf = headText.startsWith("%PDF");
    if (!isPdf) {
      if (ctype.includes("text/html") || /^\s*</.test(headText)) {
        if (headText.includes("nosession")) throw new Error("Oturum düşmüş, yeniden giriş yapın");
        return null;
      }
    }

    // Uzantı yalnızca bilinen listeden seçilir; sunucudan gelen ad olduğu gibi kullanılmaz.
    let ext = null;
    const fm = disp.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    if (fm) {
      let name = "";
      try { name = decodeURIComponent(fm[1]).trim(); } catch (_) { name = fm[1].trim(); }
      const em = name.match(/\.([A-Za-z0-9]{1,5})$/);
      if (em) ext = normalizeExt(em[1]);
    }
    if (!ext) ext = MIME_EXT[ctype.split(";")[0].trim()] || null;
    return { blob, isPdf, ext, url };
  }

  // Bilinen uzantılar dışında hiçbir şey kabul edilmez.
  function normalizeExt(e) {
    const x = String(e || "").toLowerCase();
    const map = { pdf: "pdf", udf: "udf", tif: "tif", tiff: "tif", jpg: "jpg", jpeg: "jpg", png: "png", zip: "zip", doc: "doc", docx: "docx", xml: "xml", txt: "txt" };
    return map[x] || null;
  }

  function buildViewUrl(evrakId, mime) {
    const u = new URL("view_document_brd.uyap", location.href);
    u.search =
      "mimeType=" + encodeURIComponent(mime || "Udf") +
      "&evrakId=" + encodeURIComponent(evrakId) +
      "&dosyaId=" + encodeURIComponent(state.dosyaId) +
      "&yargiTuru=" + encodeURIComponent(state.yargiTuru);
    return u.toString();
  }

  function extFromMimeType(mime) {
    return normalizeExt(mime) || "udf";
  }

  async function sha256(blob) {
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---------- Panel ----------

  function ensurePanel() {
    if (panel && document.body.contains(panel)) return;
    panel = el("div", { id: PANEL_ID, class: "uyd-panel" });

    const head = el("div", { class: "uyd-head" });
    const title = el("span", { class: "uyd-title" }, "UYAP Evrak İndirici");
    const minBtn = el("button", { class: "uyd-icon-btn", type: "button", title: "Küçült" }, "–");
    const closeBtn = el("button", { class: "uyd-icon-btn", type: "button", title: "Kapat" }, "×");
    minBtn.addEventListener("click", () => {
      const collapsed = panel.classList.toggle("uyd-collapsed");
      minBtn.textContent = collapsed ? "+" : "–";
      minBtn.title = collapsed ? "Büyüt" : "Küçült";
    });
    closeBtn.addEventListener("click", () => {
      state.closedFor = state.dosyaId;
      panel.remove();
      panel = null;
    });
    head.append(title, el("span", { class: "uyd-spacer" }), minBtn, closeBtn);

    const body = el("div", { class: "uyd-body" });
    ui.caseName = el("div", { class: "uyd-case" });
    ui.folder = el("div", { class: "uyd-folder" });
    ui.counts = el("div", { class: "uyd-counts" });
    ui.barFill = el("div", { class: "uyd-bar-fill" });
    const bar = el("div", { class: "uyd-bar" }, ui.barFill);
    ui.status = el("div", { class: "uyd-status" });

    const tools = el("div", { class: "uyd-tools" });
    ui.selAll = el("button", { class: "uyd-link", type: "button" }, "Tümünü seç");
    ui.selNone = el("button", { class: "uyd-link", type: "button" }, "Seçimi kaldır");
    ui.selInfo = el("span", { class: "uyd-sel-info" });
    ui.selAll.addEventListener("click", () => setAllSelected(true));
    ui.selNone.addEventListener("click", () => setAllSelected(false));
    tools.append(ui.selAll, el("span", { class: "uyd-dot" }, "·"), ui.selNone, el("span", { class: "uyd-spacer" }), ui.selInfo);

    ui.list = el("div", { class: "uyd-list" });
    body.append(ui.caseName, ui.folder, ui.counts, bar, ui.status, tools, ui.list);

    const foot = el("div", { class: "uyd-foot" });
    const autoLabel = el("label", { class: "uyd-check" });
    ui.auto = el("input", { type: "checkbox" });
    ui.auto.checked = state.autoStart;
    ui.auto.addEventListener("change", () => {
      state.autoStart = ui.auto.checked;
      chrome.storage.local.set({ autoStart: state.autoStart }).catch(() => {});
    });
    autoLabel.append(ui.auto, el("span", {}, "Dosya açılınca otomatik başlat"));
    const pdfLabel = el("label", { class: "uyd-check" });
    ui.pdf = el("input", { type: "checkbox" });
    ui.pdf.checked = state.savePdf;
    ui.pdf.addEventListener("change", () => {
      state.savePdf = ui.pdf.checked;
      chrome.storage.local.set({ savePdf: state.savePdf }).catch(() => {});
    });
    pdfLabel.append(ui.pdf, el("span", {}, "PDF olarak kaydet"));
    const options = el("div", { class: "uyd-options" }, pdfLabel, autoLabel);
    ui.stop = el("button", { class: "uyd-btn", type: "button" }, "Durdur");
    ui.stop.addEventListener("click", stop);
    ui.start = el("button", { class: "uyd-btn uyd-btn-primary", type: "button" }, "Seçilenleri İndir");
    ui.start.addEventListener("click", start);
    foot.append(options, el("span", { class: "uyd-spacer" }), ui.stop, ui.start);

    panel.append(head, body, foot);
    document.body.appendChild(panel);
    setRunningUi(false);
  }

  function renderMeta() {
    ui.caseName.textContent = state.caseName || "Dava dosyası";
    ui.folder.textContent = `İndirilenler / UYAP / ${state.caseFolder}`;
    renderCounts();
  }

  function renderCounts() {
    const c = state.counts || { total: state.items.length, done: 0, skipped: 0, error: 0, stopped: 0 };
    ui.counts.textContent = "";
    const cells = [
      ["Toplam", c.total],
      ["İndirilen", c.done],
      ["Zaten var", c.skipped],
      ["Hata", c.error],
    ];
    for (const [k, v] of cells) {
      ui.counts.append(el("div", { class: "uyd-count" }, el("span", { class: "uyd-count-n" }, String(v)), el("span", { class: "uyd-count-k" }, k)));
    }
    const processed = c.done + c.skipped + c.error + c.stopped;
    ui.barFill.style.width = c.total ? Math.round((processed / c.total) * 100) + "%" : "0%";
  }

  function renderList() {
    ui.list.textContent = "";
    const hasGroups = state.items.some((it) => it.group);
    let lastGroup = null;
    state.items.forEach((it, idx) => {
      if (hasGroups && it.group !== lastGroup) {
        lastGroup = it.group;
        ui.list.appendChild(el("div", { class: "uyd-group" }, it.group || "Ana dosya"));
      }

      const row = el("div", { class: "uyd-row" });
      const check = el("input", { type: "checkbox", class: "uyd-row-check", id: `uyd-item-${idx}` });
      check.checked = it.selected;
      check.addEventListener("change", () => {
        it.selected = check.checked;
        if (it.selected && (it.status === "exists" || it.status === "done" || it.status === "skipped")) {
          // Yeniden indirmek istiyor; durumu sıfırla.
          it.status = "idle";
          it.detail = "";
          updateRow(it);
        }
        updateSelectionUi();
      });

      const main = el("label", { class: "uyd-row-main", for: `uyd-item-${idx}` });
      const titleEl = el("div", { class: "uyd-row-title" }, it.label);
      const fileEl = el("div", { class: "uyd-row-file" });
      const detailEl = el("div", { class: "uyd-row-detail" });
      main.append(titleEl, fileEl, detailEl);

      const status = el("span", { class: "uyd-row-status" });
      row.append(check, main, status);
      it.rowEl = row;
      it.checkEl = check;
      ui.list.appendChild(row);
      updateRow(it);
    });
    updateSelectionUi();
  }

  function updateRow(it) {
    if (!it.rowEl) return;
    it.rowEl.className = "uyd-row uyd-" + it.status + (it.selected ? "" : " uyd-unselected");
    it.rowEl.querySelector(".uyd-row-status").textContent = it.status in STATUS_TEXT ? STATUS_TEXT[it.status] : it.status;
    const fileEl = it.rowEl.querySelector(".uyd-row-file");
    const base = it.relPath.split("/").pop();
    fileEl.textContent = it.filename ? it.filename.split(/[\\/]/).pop() : base + (it.info ? "  ·  " + it.info : "");
    const detailEl = it.rowEl.querySelector(".uyd-row-detail");
    detailEl.textContent = it.detail || "";
    detailEl.hidden = !it.detail;
    if (it.checkEl) {
      it.checkEl.checked = it.selected;
      it.checkEl.disabled = state.running;
    }
    if (state.running && (it.status === "done" || it.status === "error" || it.status === "skipped")) {
      it.rowEl.scrollIntoView({ block: "nearest" });
    }
  }

  function setAllSelected(v) {
    if (state.running) return;
    for (const it of state.items) {
      it.selected = v;
      if (v && (it.status === "exists" || it.status === "done" || it.status === "skipped")) {
        it.status = "idle";
        it.detail = "";
      }
      updateRow(it);
    }
    updateSelectionUi();
  }

  function updateSelectionUi() {
    const n = state.items.filter((it) => it.selected).length;
    ui.selInfo.textContent = `${n} / ${state.items.length} seçili`;
    ui.start.textContent = n ? `Seçilenleri İndir (${n})` : "Seçilenleri İndir";
    ui.start.disabled = state.running || n === 0;
    ui.selAll.disabled = state.running;
    ui.selNone.disabled = state.running;
  }

  function setRunningUi(running) {
    ui.start.hidden = running;
    ui.stop.hidden = !running;
    for (const it of state.items) if (it.checkEl) it.checkEl.disabled = running;
    updateSelectionUi();
  }

  function setStatus(text, isError) {
    ui.status.textContent = text;
    ui.status.classList.toggle("uyd-status-error", !!isError);
  }

  // ---------- Yardımcılar ----------

  function el(tag, attrs, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v;
      else n.setAttribute(k, v);
    }
    for (const c of children) n.append(c);
    return n;
  }

  function stripQuotes(s) {
    return String(s).trim().replace(/^['"]+|['"]+$/g, "");
  }

  function sanitize(s) {
    return String(s || "")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/[\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^[\s.-]+|[\s.-]+$/g, "")
      .slice(0, 90);
  }

  function toIsoDate(ddmmyyyy) {
    const m = String(ddmmyyyy).match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  }
})();
