# Changelog

Tüm önemli değişiklikler burada listelenir. Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/), sürümleme [SemVer](https://semver.org/lang/tr/).

## [1.0.1] — 2026-10-21

### Düzeltildi
- "Seçilenleri İndir" düğmesinin metni koyu zemin üzerinde koyu kalıyordu; panelin genel renk kuralı düğme ve durum renklerini eziyordu. Tüm panel kuralları `#uyd-panel` altına alındı; düğme metni beyaz, "indirildi" yeşil, "hata" kırmızı. Sitenin kendi `button`/`label` stilleri artık panele sızmıyor.

## [1.0.0] — 2026-10-21

İlk yayımlanan sürüm.

### Eklendi
- Dava modalında Evrak sekmesi yüklenince beliren panel: dosyadaki tüm evraklar ve ekler, tüm sayfalardan toplanır ve tik kutularıyla listelenir.
- **Seçmeli indirme.** Tümünü seç / seçimi kaldır, seçili sayacı, "Seçilenleri İndir (n)". Varsayılan olarak hiçbir şey kendiliğinden başlamaz; "Dosya açılınca otomatik başlat" seçeneği kapalı gelir.
- **Adlandırma.** `onay tarihi_evrak türü_birim evrak no.uzantı`; ekler `_Ek1`, `_Ek2`; talimat dosyası gibi alt dosyalar kendi alt klasörüne. Klasör: `İndirilenler/UYAP/<Mahkeme Esas No>/`.
- **PDF olarak kaydet.** Portalın kendi önizleme ucu kullanılır; PDF alınabiliyorsa `.pdf`, alınamıyorsa ham biçim (`.udf`, `.tif` vb.).
- **Tekrar indirmeme, üç katman.** Ağaçta tekilleştirme (birim evrak no + tarih + tür), ad kontrolü (uzantı kaydı + tarayıcı indirme geçmişi + dosya diskte mi), içerik kontrolü (SHA-256; aynı içerik ikinci kez yazılmaz, satırda hangi dosyayla çakıştığı görünür).
- Tarama sonrası diskte olanlar baştan "zaten var" işaretli ve tiksiz gelir; tiklenirse yeniden indirilir.
- Hata satırında neden görünür; satır seçili kalır, yeniden denenebilir. Oturum düşerse indirme durur.
- `SECURITY.md` (10 güvenlik koruması, tehdit modeli, zafiyet bildirimi), `LICENSE` (Apache-2.0), `NOTICE`.
- Bağımlılıksız `node --test` paketi: manifest ve izin değişmezleri, tehlikeli DOM sink'lerinin yokluğu, yol doğrulaması, uzantı allowlist'i, indirme geçmişi eşleşmesi.
- GitHub Actions CI: sözdizimi denetimi, testler, dağıtım zip artefaktı. `npm run package` ile yerel zip.
- Gerçek portala girmeden arayüzü denemek için sahte UYAP sunucusu (`test/fixture-server.js`).

### Güvenlik
- Arka plan servisinde her yol bileşeni doğrulanır; `..`, ayraç, denetim karakteri, noktayla başlayan/biten bileşen reddedilir.
- Dosya uzantısı yalnızca bilinen listeden seçilir; sunucunun verdiği ad olduğu gibi kullanılmaz.
- İndirme geçmişi araması tam bileşen eşleşmesiyle yapılır; benzer adlar ve farklı kök klasörler eşleşmez.
- Sunucu evrak yerine HTML döndürürse dosya diske yazılmaz.

[1.0.1]: https://github.com/lastref/mssoft-uyap-evrak-indirici/releases/tag/v1.0.1
[1.0.0]: https://github.com/lastref/mssoft-uyap-evrak-indirici/releases/tag/v1.0.0
