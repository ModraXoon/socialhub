# SocialHub

Kendi bilgisayarında çalışan sade bir sosyal medya planlayıcı. Instagram, Facebook sayfası, Threads, TikTok ve YouTube'a gönderi planlar, saati gelince otomatik paylaşır. Birden fazla hesabı (marka) ayrı ayrı yönetir.

- Panel sadece bu bilgisayardan açılır: http://127.0.0.1:4310
- Her markanın anahtarları ayrı dosyada durur: `brands/<marka>.env`
- Her markanın görsel ve videoları ayrı klasörde durur: `library/<marka>/`
- Anahtarlar, içerikler ve veritabanı git'e girmez (`.gitignore`).

> Kurulumu bir yapay zekâ ajanına yaptıracaksan ona sadece şunu söyle: **"AGENTS.md'yi oku ve SocialHub'ı benim için kur."**

## Hızlı başlangıç

```bash
npm install
cp .env.example .env      # Supabase bilgilerini doldur
npm start                 # http://127.0.0.1:4310
```

Panelden **Yeni marka** ile bir marka oluştur, sonra aşağıdaki adımlarla hesaplarını bağla.

Mac açılınca kendiliğinden başlasın: `zsh scripts/autostart.sh` (kaldırmak için `zsh scripts/autostart.sh remove`). Kayıtlar `data/socialhub.log` dosyasında.

## Deneme modu

`.env` içinde `DRY_RUN=1` olduğu sürece **hiçbir şey paylaşılmaz**, sadece "şunu paylaşacaktım" diye kaydedilir. Hesapları bağlayıp test ettikten sonra `DRY_RUN=0` yap ve programı yeniden başlat.

## Hesapları bağlama

Boş bıraktığın platform o marka için kapalı kalır.

### Instagram + Facebook (Meta)

1. Instagram hesabı **profesyonel** (işletme veya içerik üretici) olmalı ve bir Facebook sayfasına bağlı olmalı.
2. https://developers.facebook.com → **Uygulama oluştur**. Kullanım durumları: "Manage messaging & content on Instagram" ve "Manage everything on your Page".
3. Graph API Explorer'da şu izinlerle kullanıcı anahtarı al: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`.
4. `brands/<marka>.env` içine `META_APP_ID`, `META_APP_SECRET`, `META_USER_TOKEN` yaz, sonra: `npm run setup:meta -- <marka>`. Sayfa anahtarı ve Instagram kimliği otomatik kaydedilir.

Sadece kendi hesaplarına paylaştığın sürece (uygulamada rolün varken) Meta incelemesi gerekmez.

### Threads

1. Aynı Meta uygulamasına **"Access the Threads API"** kullanım durumunu ve `threads_content_publish` iznini ekle.
2. **App roles → Add People → Threads Tester** ile Threads hesabını ekle. Threads uygulamasında Ayarlar → Hesap → Web sitesi izinleri → Davetler'den kabul et.
3. Threads kullanım durumu → Settings → **User Token Generator** → Generate Access Token → Copy.
4. Terminalde: `THREADS_NEW_TOKEN="$(pbpaste)" npm run auth:threads -- <marka> [link]`. Link isteğe bağlı; "link profilde" yazan yerlere ve markadan bahseden gönderilere eklenir.

Threads'te sadece yazıdan oluşan gönderi de paylaşılabilir.

### TikTok

1. https://developers.tiktok.com → uygulama oluştur → "Login Kit" ve "Content Posting API" ekle. Yönlendirme adresi: `http://127.0.0.1:3455/callback/`.
2. `TIKTOK_CLIENT_KEY` ve `TIKTOK_CLIENT_SECRET` değerlerini marka dosyasına yaz, sonra: `npm run auth:tiktok -- <marka>` → açılan sayfada izin ver.
3. TikTok uygulamanı denetleyene kadar videolar **taslak** olarak TikTok gelen kutuna düşer; TikTok'tan tek dokunuşla yayınlarsın. Çok taslak birikirse TikTok yenilerini reddeder, düzenli temizle.

### YouTube

1. https://console.cloud.google.com → yeni proje → **YouTube Data API v3**'ü etkinleştir.
2. OAuth onay ekranını ayarla (Harici, kendini test kullanıcısı olarak ekle).
3. Kimlik bilgileri → **OAuth istemci kimliği** → tür "Masaüstü uygulaması". `YOUTUBE_CLIENT_ID` ve `YOUTUBE_CLIENT_SECRET` alanlarına yaz.
4. `npm run auth:youtube -- <marka>` → açılan Google sayfasında izin ver.
5. Google, denetlenmemiş projelerden yüklenen videoları **gizli** yapar; herkese açmak için YouTube Studio'dan elle değiştir veya API denetimine başvur.

## Medya barındırma (Supabase)

Instagram, Facebook ve Threads görsel/videoyu bilgisayardan değil internetten çeker. Paylaşım anında dosya Supabase'te gizli bir klasöre 1 saatlik linkle yüklenir, paylaşım bitince silinir. Ücretsiz bir Supabase projesi yeter: `.env` içine `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` yaz, klasör otomatik oluşturulur.

## Yapay zekâ etiketi

Gönderide "Yapay zekâ ile üretildi" işaretliyse YouTube'a "sentetik içerik" bildirimi gider. Instagram ve TikTok'ta bu etiketi API'den kesin ayarlayamıyoruz; paylaşımdan sonra uygulamadan kontrol et.
