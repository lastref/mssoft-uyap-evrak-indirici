# Güvenlik · Security

MSSoft UYAP Evrak İndirici, yalnızca UYAP Vatandaş Portal sayfalarında çalışan bir tarayıcı uzantısıdır. Tasarım ilkesi: **en az yetki, UYAP dışına sıfır trafik, sıfır veri toplama.** Aşağıdaki korumaların her biri `npm test` ile çalışan test paketinde bir değişmez olarak kilitlidir; biri bozulursa CI kırmızıya döner.

## 10 güvenlik koruması

| # | Koruma | Nerede |
|---|---|---|
| 1 | **Sadece UYAP.** İçerik betiği yalnızca `https://vatandas.uyap.gov.tr/main/jsp/vatandas/*` adreslerinde çalışır; `host_permissions` yalnızca bu alan adı. Başka siteye dokunmaz. | `manifest.json` |
| 2 | **Üç izin, gerekçeli.** `downloads` (diske yazmak), `storage` (indirilenlerin kaydı), `scripting` (dosya kimliğini sayfadan okumak için yedek yol). `tabs`, `webRequest`, `cookies`, `<all_urls>` yok. | `manifest.json` |
| 3 | **Dış sunucu yok.** Tüm istekler kullanıcının zaten açık oturumuyla doğrudan UYAP'a gider. Telemetri, analitik, üçüncü taraf uç noktası yok. | `content.js`, `background.js` |
| 4 | **Trusted Types uyumlu DOM.** Panel `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `new Function`, `document.write` kullanmaz; her düğüm `createElement` ve `textContent` ile kurulur. Sunucudan gelen HTML yalnızca `DOMParser` ile ayrıştırılır, sayfaya basılmaz. | `content.js` |
| 5 | **Dosya yolu doğrulaması.** Klasör ve dosya adı bileşenleri sunucu verisinden türetilir ama arka plan servisinde her bileşen ayrı doğrulanır: boş, `.`, `..`, noktayla başlayan/biten, ayraç veya denetim karakteri içeren bileşen reddedilir. Yol her zaman `İndirilenler/UYAP/` altında kalır. | `background.js` → `safePath` |
| 6 | **Uzantı allowlist'i.** Dosya uzantısı sunucunun verdiği addan olduğu gibi alınmaz; yalnızca bilinen listeden (`pdf udf tif jpg png zip doc docx xml txt`) seçilir, tanınmayan her şey `.udf` olur. `.html`, `.exe`, `.js` gibi uzantılar diske yazılamaz. | `content.js` → `normalizeExt`, `background.js` → `SAFE_EXT` |
| 7 | **Hata sayfası diske değmez.** Her cevabın ilk baytları incelenir; HTML dönerse dosya yazılmaz, satır "hata" olarak işaretlenir. Oturum düşmüşse indirme durur. | `content.js` → `fetchDoc` |
| 8 | **Bellekte kalan dosya, diske tek yol.** Evrak `fetch` ile belleğe alınır, özetlenir ve tarayıcının kendi indirme mekanizmasıyla (`chrome.downloads`) yazılır. Uzantının dosya sistemine serbest erişimi yoktur; `saveAs: false`, `conflictAction: overwrite`. | `background.js` → `downloadTo` |
| 9 | **Mesaj şeması.** Arka plan servisi yalnızca bilinen tipteki (`check`, `hashCheck`, `save`, `readDosya`) mesajları işler; `readDosya` yalnızca gerçek bir sekmeden gelirse çalışır ve sayfadan sadece üç alan okur. | `background.js` |
| 10 | **Dış erişim kapalı.** `web_accessible_resources` ve `externally_connectable` tanımlı değil; web sayfaları uzantının dosyalarına ulaşamaz, uzantıya mesaj gönderemez. | `manifest.json` |

## Saklanan veri

`chrome.storage.local` içinde yalnızca şunlar tutulur:

- `done`: indirilen dosyanın göreli yolu → tarayıcı indirme kimliği, tam yol, zaman.
- `hashes`: dava klasörü → SHA-256 özeti → indirme kimliği, tam yol.
- `autoStart`, `savePdf`: iki ayar.

Evrak içeriği, kişisel veri, oturum bilgisi saklanmaz. Veriyi silmek için `chrome://extensions` → uzantı → **Site verilerini temizle**.

## Tehdit modeli

- **Kötü niyetli veya bozuk sunucu cevabı.** Dosya adı bileşenleri ve uzantı doğrulanır (5, 6); HTML cevap diske yazılmaz (7). Path traversal, keyfi uzantı ve yürütülebilir dosya düşürme engellenir.
- **UYAP sayfasında çalışan üçüncü taraf betik.** Uzantı izole dünyada çalışır; sayfa, uzantının mesaj kanalına erişemez (10). Sayfadan okunan tek şey `dosya_bilgileri` nesnesinin üç alanıdır ve yalnızca metin olarak kullanılır.
- **Yetki kötüye kullanımı.** Uzantı sekme listesi okuyamaz, başka siteye betik enjekte edemez, UYAP dışına istek atamaz (1, 2, 3).
- **Tedarik zinciri.** Çalışma zamanı bağımlılığı yok. `package.json` yalnızca `node --test` ve paketleme betiği için. Dağıtım zip'i `scripts/package.js` ile yalnızca gerekli dosyalardan üretilir.

## Zafiyet bildirimi

Bir güvenlik sorunu bulursanız lütfen herkese açık issue açmak yerine GitHub'ın **Security → Report a vulnerability** (private vulnerability reporting) özelliğini kullanın. 72 saat içinde dönüş yapılır; düzeltme yayımlanana kadar ayrıntıların gizli tutulmasını rica ederiz.

Desteklenen sürüm: `main` dalındaki son sürüm.

---

## English

MSSoft UYAP Evrak İndirici runs only on UYAP Citizen Portal pages and follows one rule: **least privilege, zero traffic outside UYAP, zero data collection.** Every guard above is locked in as an invariant in the `npm test` suite, so CI fails if one regresses.

Summary of guards: UYAP-only host permissions; three justified permissions (`downloads`, `storage`, `scripting`); no third-party endpoints; Trusted Types-compatible DOM construction; per-component path validation that keeps every file under `Downloads/UYAP/`; an extension allowlist (`pdf udf tif jpg png zip doc docx xml txt`, anything else becomes `.udf`); HTML error pages are never written to disk; files are written only through `chrome.downloads`; typed message handling; no `web_accessible_resources` or `externally_connectable`.

Stored data is limited to download records (relative path, download id, SHA-256 digest) and two settings. No document content, personal data or session data is stored.

To report a vulnerability, please use GitHub's **Security → Report a vulnerability** instead of a public issue. We respond within 72 hours.
