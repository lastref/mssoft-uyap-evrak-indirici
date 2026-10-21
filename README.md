<p align="center">
  <img src="icons/icon128.png" width="72" alt="">
</p>

<h1 align="center">UYAP Evrak İndirici</h1>

<p align="center">
  UYAP Vatandaş Portalında açılan dava dosyasının bütün evraklarını ve eklerini tek seferde, düzenli klasörlere, tekrarsız indiren tarayıcı uzantısı.<br>
  <sub>MSSoft tarafından geliştirilmiştir. Chrome, Brave, Edge ve diğer Chromium tabanlı tarayıcılarda çalışır.</sub>
</p>

---

## Ne yapar

Vatandaş Portal her evrakı tek tek sağ tık → Kaydet ile indirmeyi gerektirir. Yüzlerce evrakı olan bir dosyada bu saatler sürer. Bu uzantı:

- Evrak sekmesi açıldığında dosyadaki **tüm evrakları ve ekleri** sayfa sayfa toplar,
- seçtiklerinizi sırayla indirir,
- her evrakı **tarih, tür ve birim evrak numarasıyla** adlandırır,
- mümkünse **PDF** olarak kaydeder,
- daha önce indirilmiş evrakları **atlar**, aynı içeriği ikinci kez diske yazmaz.

Uzantı yalnızca `vatandas.uyap.gov.tr` ile konuşur. Hiçbir veri başka bir yere gönderilmez; sunucu, analitik, hesap yoktur.

## Kurulum

Mağazada yayınlanmamıştır; elle yüklenir.

1. Bu depoyu indirin: **Code → Download ZIP**, sonra ZIP'i açın. (Ya da `git clone`.)
2. Tarayıcıda `chrome://extensions` adresini açın. Brave için `brave://extensions`, Edge için `edge://extensions`.
3. Sağ üstten **Geliştirici modu**nu açın.
4. **Paketlenmemiş öğe yükle** düğmesine basın, açtığınız klasörü seçin.

Güncelleme için klasörü yenisiyle değiştirip uzantı sayfasında **Yeniden yükle** demeniz yeterli.

## Kullanım

1. Vatandaş Portal'a giriş yapın. **Sorgulama İşlemleri → Dosya Sorgulama** ile davayı bulun, **Dosya Görüntüle** deyin.
2. Açılan pencerede **Evrak** sekmesine tıklayın.
3. Sağ altta panel belirir. Tüm evraklar tik kutularıyla listelenir; daha önce inmiş olanlar "zaten var" olarak işaretli ve tiki kaldırılmış gelir.
4. İstediklerinizi seçin (**Tümünü seç** / **Seçimi kaldır** kısayolları var) ve **Seçilenleri İndir** düğmesine basın.

Her satırda evrakın adı ve tarihi, altında diske yazılacak dosya adı, birim evrak numarası ve gönderen birim görünür. İndirme sırasında satırlar "sırada → indirildi / zaten var / hata" olarak güncellenir. Hatalı satırda neden yazılır, satır seçili kalır, yeniden deneyebilirsiniz. **Durdur** süren indirmeyi bitirip kalanı keser.

Panel altındaki seçenekler:

| Seçenek | Varsayılan | Açıklama |
|---|---|---|
| PDF olarak kaydet | açık | Portalın kendi dönüştürme ucu kullanılır. PDF alınamazsa evrak ham biçimiyle iner. |
| Dosya açılınca otomatik başlat | kapalı | Evrak sekmesi yüklenir yüklenmez inmemiş olanların tümünü indirir. |

## Dosya düzeni

```
İndirilenler/
└── UYAP/
    └── Antalya 17. Asliye Ceza Mahkemesi 2025-711/
        ├── 2025-09-02_Tensip Zaptı_5.pdf
        ├── 2026-10-15_Genel Karar-Müzekkere_17647.pdf
        ├── 2026-10-15_Genel Karar-Müzekkere_17647_Ek1.pdf
        ├── 2026-10-15_Genel Karar-Müzekkere_17647_Ek2.pdf
        └── 2026-13 (Talimat Dosyası)/
            └── 2026-02-18_Adli Tıptan Rapor Talebi_2211.pdf
```

- Klasör adı: mahkeme adı ve esas numarası.
- Dosya adı: `onay tarihi_evrak türü_birim evrak no`. Tarih başta olduğu için dosyalar kronolojik sıralanır.
- Ekler ana evrakın adına `_Ek1`, `_Ek2` eklenerek adlanır.
- Talimat dosyası gibi alt dosyalar kendi alt klasörüne iner.

Tarayıcınızın indirme konumunu değiştirdiyseniz `UYAP` klasörü oraya açılır.

## Tekrar indirmeme

Üç katman birlikte çalışır:

1. **Liste.** Portal aynı evrakı "Dosyaya Eklenen Son 20 Evrak" altında ve kendi türünün altında iki kez gösterir. Birim evrak no, tarih ve tür ile tekilleştirilir.
2. **Dosya adı.** İndirmeden önce uzantının kaydına ve tarayıcının indirme geçmişine bakılır. Dosya diskte duruyorsa sunucuya istek atılmaz.
3. **İçerik.** İnen her dosyanın SHA-256 özeti tutulur. Aynı dava klasöründe aynı özetli bir dosya varsa yenisi yazılmaz; satırda "Aynı içerik zaten var: <dosya>" görünür.

Bir dosyayı silerseniz bir sonraki çalıştırmada yeniden iner.

## PDF dönüştürme

UYAP evrakları çoğunlukla UDF biçimindedir. Portal, evrakı tarayıcıda önizlerken sunucuda PDF'e çevirir. Uzantı aynı ucu kullanır: PDF alınabiliyorsa `.pdf`, alınamıyorsa evrak ham haliyle (`.udf`, `.tif` vb.) kaydedilir. Dönüştürme sunucuda yapılır; uzantı UDF'yi kendisi çevirmez.

## Gizlilik ve güvenlik

- Uzantı yalnızca `https://vatandas.uyap.gov.tr/main/jsp/vatandas/*` sayfalarında çalışır.
- İstekler, tarayıcınızda zaten açık olan oturumla, doğrudan UYAP sunucusuna gider. Üçüncü bir taraf yoktur.
- Diske yazma tarayıcının kendi indirme mekanizmasıyla yapılır; uzantının dosya sistemine serbest erişimi yoktur.
- Uzantının sakladığı tek şey indirilen dosyaların adı, kimliği ve içerik özetidir (`chrome.storage.local`). Evrak içeriği saklanmaz.

İzinler: `downloads` (diske yazmak), `storage` (indirilenlerin kaydı), `scripting` (dosya kimliğini sayfadan okumak için yedek yol), `host_permissions` yalnızca UYAP alan adı.

## Sorun giderme

| Belirti | Ne yapmalı |
|---|---|
| Panel çıkmıyor | Evrak sekmesinin yüklendiğinden emin olun. Sayfayı yenileyip tekrar deneyin. Uzantı sayfasında **Yeniden yükle** deyin. |
| "Oturum düşmüş" | Portaldan çıkıp yeniden giriş yapın, davayı tekrar açın. |
| Satırda "Sunucu evrak yerine hata sayfası döndürdü" | Evrak portal tarafından o an verilemedi. Satır seçili kalır; biraz sonra tekrar deneyin. |
| Dosyalar `.udf` iniyor, PDF istiyorum | Sunucu o evrak için PDF üretemedi. UDF dosyalarını UYAP Doküman Editörü açar. |
| Hata ayrıntısı | Uzantı sayfasında **service worker** bağlantısına tıklayın; konsolda hata görünür. |

## Geliştirme

Depo yapısı:

```
manifest.json      MV3 bildirimi
content.js         sayfa betiği: ağacı toplar, paneli çizer, evrakları çeker ve özetler
background.js      arka plan servisi: diske yazar, kayıt tutar
panel.css          panel stilleri
icons/             simgeler ve üretici betik (make_icons.py, bağımlılık yok)
test/              sahte UYAP sunucusu
```

Gerçek portala girmeden arayüzü denemek için:

```bash
node test/fixture-server.js
```

Sonra `http://localhost:8765/main/jsp/vatandas/index.jsp` adresini açın. Sayfa `chrome.*` API'sini taklit eder, `content.js` ve `panel.css`'i doğrudan yükler; PDF, UDF, hata ve aynı-içerik senaryoları hazırdır.

Katkı: hata bildirimi ve çekme istekleri (pull request) açıktır. Değişiklik yapmadan önce bir konu (issue) açıp kısaca anlatmanız yeterli.

## Yasal uyarı

Bu proje T.C. Adalet Bakanlığı ya da UYAP ile ilişkili değildir, resmi bir ürün değildir. Yalnızca kendi hesabınızla erişebildiğiniz evrakları indirir; portalın kullanım koşullarına uymak kullanıcının sorumluluğundadır. Portal arayüzü değişirse uzantı çalışmayabilir.

## Lisans

[MIT](LICENSE) © 2026 MSSoft
