# SignalForge

SignalForge adalah screener Meteora DLMM untuk mencari pool Solana dengan momentum, efisiensi fee, dan risiko yang dapat dibandingkan dalam satu layar. Aplikasi ini **bukan bot auto-trading** dan tidak pernah meminta seed phrase atau private key.

## Dua antarmuka, satu server

Keduanya memakai API dan logika skor yang sama.

| Rute | Antarmuka |
| --- | --- |
| `/` | Landing page dengan hero 3D (three.js) dan ringkasan data langsung |
| `/app` | Dashboard **Forge**: ringkasan, scanner, riwayat sinyal, aturan, pengaturan |
| `/classic` | Antarmuka versi pertama, tidak diubah sama sekali |

Pemilihan bundel terjadi di `src/main.jsx` sebelum salah satu stylesheet dimuat, jadi CSS kedua antarmuka tidak pernah berada dalam satu dokumen. `src/App.jsx` dan `src/styles.css` milik antarmuka klasik tidak disentuh.

### Yang ada di dashboard Forge

- Skor dibaca sebagai suhu: satu skala warna dari besi dingin ke putih membara, dipakai di tabel, kartu, riwayat, dan command palette.
- Scanner dengan dua bentuk tampilan (tabel padat dan kartu), pemilih kolom, kerapatan baris, dan enam tab: Semua, Lolos gate, Hot, Watch, Gagal gate, Watchlist.
- Panel detail pool: radar lima komponen skor, dial risiko, grafik momentum, hasil gate preset, panel keamanan, dan rincian fee.
- Watchlist tersimpan di browser, command palette `⌘K` / `Ctrl+K`, pintasan `/` untuk cari dan `r` untuk muat ulang.
- Tema gelap, terang, atau ikut sistem.

## Yang sudah berfungsi

- Scan 250 pool dari API resmi Meteora setiap 30 detik.
- Ambil candle 1 jam untuk maksimal 48 kandidat secara paralel.
- Preset **Yanman-like**, **Auzhinta-like**, dan **Swanny-like** dengan aturan yang transparan.
- Score 0–100: momentum 25, fee efficiency 25, volume quality 20, security 20, freshness 10.
- **Kecepatan fee**: fee/TVL direkam tiap scan, lalu dibandingkan dengan puncaknya dalam jendela 45 menit.
- Notifikasi berbunyi **berbeda per preset**, jadi bunyinya sendiri sudah memberi tahu gate mana yang lolos.
- Risk score 0–100 dengan flag freeze authority, blacklist, verifikasi, TVL tipis, usia pool, dan data holder yang belum tersedia.
- Pencarian, filter angka, tab Hot/Watch/Skipped, panel inspeksi, tautan ke Meteora.
- Kolom keamanan JupShield, RugCheck, dan Jupiter Organic Score dengan fallback saat data belum tersedia.
- Telegram alert manual dan scanner otomatis opsional, dengan cooldown per pool.
- Notifikasi Watch/Hot berbunyi saat pool baru masuk status atau naik dari Watch ke Hot, dengan opsi desktop notification.
- Tampilan desktop, tablet, dan mobile; animasi menghormati `prefers-reduced-motion`.

## Menjalankan

Butuh Node.js 20 atau lebih baru.

```bash
npm install
npm run dev
```

Buka `http://127.0.0.1:4173`.

Untuk build produksi:

```bash
npm run build
npm start
```

## Mengaktifkan Telegram

1. Salin `.env.example` menjadi `.env`.
2. Isi `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID`.
3. Untuk alert otomatis, ubah `ENABLE_ALERTS=true`.
4. Pilih `SCANNER_PRESET=yanman`, `auzhinta`, atau `swanny`.
5. Restart aplikasi dan klik **Telegram → Kirim pesan tes**.

Token Telegram hanya dibaca oleh server. Browser tidak pernah menerima nilainya.

## Arti preset

| Aturan | Yanman-like | Auzhinta-like | Swanny-like |
| --- | ---: | ---: | ---: |
| Market cap | $100K–$10M | $400K–$15M | $100K–$15M |
| TVL minimum | $500 | $35K | $500 |
| Momentum 1h | 20–200% | 0–400% | bebas |
| Volume 1h minimum | $5K | $10K | $1K |
| Fee/TVL minimum | 0.5% | 1.0% | — |
| Bin step | — | 50–400 | — |
| Base fee minimum | — | 2% | — |
| Mode fee | — | Base + quote | — |
| Cluster terbesar maksimum | — | 40% | — |
| Top-10 holder maksimum | — | 40% | rubrik |
| Saldo dev maksimum | — | 1% | rubrik |
| Holder minimum | — | 500 | — |
| Mint authority | — | Wajib off | Wajib off |
| Umur pool maksimum | — | 72 jam | — |
| Umur **token** minimum | — | — | rubrik (≥24 jam) |
| Rubrik screening | — | — | 12 metrik, tolak merah |
| Ambang Hot / Watch | 80 / 65 | 60 / 48 | 80 / 65 |
| Freeze authority | Wajib off | Wajib off | Wajib off |
| Cooldown alert | 15 menit | 10 menit | 20 menit |

Ketiganya rekonstruksi dari materi yang pernah dibagikan terbuka, bukan klaim bahwa ini strategi
persis milik orang tersebut.

**Yanman-like** agresif dan dapat memasukkan pool dengan likuiditas sangat tipis.

**Auzhinta-like** menyalin checklist yang ditulis terbuka di artikel “Cara Gue LP di Meteora”.
Sebagian besar angkanya disebut langsung di sana, bukan hasil terkaan: MCAP ≥ $400K, holder ≥ 500,
cluster Bubblemaps 40%+ ditolak, dev wallet idealnya 0%, NoMint wajib, base fee 2–3%, dan range
min price −70% s/d −80%.

Tiga hal yang membuatnya berbeda dari preset lain:

- **Fee harus base + quote, bukan quote saja.** Alasannya di artikel: “karna kita cari rebound pas
  dia turun jadi pas rebound pnl kedorong sama fee kita yang belum di claim”. Pool quote-only
  kehilangan dorongan itu. Terbaca dari `pool_config.collect_fee_mode`.
- **Bin step menentukan kedalaman, bukan diterima/ditolak.** Artikel memberi empat rig: BS 50 →
  −50/−60%, BS 80 → −60/−70%, BS 100 → −70/−80% (“paling umum dipake buat meme coin”), BS 400+ →
  −80% ke atas. Gate-nya karena itu 50–400, bukan satu angka.
- **Ambang Hot/Watch-nya sendiri.** Model 100 poin dibangun untuk pool yang tidak pernah dia
  sentuh: memecoin tanpa verifikasi kehilangan poin verifikasi dan jarang menahan volume/TVL 2x,
  jadi kandidat kuat pun mendarat di kisaran 50-an. Memakai tangga 65/80 akan mematikan semua
  alert-nya.

`Swap per trader` adalah proksi kasar untuk langkah cek wash trade; median live-nya sekitar 1,7x,
jadi batas 6x hanya menjaring kasus ekstrem.

### Cluster wallet (pengecekan Bubblemaps)

Artikel memberi porsi terbesar ke langkah ini, lengkap dengan contoh kategori aman (cluster terbesar
3,63%) dan berbahaya (satu cluster 371 wallet memegang 47,95%). API publik Bubblemaps sendiri sudah
mati — endpoint legacy-nya mengembalikan 404/500 untuk semua token, termasuk BONK dan WIF — jadi
datanya diambil dari `insiderNetworks` di report penuh RugCheck: kelompok wallet yang terhubung satu
sama lain lewat transfer, konsep yang sama dengan garis koneksi di Bubblemaps.

Yang dihitung: `clusterLargestPct` (porsi supply di cluster terbesar), `clusterLargestWallets`,
`clusterCount`, dan `clusteredSupplyPct`. Gate-nya memakai angka artikel: cluster terbesar ≤ 40%.

**Ini menangkap yang tidak bisa dilihat top-10.** Contoh dari data live: Chonketha punya top-10
22,3% dan dev balance 0% — dua-duanya hijau — tapi satu cluster 12 wallet memegang **69,6%** supply.
SPCX serupa: cluster 75,9% dengan top-10 hanya 35,7%. Keduanya lolos gate top-10 dan hanya tertahan
oleh gate cluster. Batas top-10 tetap dipertahankan karena kebalikannya juga terjadi: whale besar
yang tidak saling terhubung tidak akan muncul sebagai cluster.

Graf yang tidak terbaca dilaporkan `null` dan menggagalkan gate — Bubblemaps yang tidak dibuka bukan
berarti bersih. Daftar cluster kosong adalah jawaban sungguhan dan bernilai 0, bukan null.

Yang **tidak** dijadikan gate meski disebut di artikel: LP burnt 100%, karena pool yang benar-benar
dia garap (BUTTHOLE) tercatat LP terkunci 0% — “idealnya” di artikel jelas aspirasi, bukan syarat.
Jalur “Top Performance / Trending” untuk token yang lebih established juga sengaja tidak dicakup:
semua posisi yang pernah dia posting berumur di bawah 48 jam.

Snipers, insiders, bundler, dan Dex Paid dari checklist artikel itu kini **tersedia** lewat GMGN dan
dipakai oleh preset Swanny-like di bawah, tapi sengaja tidak ditambahkan ke Auzhinta-like: artikelnya
menyebut angka-angka itu sebagai pengecekan manual di GMGN, tanpa ambang yang bisa dikutip.

### Pool terbaik per token

Artikel menyuruh memilih “yang volume dan fees generated-nya paling gede — bukan yang fee rate-nya
paling tinggi” kalau satu token punya beberapa pool. Meteora rutin melisting token yang sama di
beberapa bin step, dan scanner menampilkannya sebagai baris terpisah. Server menandai baris yang
kalah lewat `richerSiblingPool`, dan panel detail menunjukkan pool mana yang seharusnya diambil.
Ini dilaporkan, bukan digate — pool yang lebih lemah itu pilihan yang lebih buruk, bukan berbahaya.

## Kecepatan fee

Gate hanya bisa menjawab “pool ini sedang membayar atau tidak”. Aturan keluar yang sebenarnya adalah
laju: keluar saat fee berhenti mengalir, terlepas dari arah harga. Itu butuh ingatan antar-scan, dan
itulah isi `shared/feeVelocity.js`.

Server menyimpan satu pembacaan `fee/TVL` per pool per scan di `data/fee-velocity.json`, membuang
sampel yang lebih tua dari 45 menit, lalu mengirim ringkasannya di setiap pool sebagai `feeVelocity`:

| Field | Arti |
| --- | --- |
| `current` / `peak` | Fee/TVL sekarang dan tertinggi dalam jendela |
| `ratioToPeak` | Angka utama — porsi terhadap puncaknya |
| `changePct` | Perubahan rata-rata paruh akhir vs paruh awal |
| `trend` | `rising`, `steady`, `decaying`, `stalled`, atau `unknown` |
| `minutesTracked` / `samples` | Rentang dan jumlah pembacaan |

Aturan `trend`, berurutan:

1. Kurang dari 3 sampel → `unknown`. Butuh minimal 3 scan (±90 detik).
2. `ratioToPeak < 0.4` → **`stalled`**, walaupun beberapa sampel terakhir naik. Yang menentukan
   adalah jarak dari puncak, bukan riak terakhir.
3. `changePct ≤ −25%` → `decaying`. `changePct ≥ +25%` → `rising`. Selebihnya `steady`.

Muncul sebagai kolom **Fee tren** di scanner dan panel **Kecepatan fee** di detail pool. Sebuah pool
bisa lolos gate (`fee/TVL ≥ 1%`) tapi tetap `stalled` — persis kondisi yang memicu cut loss by volume,
dan alasan kedua angka itu ditampilkan berdampingan.

Riwayatnya bertahan melewati restart, jadi posisi yang sedang berjalan tidak kehilangan jejak
peluruhannya.

## Swanny-like — pre-filter, bukan cara membuka posisi

Dua preset lain menjelaskan **cara masuk pool**. Yang ini hanya menjawab satu pertanyaan:
apakah token ini layak diriset sama sekali. Sumbernya rubrik ambang di DLMM Checker
(`dlmmchecker.vercel.app`), tool yang penulisnya pakai sebelum meneliti token apa pun.

Rubriknya mewarnai 12 metrik hijau / kuning / merah, bukan lolos / gagal. Bentuk itu
dipertahankan: **gate menolak merah dan menerima kuning**, sesuai cara tool-nya dibaca.
Warnanya tampil di panel “Rubrik screening” pada detail pool untuk **semua** preset, karena
pertanyaan “layak diriset atau tidak” tidak bergantung pada play yang kamu jalankan.

| Metrik | 🟢 | 🟡 | Sumber |
| --- | ---: | ---: | --- |
| RugCheck score | ≤ 14 | ≤ 25 | RugCheck |
| Organic score | ≥ 80 | ≥ 50 | Jupiter |
| Market cap | ≥ $500K | ≥ $100K | Meteora |
| Umur token | ≥ 168 jam | ≥ 24 jam | Meteora discovery |
| Top-10 holder | ≤ 15% | ≤ 30% | Meteora discovery |
| Saldo dev | ≤ 5% | ≤ 15% | Meteora discovery |
| Sniper % | ≤ 2% | ≤ 5% | GMGN |
| Jumlah sniper | ≤ 5 | ≤ 15 | GMGN |
| Insider | ≤ 5% | ≤ 12% | GMGN |
| Bundler | ≤ 5% | ≤ 12% | GMGN |
| Phishing | ≤ 2% | ≤ 8% | GMGN |
| Total fee | ≥ 100 SOL | ≥ 20 SOL | GMGN |

**Umur token dinilai terbalik dari Auzhinta-like.** Di sini makin tua makin aman (≥7 hari
hijau); di sana pool makin segar makin baik (≤72 jam). Dua metrik berbeda — umur *token* vs
umur *pool* — dan keduanya memang berlawanan arah. `tokenAgeHours` ditambahkan berdampingan
dengan `ageHours`, bukan menggantikannya.

Dua baris dari tool aslinya sengaja tidak dipakai: “GMGN Top 10 Holders” menduplikasi
“Top Holders” dari sumber kedua, dan “GMGN Total Fees” ambangnya (1 / 0.2) tidak cocok dengan
satuan yang dikembalikan API.

Presetnya **ketat**. Pada populasi 48 pool teratas by volume, median phishing 37,5% dan median
bundler 38,8% — jauh di atas batas merah 8% dan 12%. Nol pool lolos itu jawaban yang wajar,
bukan tanda rusak: pemiliknya sendiri bilang sebagian hari berarti nol posisi.

### GMGN

Enam baris di atas butuh `GMGN_API_KEY`. Tanpa key, baris itu bernilai null, ditandai abu-abu di
panel rubrik, dan gagal-tertutup di gate — jadi Swanny-like praktis tidak akan meloloskan apa pun.
Preset lain tidak terpengaruh sama sekali.

Key didapat di <https://gmgn.ai/ai>: buat key pair Ed25519 lokal, upload **public**-nya, aktifkan
**Reading** saja. Trading butuh 2FA plus tanda tangan private key dan tidak pernah dipakai proyek
ini. Autentikasinya header `X-APIKEY` plus `timestamp` dan `client_id` di query; server GMGN
menoleransi selisih jam ±5 detik. Batas lajunya longgar (~3 panggilan/detik terukur), tapi
permintaan tetap diantre satu jalur seperti RugCheck.

## Catatan risiko

- Data Top-10 holders, dev balance, JupShield, dan Organic Score berasal dari Pool Discovery API Meteora. RugCheck disimpan dalam cache agar pemindaian tidak membebani layanan eksternal.
- RugCheck membatasi laju permintaan cukup ketat: burst 39 mint tanpa jeda kehilangan sekitar sepertiga respons ke HTTP 429, dan kegagalan itu tersimpan sebagai “data tidak ada”. Semua permintaan ke host itu kini mengantre di satu jalur dengan jeda minimum dan satu kali retry, sehingga cakupannya penuh. Pemindaian dingin karena itu memakan ~16 detik sekali, lalu tersebar oleh jitter pada masa kedaluwarsa cache.
- Tidak ada score yang menjamin profit. Slippage, perubahan liquidity bin, smart-contract risk, dan pergerakan harga setelah alert tetap dapat menghasilkan kerugian.
- Backtest historis penuh belum termasuk MVP; endpoint `/api/history` merekam alert selama proses server masih hidup untuk paper review.
- Kecepatan fee dihitung dari snapshot 1 jam yang dikirim Meteora tiap scan, bukan dari fee posisi kamu sendiri. Dia menggambarkan pool, bukan PnL-mu.
