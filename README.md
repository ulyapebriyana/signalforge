# SignalForge

SignalForge adalah screener Meteora DLMM untuk mencari pool Solana dengan momentum, efisiensi fee, dan risiko yang dapat dibandingkan dalam satu layar. Aplikasi ini **bukan bot auto-trading**: tidak ada satu pun transaksi yang berjalan sendiri, dan tidak pernah meminta seed phrase atau private key.

Sejak fitur **zap out** ada, aplikasi ini bisa menyusun transaksi untuk menutup posisi LP Anda — tapi
tidak pernah menandatanganinya. Server menyusun dan meneruskan, wallet Anda yang menandatangani,
dan setiap transaksi butuh klik Anda sendiri. Tidak ada private key di server, dan itu bukan
kebetulan: lihat [Menutup posisi](#menutup-posisi-zap-out).

## Antarmuka

| Rute | Antarmuka |
| --- | --- |
| `/` | Landing page dengan hero 3D (three.js) dan ringkasan data langsung |
| `/app` | Dashboard **Forge**: ringkasan, scanner, posisi LP, riwayat sinyal, aturan, pengaturan |

### Yang ada di dashboard Forge

- Skor dibaca sebagai suhu: satu skala warna dari besi dingin ke putih membara, dipakai di tabel, kartu, riwayat, dan command palette.
- Scanner dengan dua bentuk tampilan (tabel padat dan kartu), pemilih kolom, kerapatan baris, dan enam tab: Semua, Lolos gate, Hot, Watch, Gagal gate, Watchlist.
- Tabel scanner dikendalikan dari judul kolomnya: klik untuk mengurutkan (Shift+klik untuk
  urutan bertingkat), seret untuk memindahkan kolom (Alt+←/→ dari papan ketik), dan tombol pin
  untuk membekukan kolom di tepi kiri atau kanan saat tabel digeser. Baris **Kolom filter**
  menyaring tiap kolom langsung di tabel — rentang min/maks untuk angka, pencarian untuk nama
  pool — dan kartu ikut hasil saringan yang sama.
- Panel detail pool: radar lima komponen skor, dial risiko, grafik momentum, hasil gate preset, panel keamanan, dan rincian fee.
- Watchlist tersimpan di browser, command palette `⌘K` / `Ctrl+K`, pintasan `/` untuk cari dan `r` untuk muat ulang.
- Tema gelap, terang, atau ikut sistem.

## Yang sudah berfungsi

- Scan empat halaman 250 pool dari API resmi Meteora setiap 15 detik: `volume_1h:desc`,
  `fee_tvl_ratio_1h:desc`, `tvl:desc`, dan `pool_created_at:desc`. Satu urutan tidak bisa melihat
  seluruh pasar — kepala urutan volume selalu pool tua dan besar, urutan TVL adalah satu-satunya
  yang menanyakan kedalaman secara langsung (properti yang jadi dasar preset Slow Wallet), dan
  urutan umur adalah satu-satunya yang menanyakan kebaruan.
- Halaman umur ditambahkan 2026-08-20 setelah pengukuran menunjukkan tiga urutan aliran itu
  melihat pasar yang nyaris beku: dalam 6 jam, 720 tick × 96 kandidat hanya berisi **219 pool
  berbeda**, 53 di antaranya menempati slot di ≥90% tick. Umur median kandidat dari halaman fee
  adalah 72 jam — bukan pool baru migrasi seperti asumsi awal — sedangkan dari halaman umur 8 jam.
- Ambil candle 1 jam untuk maksimal 96 kandidat secara paralel (48 dari halaman volume, 24 dari
  halaman fee, 24 dari halaman TVL yang belum terbawa).
- Plafon market cap pipeline **$500M** (sebelumnya $15M). Setiap pair yang benar-benar established
  di Solana ada di atas $15M, jadi plafon lama menjamin Slow Wallet tidak pernah bisa melihat jenis
  token yang justru jadi alasan preset itu ditulis.
- Dua preset: **Slow Wallet** (gate utama, aman dan pelan) dan **Heart Attack** (lawannya) dengan
  aturan yang transparan.
- Score 0–100: momentum 25, fee efficiency 25, volume quality 20, security 20, freshness 10.
- **Kecepatan fee**: fee/TVL direkam tiap scan, lalu dibandingkan dengan puncaknya dalam jendela 45 menit.
- **Baca pasar** (`shared/marketRead.js`): angka laju, bukan angka stok. Fase pool (Menyala /
  Jalan / Puncak / Meredup / Mati), dua burst yang tidak boleh dicampur, fee per menit, waktu
  ke 1%, impact per trade, dan porsi venue. Lihat [Baca pasar](#baca-pasar) di bawah.
- **Kolom scanner mengikuti preset**. Tiap preset membuka tabel dan urutan yang berbeda karena
  skala waktunya berbeda; Heart Attack membuka pada burst, bukan skor. Susunan kolom — pilihan,
  urutan, dan pin — disimpan per preset, jadi menata tabel Heart Attack tidak ikut mengubah
  tabel Slow Wallet. Urutan sortir dan filter kolom sengaja tidak disimpan: berganti preset
  membuka tabel pada sortir preset itu sendiri, tanpa saringan sisa.
- Notifikasi berbunyi **berbeda per preset**, jadi bunyinya sendiri sudah memberi tahu gate mana yang lolos.
- Risk score 0–100 dengan flag freeze authority, blacklist, verifikasi, TVL tipis, usia pool, dan data holder yang belum tersedia.
- Pencarian, filter angka, tab Hot/Watch/Skipped, panel inspeksi, tautan ke Meteora.
- Kolom keamanan JupShield, RugCheck, dan Jupiter Organic Score dengan fallback saat data belum tersedia.
- Telegram alert manual dan scanner otomatis opsional, dengan cooldown per pool.
- Notifikasi Watch/Hot berbunyi saat pool baru masuk status atau naik dari Watch ke Hot, dengan opsi desktop notification.
- **Pelacakan posisi LP** dari alamat wallet publik: status dalam/luar range, nilai posisi, fee
  belum diklaim, dan alert Telegram saat posisi berhenti menghasilkan fee.
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
4. Restart aplikasi dan klik **Telegram → Kirim pesan tes**.

Alert Telegram berjalan untuk **semua preset sekaligus**, masing-masing dengan ambang skor,
batas risiko, dan cooldown-nya sendiri. Setiap pesan menyebut preset mana yang meloloskannya;
kalau satu pool lolos beberapa preset, dikirim satu pesan yang menyebut semuanya, bukan pesan
berulang.

`SCANNER_PRESET` kini hanya menentukan preset untuk deteksi status di UI (bunyi dan lonceng),
bukan alert. `ALERT_MIN_SCORE`, `ALERT_MAX_RISK`, dan `ALERT_COOLDOWN_MINUTES` sudah tidak
dipakai — satu ambang global akan membungkam preset yang ladder-nya lebih rendah, misalnya
`ALERT_MIN_SCORE=65` yang mematikan Slow Wallet sepenuhnya (ladder-nya 38/30). Server
memperingatkan di log kalau ketiganya masih ada di `.env`.

Token Telegram hanya dibaca oleh server. Browser tidak pernah menerima nilainya.

## Melacak posisi LP

Scanner mencari tempat masuk. Halaman **Posisi** menjaga posisi yang sudah jalan, dan menjawab
satu pertanyaan yang tidak bisa ditanyakan ke daftar pool: apakah bin aktif masih ada di dalam
range Anda. Di luar range, posisi berhenti menghasilkan fee dan hanya memegang satu sisi token —
itulah sinyal keluar yang selama ini tidak dimiliki aplikasi ini.

Meteora tidak menyediakan endpoint posisi per wallet, jadi posisi dibaca **langsung dari chain**
lewat `@meteora-ag/dlmm` dan sebuah RPC Solana. Yang dibutuhkan hanya alamat publik:

1. Isi `SOLANA_RPC_URL` di `.env`. Helius: `https://mainnet.helius-rpc.com/?api-key=ISI_KEY_ANDA`.
   RPC publik Solana kena rate limit dan tidak cukup untuk polling.
2. Buka `/app/positions`, tempel alamat wallet, klik **Pantau**. Alamat disimpan di browser saja.
3. Untuk alert Telegram yang tetap jalan setelah tab ditutup, isi `LP_WALLETS` di `.env`
   (dipisah koma) dan pastikan `ENABLE_ALERTS=true`.

Alert dikirim untuk dua peristiwa: posisi yang tadinya menghasilkan fee **keluar range**, dan
posisi yang tadinya di tengah **bergeser ke tepi** — peringatan terakhir sebelum berhenti dapat
fee. Kembali masuk range sengaja dibiarkan diam, supaya posisi yang memantul di tepi tidak
mengirim pesan tiap kali. Pembacaan pertama setelah restart hanya mencatat keadaan, tidak
mengirim apa pun.

`LP_SCAN_SECONDS` (default 60, minimum 30) mengatur jarak antar pembacaan. Lebih lambat daripada
scan pool karena satu pembacaan menelusuri seluruh position account milik wallet dan ditagih per
panggilan RPC, sementara posisi hanya berubah kalau harga melewati bin.

Aplikasi ini tidak pernah meminta seed phrase atau private key, dan tidak pernah menandatangani
transaksi. Membaca posisi tidak memerlukan tanda tangan — karena itu tidak ada tombol *connect
wallet*: menyambungkan wallet tidak akan menghasilkan satu data pun yang tidak bisa didapat dari
alamat publik.

Yang belum ada: PnL sebenarnya dan impermanent loss. Keduanya butuh jumlah deposit saat posisi
dibuka, yang hanya ada di riwayat transaksi, bukan di state on-chain saat ini. Yang ditampilkan
adalah nilai posisi sekarang, fee yang sudah diklaim, dan fee yang belum diklaim.

## Menutup posisi (zap out)

Tombol **Zap out** menarik seluruh likuiditas, mengklaim fee, menutup posisi, lalu menukar sisa
token supaya Anda keluar sebagai satu aset saja.

**Siapa menandatangani apa.** Server menyusun transaksi dan meneruskannya ke chain; wallet Anda di
browser yang menandatangani. Server tidak pernah memegang private key — box ini punya URL publik,
dan kunci di sana berarti hot wallet yang terekspos internet. Karena itu wallet connect baru
diperlukan sekarang: **membaca** posisi tidak butuh tanda tangan, **memindahkan** dana butuh.

Zap out hanya aktif kalau wallet yang tersambung sama persis dengan wallet yang sedang dipantau.
Memantau alamat orang lain tetap boleh — tombolnya saja yang mati.

**Dua transaksi, bukan satu.** Jumlah yang ditukar baru diketahui setelah penarikan mendarat, jadi
penarikan dan swap tidak bisa digabung. Wallet akan meminta tanda tangan dua kali. Posisi dengan
range lebar bahkan butuh beberapa transaksi untuk penarikannya saja.

**Kalau gagal di tengah**, layarnya mengatakan itu apa adanya: berapa transaksi yang sudah mendarat,
dan peringatan untuk **tidak langsung mengulang** — sebagian dana sudah berpindah, dan menjalankan
lagi bisa menarik atau menukar dua kali.

Pengaman yang berlaku sebelum wallet diminta menandatangani:

- Setiap transaksi penarikan disimulasikan dulu; yang gagal simulasi tidak pernah sampai ke wallet.
- Price impact di atas 10% ditolak, di atas 2% diberi peringatan. Rute yang price impact-nya tidak
  terbaca **ditolak**, bukan dianggap aman.
- Jumlah yang ditukar dibatasi saldo wallet yang sebenarnya, jadi penarikan yang cuma sebagian
  tidak pernah menukar lebih banyak daripada yang benar-benar keluar.
- Server membaca ulang posisi dari chain; angka kiriman browser tidak dipercaya.
- Layar konfirmasi menonjolkan **minimum dijamin**, bukan estimasi — hanya angka itu yang punya
  jaminan slippage di belakangnya.

Token tujuan harus salah satu dari dua token pool itu sendiri, supaya swap-nya cukup satu leg.
Rute swap memakai Jupiter.

## Arti preset

| Aturan | Slow Wallet | Heart Attack |
| --- | ---: | ---: |
| Market cap | **$2M–$500M** | $100K–$15M |
| TVL minimum | **$50K** | — |
| Momentum 1h | −15–20% | 20–2000% |
| Volume 1h minimum | $5K | — |
| Volume 5m minimum | — | **$40K** |
| Vol/TVL minimum | 0.05x | — |
| Fee/TVL minimum | **0.03%** | — |
| Top-10 holder maksimum | **≤40%** | ≤35% |
| Saldo dev maksimum | **≤5%** | ≤10% |
| Organic score minimum | **≥70** | — |
| Sniper / Insider | — | ≤15% masing-masing |
| Bundler maksimum | — | ≤50% |
| Holder minimum | 1.000 | — |
| Mint authority | Wajib off | — |
| Token terverifikasi | **Wajib** | — |
| Umur pool minimum | **7 hari** | — |
| Skor minimum | 26 | 65 |
| Risiko maksimum | **45** | **95** |
| Ambang Hot / Watch | 38 / 30 | 85 / 70 |
| Freeze authority | Wajib off | Wajib off |
| Cooldown alert | 60 menit | **3 menit** |

Keduanya rekonstruksi dari materi yang pernah dibagikan terbuka, bukan klaim bahwa ini strategi
persis milik orang tersebut. Masing-masing dijelaskan tersendiri:
[Slow Wallet](#slow-wallet--gate-utama) dan [Heart Attack](#heart-attack--pemicu-volume-5-menit).

Angka yang **ditebalkan** adalah yang membedakan kedua preset paling tajam. Keduanya sengaja
berlawanan di hampir setiap baris: satu menuntut token terverifikasi berumur seminggu dengan
risiko ≤45 dan menunggu sejam sebelum ping berikutnya, satu lagi tidak menuntut verifikasi sama
sekali, menerima risiko sampai 95, dan ping tiap 3 menit.

### Panel rubrik kesehatan

Di luar gate preset, panel detail pool menampilkan **rubrik 12 metrik** (`shared/healthRubric.js`)
yang dicat hijau / kuning / merah, ditranskripsi dari setelan ambang bawaan DLMM Checker milik
@SwannyDeFi. Rubrik ini bukan gate — dia tampil untuk preset apa pun, karena warnanya menjawab
"token ini layak diriset atau tidak" terlepas dari strategi yang sedang dijalankan. Beberapa
barisnya butuh `GMGN_API_KEY`; tanpa kunci itu barisnya terbaca abu-abu, bukan hijau.

## Baca pasar

Semua yang ditampilkan screener ini sebelumnya adalah angka **stok**: TVL, volume 1 jam, fee/TVL
1 jam. Semuanya menggambarkan jam yang sudah selesai. Posisi DLMM berskala menit tidak dibuka atas
jam yang barusan lewat, tapi atas laju yang sedang berjalan. `shared/marketRead.js` menurunkan
angka laju itu dari data yang sudah ada di payload — tidak ada panggilan upstream baru.

### Dua burst, dan kenapa tidak boleh dicampur

Ini kesalahan yang paling mudah dibuat dan paling mahal, jadi dicatat di sini dan di kepala modulnya:

- **`volume_1m` / `volume_5m` dari GMGN adalah volume TOKEN di seluruh venue**, bukan volume pool
  ini. Pada satu scan nyata, sebuah token mencatat volume 5 menit $105K sementara pool DLMM-nya
  hanya $2,8K sepanjang jam — tokennya ramai di tempat lain.
- Karena itu angka GMGN hanya boleh dibandingkan dengan angka GMGN, dan angka Meteora hanya dengan
  angka Meteora.

| Kolom | Rumus | Cakupan |
| --- | --- | --- |
| **Burst token** | `volume_1m ÷ (volume_5m ÷ 5)` | Token, seluruh venue (GMGN) |
| **Burst pool** | pace 1 jam ÷ pace hariannya | Pool ini saja (Meteora) |

Jendela harian pada burst pool **dipotong ke umur asli pool**. Pool berumur 2 jam punya “volume 24
jam” yang isinya 2 jam; membaginya dengan 1.440 menit membuat satu pool nyata terbaca 5,13x padahal
sebenarnya 0,45x — dari melambat jadi seolah meledak.

### Angka laju lainnya

| Kolom | Arti |
| --- | --- |
| **Fee/mnt** | `fee/TVL 1 jam ÷ 60`. Satuan yang benar-benar dipakai hold berskala menit. |
| **Waktu ke 1%** | `60 ÷ fee/TVL`. Berapa menit modal di pool ini butuh untuk mencetak 1%. |
| **Impact/trade** | Trade rata-rata sebagai porsi TVL. Begini range ketat mati: bukan oleh tren, tapi oleh market order tunggal yang menyeret harga melewati bin. |
| **Putaran TVL** | Berapa kali TVL pool diputar penuh tiap menit. |
| **Porsi venue** | Perkiraan porsi aliran token yang lewat pool ini. Volume token per jam diekstrapolasi dari jendela 5 menit, jadi ini estimasi — tapi jaraknya jauh lebih lebar daripada galat estimasinya. Satu scan menemukan pool yang hanya membawa 0,2% aliran tokennya sendiri. |

### Fase

Satu kata untuk kondisi pool saat ini, dipakai di strip Kondisi pasar, kolom **Fase**, kartu, dan
panel **Baca pasar**: **Menyala**, **Jalan**, **Puncak**, **Meredup**, **Mati**, atau belum terbaca.

Dua saksi yang berdiri sendiri: burst (aliran) dan `feeVelocity` (peluruhan fee). Keduanya bisa
berbeda pendapat — aliran bisa naik lagi di pool yang fee-nya sudah kolaps — dan **pembacaan yang
lebih buruk yang menang**. Posisi ditutup pada tanda pertama mesinnya berhenti, bukan pada tanda
terakhir dia masih jalan.

Strip **Kondisi pasar** di atas tabel membaca seluruh scan sebagai satu pasar (Panas / Aktif /
Tipis / Sepi). Daftar yang diurutkan selalu punya baris teratas, jadi screener yang cuma menyortir
tidak pernah bisa bilang “tidak ada yang berlari” — dia hanya menaruh yang paling tidak mati di
atas. Angka fase di strip itu juga filter: klik untuk menyaring tabel.

### Catatan tentang Active TVL

`active_tvl` dari discovery API **bukan** likuiditas di bin aktif. Diukur pada scan nyata, nilainya
berada antara 0,62x dan 1,01x TVL pool — kadang sedikit di atasnya, yang tidak mungkin untuk sebuah
subset. `fee_active_tvl_ratio ÷ fee_tvl_ratio` persis sama dengan `tvl ÷ active_tvl`, jadi keduanya
hanya membawa satu fakta. Field-nya tetap ditampilkan apa adanya di grup terpisah panel detail,
tapi tidak ada pembacaan utama yang dibangun di atasnya, dan tidak ada label “in-range” di mana pun.

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

## Slow Wallet — gate utama

Dimodelkan dari wallet *kedua* @0xVanChu — yang dia bilang "takes noticeably less time and nerves"
dibanding wallet aksinya: "Bid-Ask on more proven tokens, without the constant race for new
shitcoins and without the need to stare at the chart."

Ini **bukan** transkripsi checklist yang pernah dipublikasikan — dia tidak pernah menulis satu pun
untuk wallet ini, cuma serpihan. Satu posisi konkret yang dia bagikan: $TOAD, Bid-Ask, range −42%,
deposit 20.000 USDC, return ~3% selama 11 jam, harga bertahan dalam pita 15% sepanjang posisi
terbuka. Angka di tabel adalah sintesis di atas serpihan itu, atas permintaan langsung pengguna.

### Retune 2026-08-19

Preset ini dijadikan gate utama aplikasi dan dioptimalkan untuk pair yang aman. Retune-nya diukur,
bukan ditebak.

**Diagnosisnya.** 9.563 baris scan-log selama ~2 jam menunjukkan preset ini lolos **16 kali
(0,17%)**, dan setiap gate yang mengikat adalah gate *aktivitas*, bukan keamanan:

| Gate gagal | % evaluasi |
| --- | ---: |
| Vol 1h ≥ $20.000 | 82,2% |
| Fee/TVL ≥ 0,2% | 78,9% |
| Vol/TVL ≥ 0,15x | 70,4% |
| TVL ≥ $100.000 | 55,8% |
| Holder ≥ 1.000 | 8,6% |

Sisi keamanannya justru hampir tidak pernah jadi penghalang: 27 dari 80 pool lolos *semua* gate
keamanan. Bentuk seperti itu adalah preset yang meminta pool dalam, terverifikasi, berumur seminggu
untuk berputar seperti memecoin baru — sesuatu yang tidak pernah dilakukannya.

**Perubahannya**, dan sengaja berjalan ke dua arah sekaligus:

- **Lantai aktivitas turun** ke angka yang benar-benar dibayar pool tenang: `volume1hMin` $20K → $5K,
  `volumeTvlMin` 0.15 → 0.05, `feeTvlMin` 0.2% → 0.03%, `tvlMin` $100K → $50K. Ambang 0,2%/jam
  di-back-compute dari trade $TOAD (~0,27%/jam) dan bukan laju yang bisa dipertahankan pair yang
  dalam dan terverifikasi — di dua scan live terpisah, pool aman terbaik hanya mencapai 0,183%/jam
  sementara mediannya ~0,02%. 0,03%/jam ≈ 0,7% per hari terhadap TVL.
- **Plafon market cap naik** $15M → $500M, mengikuti pipeline. Ini penyebab struktural kenapa preset
  yang ditulis untuk "proven token" tidak pernah bisa melihat satu pun.
- **Tiga gate keamanan baru**, dibayar oleh pelonggaran di atas — masing-masing di field yang
  terisi 40 dari 40 pool pada scan live, karena gate gagal-tertutup di atas sumber yang sering
  kosong akan membuat preset berkedip tanpa alasan yang ada hubungannya dengan pool:
  - `top10HoldersMax: 40` — satu-satunya gate yang menolak sesuatu yang lolos gate lama: token $240M,
    terverifikasi, mint dan freeze mati, 1.000+ holder, pool berumur seminggu — dengan **62,8% supply
    di sepuluh dompet**. Asal-usul dompetnya tidak relevan; pemegang 63% bisa menghabisi posisi.
  - `devBalanceMax: 5` — lebih ketat dari Heart Attack (10%), yang menggate token berumur menit di
    mana saldo dev masih wajar. Token proven berumur seminggu punya waktu seminggu untuk
    mendistribusikannya dan tidak melakukannya.
  - `organicScoreMin: 70` — organic score Jupiter, penjaga termurah terhadap pool yang volumenya
    adalah market maker-nya sendiri. Median pool aman = 86,6, jadi 70 adalah lantai keaslian.
- **Ladder turun** 35/55/40/28 → 26/38/30/24. Model 100 poin menghadiahkan momentum dan kesegaran,
  dan preset ini menggate keduanya, jadi pool yang disukainya mencetak jauh di bawah ladder bersama.
  Tiga pool yang lolos semua gate pada scan live mencetak 39, 30, dan 27 — lantai 35 akan
  membungkam dua dari tiganya.

**Hasilnya**, diverifikasi live di pipeline yang sudah dilebarkan: dari 93–96 pool, 2–3 lolos, semuanya
di **risk score 4**. Bandingkan dengan 0 sebelum retune.

RugCheck score sengaja **tidak** dijadikan gate meski terlihat cocok: dia kosong pada 2 dari 40 pool,
dan gate gagal-tertutup di atas upstream yang sering rate-limited akan membuat preset ini menyala-mati
karena alasan yang tidak ada hubungannya dengan kualitas pool. Nilainya tetap tampil di tabel dan
di rubrik kesehatan.

## Heart Attack — pemicu volume 5 menit

Nama komunitas, bukan istilah Meteora: range paling sempit yang masih bisa ditahan, dipasang pada
token yang **sudah** lari, ditahan hitungan menit, keluar sebelum dump. Dipopulerkan
[@\_mythicalpotato](https://x.com/_mythicalpotato) dan dijalankan terbuka oleh
[@0xVanChu](https://x.com/0xVanChu) serta [@0xMrBeefman](https://x.com/0xMrBeefman).

Yang benar-benar disebut sumbernya:

- **Range −5% s/d −15%, paling sering −10%.** @0xMrBeefman: *"one of the criteria for using a
  'tight range' of −5-15% is the token ripping upward with almost no corrections."* @0xVanChu pada
  posisi $TOAD yang menghasilkan +101 SOL: *"realized it was more effective to work in the −10%"*.
  Range adalah setelan posisi, bukan properti pool — **tidak ada gate di screener yang bisa
  menyatakannya**, jadi itu urusan eksekusi, bukan penyaringan.
- **Pemicunya lonjakan volume lima menit.** Algoritma @0xMrBeefman dibuka dengan *"say a runner
  launches and on the 5 minute I see 1M+ in trading volume."*
- **Stage 1 selalu pemeriksaan rugpull** sebelum likuiditas dikirim — *"quickly going through
  holders, distribution."* Itulah gate dev, sniper, insider, dan top-10 di tabel.
- **Penilaian LP Army Academy sendiri**: *"extremely high risk and more like gambling. Not
  recommended to attempt."*

### Yang diubah dari sumbernya, atas instruksi eksplisit pengguna

Ambang-ambang di tabel di atas itu keputusan pengguna, bukan sumbernya, dan masing-masing dicatat
begitu di komentar kode supaya tidak terbaca sebagai transkripsi:

- **Volume 5 menit** $40K, bukan 1M yang disebut @0xMrBeefman. $40K dalam lima menit setara
  $480K/jam bila bertahan — sudah benar-benar runner — sedangkan candle lima menit bervolume 1M
  cukup langka sampai presetnya praktis tidak akan pernah berbunyi.
- **Market cap** diturunkan bertahap dari $300K ke $150K, lalu ke **$100K**.
- **TVL minimum, volume 1 jam, Vol/TVL, dan Fee/TVL** dihapus total. TVL sempat berlantai $10K,
  volume 1 jam sempat diturunkan bertahap dari $200K ke $50K lalu $25K, Vol/TVL sempat 1x
  (turun dari 3x), Fee/TVL sempat 5% — pengguna memutuskan gate lonjakan 5 menit di atas sudah
  cukup menangani arus, dan menghapus keempatnya alih-alih melonggarkannya lagi.
- **Base fee minimum** juga dihapus total, sempat 2% — pelajaran fee tier tidak lagi digerbang
  di sini.
- **Saldo dev maksimum** dilonggarkan dari 0% ke **10%** — token dengan sisa saldo dev kecil tidak
  lagi otomatis gugur.
- **Bundler** dilonggarkan dari 15% ke **50%**. Ini pelemahan nyata pada
  pemeriksaan rugpull, bukan pembulatan — pada 50% sebuah pool bisa lolos gate ini walau separuh
  volumenya lewat bundled buy.
- **Umur pool maksimum** dihapus total, sempat 24 jam. Angka itu murni inferensi — tidak ada sumber
  yang menyebut batas umur — dan dihapus alih-alih dilebarkan lagi.

**Preset ini butuh `GMGN_API_KEY`.** Volume 5m, sniper, insider, dan bundler semuanya dari GMGN dan
semuanya gagal-tertutup: tanpa kunci, preset ini diam total. Kunci itu terpasang di VPS, jadi ini
hanya menggigit pada percobaan lokal.

Satu gate sengaja **tidak** ada di sini meski terlihat masuk akal: **lantai** top-10 holder. Lantai
seperti itu menyaring supply yang tersebar ke bot pada token yang baru migrasi, dan runner yang
sudah bergerak sudah melewati momen yang terbaca begitu — jadi hanya plafonnya yang berlaku.

## Catatan risiko

- Data Top-10 holders, dev balance, JupShield, dan Organic Score berasal dari Pool Discovery API Meteora. RugCheck disimpan dalam cache agar pemindaian tidak membebani layanan eksternal.
- RugCheck membatasi laju permintaan cukup ketat: burst 39 mint tanpa jeda kehilangan sekitar sepertiga respons ke HTTP 429, dan kegagalan itu tersimpan sebagai “data tidak ada”. Semua permintaan ke host itu kini mengantre di satu jalur dengan jeda minimum dan satu kali retry, sehingga cakupannya penuh. Pemindaian dingin karena itu memakan 33–41 detik sekali (20 detik sebelum halaman fee ditambahkan), lalu tersebar oleh jitter pada masa kedaluwarsa cache; pemindaian hangat 1,6 detik. Pemindaian dingin memang melewati interval 30 detik, tetapi hanya sekali per restart — `activeFetch` membuat tick yang jatuh di tengah pemindaian ikut menunggu, bukan memulai pemindaian kedua.
- Tidak ada score yang menjamin profit. Slippage, perubahan liquidity bin, smart-contract risk, dan pergerakan harga setelah alert tetap dapat menghasilkan kerugian.
- Backtest historis penuh belum termasuk MVP; endpoint `/api/history` merekam alert selama proses server masih hidup untuk paper review.
- Kecepatan fee dihitung dari snapshot 1 jam yang dikirim Meteora tiap scan, bukan dari fee posisi kamu sendiri. Dia menggambarkan pool, bukan PnL-mu.
