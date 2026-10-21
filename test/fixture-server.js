// Sahte UYAP sunucusu: content.js'i gerçek uzantı olmadan tarayıcıda denemek için.
const http = require("http");
const fs = require("fs");
const path = require("path");

const EXT = require("path").join(__dirname, "..");
const PORT = 8765;

function tree(page) {
  const head = `<script type="text/javascript">
	var pageTotal = 2;
	var pageNumber = ${page};
	var dosyaId='"DOSYA_TOKEN_${page}"';
	function dosyaEvrakSorgulaHTMLDVO(dosyaId,pageNumber) {}
</script>
<div class="row"><p>Toplam <span id="pageTotalSpan"></span> sayfadan <span id="pageNumberSpan"></span>. sayfa</p></div>
<hr>`;
  const docA = `<li data-sid='Genel Karar/Müzekkere 15/10/2026'><span class="file" data-html="true" title="&lt;div&gt;Birim Evrak No: 17647&lt;/div&gt;&lt;div&gt;Evrakın Onaylandığı Tarih : 15/10/2026&lt;/div&gt;&lt;div&gt;Gönderen Yer/Kişi: Gaziantep 9. Asliye Ceza Mahkemesi&lt;/div&gt;&lt;div&gt;Türü: Genel Karar/Müzekkere&lt;/div&gt;&lt;div&gt;Tipi: GDN&lt;/div&gt;" ce="V" evrak_id='"EV_A_${page}_${Math.random().toString(36).slice(2, 8)}"'>Genel Karar/Müzekkere 15/10/2026</span><ul><li><span class="file" ana_evrak_id="14885808042" evrak_id='"EV_A1"'>Ek 1</span></li><li><span class="file" ana_evrak_id="14885808042" evrak_id='"EV_A2"'>Ek 2</span></li></ul></li>`;
  const docB = `<li data-sid='Genel Karar/Müzekkere 05/10/2026'><span class="file" data-html="true" title="&lt;div&gt;Birim Evrak No: 16837&lt;/div&gt;&lt;div&gt;Evrakın Onaylandığı Tarih : 05/10/2026&lt;/div&gt;&lt;div&gt;Türü: Genel Karar/Müzekkere&lt;/div&gt;" ce="V" evrak_id='"EV_B"'>Genel Karar/Müzekkere 05/10/2026</span></li>`;
  const docC = `<li data-sid='Adli Tıptan Rapor Talebi 18/02/2026'><span class="file" data-html="true" title="&lt;div&gt;Birim Evrak No: 2211&lt;/div&gt;&lt;div&gt;Evrakın Onaylandığı Tarih : 18/02/2026&lt;/div&gt;&lt;div&gt;Türü: Adli Tıptan Rapor Talebi&lt;/div&gt;" evrak_id='"EV_C"'>Adli Tıptan Rapor Talebi 18/02/2026</span><ul><li><span class="file" ana_evrak_id="999" evrak_id='"EV_C1"'>Ek 1</span></li></ul></li>`;
  const docHata = `<li><span class="file" data-html="true" title="&lt;div&gt;Birim Evrak No: 1&lt;/div&gt;&lt;div&gt;Evrakın Onaylandığı Tarih : 01/01/2026&lt;/div&gt;&lt;div&gt;Türü: Bozuk Evrak&lt;/div&gt;" evrak_id='"EV_HATA"'>Bozuk Evrak 01/01/2026</span></li>`;

  let body;
  if (page === 1) {
    body = `<ul id="browser" class="filetree treeview-gray"><li><span class="folder">Antalya 17. Asliye Ceza Mahkemesi 2025/711</span><ul>
<li class="closed"><span class="folder" style="color: red;">Dosyaya Eklenen Son 20 Evrak</span><ul>${docA}${docB}</ul></li>
<li class="closed"><span class="folder">Genel Karar/Müzekkere (2)</span><ul>${docA}${docB}${docHata}</ul></li>
<li class="closed"><span class="folder">2026/13 (Talimat Dosyası)</span><ul id="dosyaSiraNo1"><li class="closed"><span class="folder">Genel Karar/Müzekkere (1)</span><ul>${docC}</ul></li></ul></li>
</ul></li></ul>`;
  } else {
    body = `<ul id="browser" class="filetree treeview-gray"><li><span class="folder">Antalya 17. Asliye Ceza Mahkemesi 2025/711</span><ul>
<li class="closed"><span class="folder">Tensip Zaptı (1)</span><ul><li><span class="file" title="&lt;div&gt;Birim Evrak No: 5&lt;/div&gt;&lt;div&gt;Evrakın Onaylandığı Tarih : 02/09/2025&lt;/div&gt;&lt;div&gt;Türü: Tensip Zaptı&lt;/div&gt;" evrak_id='"EV_D"'>Tensip Zaptı 02/09/2025</span></li></ul></li>
</ul></li></ul>`;
  }
  const tail = `<script>$("#browser").treeview();$('.file').dblclick( function() {		downloadDoc($(this).attr('evrak_id'), '"DOSYA_TOKEN_X"', '1');});</script>`;
  return head + body + tail;
}

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Sahte UYAP</title>
<link rel="stylesheet" href="/panel.css">
<style>body{font-family:sans-serif;padding:20px} .modal{border:1px solid #ccc;padding:12px;width:600px}
/* Gerçek sitedeki Bootstrap/Metronic gibi saldırgan kurallar: panel bunlara dayanmalı */
button{color:#333;font-size:15px;text-transform:uppercase;letter-spacing:.1em;text-shadow:0 1px 0 #fff;box-shadow:inset 0 -2px 0 rgba(0,0,0,.3);font-family:Georgia,serif}
label{font-weight:bold;color:#0a0;margin-bottom:10px;display:inline-block;font-size:18px}
input[type=checkbox]{margin:10px}
div,span{line-height:2.2}</style>
</head><body>
<h3>Sahte Vatandaş Portal</h3>
<button id="open">Dosya Görüntüle</button>
<button id="tab">Evrak sekmesi</button>
<div class="modal" id="dosya_goruntule_modal" hidden>
  <div id="dosyaTitle">2025/711 - Antalya 17. Asliye Ceza Mahkemesi</div>
  <div id="dosya_evrak_bilgileri_result"></div>
</div>
<script>
// chrome API taklidi
window.__msgs = [];
const listeners = [];
window.chrome = {
  storage: { local: { get: async () => ({}), set: async (v) => { console.log('storage.set', v); } } },
  runtime: {
    onMessage: { addListener: (fn) => listeners.push(fn) },
    sendMessage: async (msg) => {
      window.__msgs.push(msg);
      console.log('sendMessage', msg.type, JSON.stringify(msg).slice(0, 200));
      window.__saved = window.__saved || {};
      window.__hashes = window.__hashes || {};
      if (msg.type === 'readDosya') return null;
      if (msg.type === 'check') {
        const existing = {};
        for (const r of msg.relPaths) {
          if (window.__saved[r]) existing[r] = window.__saved[r];
          else if (r.includes('Tensip')) existing[r] = '/Users/x/Downloads/UYAP/' + msg.caseFolder + '/' + r + '.pdf';
        }
        return { existing };
      }
      if (msg.type === 'hashCheck') return { filename: window.__hashes[msg.hash] || null };
      if (msg.type === 'save') {
        await new Promise(r => setTimeout(r, 150));
        const f = '/Users/x/Downloads/UYAP/' + msg.caseFolder + '/' + msg.relPath + '.' + msg.ext;
        window.__saved[msg.relPath] = f;
        window.__hashes[msg.hash] = f;
        return { ok: true, filename: f };
      }
      return { ok: true };
    }
  }
};
document.getElementById('open').onclick = () => { document.getElementById('dosya_goruntule_modal').hidden = false; };
document.getElementById('tab').onclick = async () => {
  const r = await fetch('dosya_evrak_bilgileri_brd.ajx', { method: 'POST', body: new URLSearchParams({ dosyaId: 'x', pageNumber: '1' }) });
  const html = await r.text();
  const el = document.getElementById('dosya_evrak_bilgileri_result');
  el.innerHTML = html; // script çalışmaz ama DOM'da kalır, gerçek sayfada da öyle
};
</script>
<script src="/content.js"></script>
</body></html>`;

http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/main/jsp/vatandas/index.jsp" || u.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(page);
  }
  if (u.pathname.endsWith("dosya_evrak_bilgileri_brd.ajx")) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const p = new URLSearchParams(body);
      const n = parseInt(p.get("pageNumber") || "1", 10);
      console.log("ajx page", n, "dosyaId", p.get("dosyaId"));
      res.writeHead(200, { "Content-Type": "text/xml; charset=utf-8" });
      res.end(tree(n));
    });
    return;
  }
  if (u.pathname.endsWith("dosya_evrak_turu_brd.ajx")) {
    res.writeHead(200, { "Content-Type": "text/xml" });
    return res.end("<root><MimeTypes>Udf</MimeTypes></root>");
  }
  if (u.pathname.endsWith("view_document_brd.uyap")) {
    console.log("view", u.search);
    const id = u.searchParams.get("evrakId");
    if (id === "EV_HATA") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<html>Hata</html>"); }
    if (id === "EV_C1") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<html>viewer yok</html>"); }
    // EV_A2 ile EV_B aynı içerik -> hash kopyası
    const body = id === "EV_A2" ? "EV_B" : id;
    res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="goruntule.pdf"' });
    return res.end(Buffer.from("%PDF-1.4 fake " + body));
  }
  if (u.pathname.endsWith("download_document_brd.uyap")) {
    console.log("download", u.search);
    if (u.searchParams.get("evrakId") === "EV_HATA") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": 'attachment; filename="Hata.html"' });
      return res.end("<html><body>Hata</body></html>");
    }
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": 'attachment; filename="evrak.udf"' });
    return res.end(Buffer.from("UDF dummy " + u.searchParams.get("evrakId")));
  }
  for (const f of ["/content.js", "/panel.css"]) {
    if (u.pathname === f) {
      res.writeHead(200, { "Content-Type": f.endsWith(".css") ? "text/css" : "application/javascript" });
      return res.end(fs.readFileSync(path.join(EXT, f)));
    }
  }
  res.writeHead(404);
  res.end("nope");
}).listen(PORT, () => console.log("fixture on http://localhost:" + PORT + "/main/jsp/vatandas/index.jsp"));
