# SignalForge

SignalForge adalah screener Meteora DLMM untuk mencari pool Solana dengan momentum, efisiensi fee, dan risiko yang dapat dibandingkan dalam satu layar. Aplikasi ini **bukan bot auto-trading**: tidak ada satu pun transaksi yang berjalan sendiri, dan tidak pernah meminta seed phrase atau private key.

Sejak fitur **zap out** ada, aplikasi ini bisa menyusun transaksi untuk menutup posisi LP Anda — tapi
tidak pernah menandatanganinya. Server menyusun dan meneruskan, wallet Anda yang menandatangani,
dan setiap transaksi butuh klik Anda sendiri. Tidak ada private key di server, dan itu bukan
kebetulan: lihat [Menutup posisi](#menutup-posisi-zap-out).

## Dua antarmuka, satu server

Keduanya memakai API dan logika skor yang sama.

| Rute | Antarmuka |
| --- | --- |
| `/` | Landing page dengan hero 3D (three.js) dan ringkasan data langsung |
| `/app` | Dashboard **Forge**: ringkasan, scanner, posisi LP, riwayat sinyal, aturan, pengaturan |
| `/classic` | Antarmuka versi pertama, tidak diubah sama sekali |

Pemilihan bundel terjadi di `src/main.jsx` sebelum salah satu stylesheet dimuat, jadi CSS kedua antarmuka tidak pernah berada dalam satu dokumen. `src/App.jsx` dan `src/styles.css` milik antarmuka klasik tidak disentuh.

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

- Scan dua halaman 250 pool dari API resmi Meteora setiap 30 detik: satu diurutkan
  `volume_1h:desc`, satu lagi `fee_tvl_ratio_1h:desc`. Halaman kedua yang membuat pool baru migrasi
  ikut terlihat — urutan volume kepalanya selalu pool tua dan besar.
- Ambil candle 1 jam untuk maksimal 72 kandidat secara paralel (48 dari halaman volume, 24 dari
  halaman fee yang belum terbawa).
- Preset **Yanman-like**, **Auzhinta-like**, **Swanny-like**, **VanChu-like**,
  **Skolmbeagh-like**, **Slow Wallet**, dan **Heart Attack** dengan aturan yang transparan.
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
`ALERT_MIN_SCORE=65` yang mematikan Auzhinta-like sepenuhnya. Server memperingatkan di log kalau
ketiganya masih ada di `.env`.

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

| Aturan | Heart Attack | Slow Wallet | VanChu-like | Skolmbeagh-like | Yanman-like | Auzhinta-like | Swanny-like |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Market cap | **$150K**–$15M | $2M–$15M | $300K–$15M | $50K–$200K | $100K–$10M | $400K–$15M | $100K–$15M |
| TVL minimum | — | $100K | $15K | $1K | $500 | $35K | $500 |
| Momentum 1h | 20–2000% | −15–20% | 15–900% | 0–2000% | 20–200% | 0–400% | bebas |
| Volume 1h minimum | — | $20K | $250K | $20K | $5K | $10K | $1K |
| **Volume 5m minimum** | **$50K** | — | — | — | — | — | — |
| Vol/TVL minimum | — | 0.15x | 3x | 1x | 0.5x | 0.3x | — |
| Fee/TVL minimum | — | 0.2% | 2% | 2% | 0.5% | 1.0% | — |
| Bin step | — | — | — | — | — | 50–400 | — |
| Base fee minimum | — | — | 2% | — | — | 2% | — |
| Mode fee | — | — | — | — | — | Base + quote | — |
| Cluster terbesar maksimum | — | — | — | — | — | 40% | — |
| Top-10 holder | ≤35% | — | — | 10–35% | — | ≤40% | rubrik |
| Saldo dev maksimum | ≤10% | — | — | 0% | — | 1% | rubrik |
| Sniper / Insider | ≤15% masing-masing | — | — | ≤15% masing-masing | — | — | rubrik |
| Bundler maksimum | **≤50%** | — | — | ≤15% | — | — | rubrik |
| Holder minimum | — | 1.000 | — | — | — | 500 | — |
| Mint authority | — | Wajib off | — | — | — | Wajib off | Wajib off |
| Token terverifikasi | — | **Wajib** | — | — | — | — | — |
| Umur pool maksimum | — | — | — | **30 menit** | — | 72 jam | — |
| Umur pool minimum | — | **7 hari** | — | — | — | — | — |
| Umur **token** minimum | — | — | — | — | — | — | rubrik (≥24 jam) |
| Rubrik screening | — | — | — | — | — | — | 12 metrik, tolak merah |
| Skor minimum | 65 | 35 | 65 | 55 | 65 | 48 | 50 |
| Risiko maksimum | **95** | **45** | 88 | 92 | 72 | 78 | 100 |
| Ambang Hot / Watch | 85 / 70 | 55 / 40 | 82 / 68 | 70 / 55 | 80 / 65 | 60 / 48 | 80 / 65 |
| Freeze authority | Wajib off | Wajib off | Wajib off | Wajib off | Wajib off | Wajib off | Wajib off |
| Cooldown alert | **3 menit** | 60 menit | 5 menit | 5 menit | 15 menit | 10 menit | 20 menit |

Lima dari tujuhnya rekonstruksi dari materi yang pernah dibagikan terbuka, bukan klaim bahwa ini
strategi persis milik orang tersebut. Dua sisanya punya sumber berbeda dan dijelaskan tersendiri:
[Slow Wallet](#slow-wallet--yang-tidak-dikonstruksi-dari-postingan) dan
[Heart Attack](#heart-attack--pemicu-volume-5-menit).

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

## VanChu-like dan Skolmbeagh-like — dua preset paling agresif

Keduanya direkonstruksi dari postingan publik di X pada Agustus 2026, dan keduanya sengaja punya
batas risiko paling longgar di seluruh aplikasi. Itu bukan kelalaian: pool yang mereka cari
mengumpulkan poin risiko justru karena sifat yang sedang diburu — token baru, belum terverifikasi,
momentum ekstrem. Batas risiko seketat preset lain akan mematikan keduanya.

### VanChu-like

Modelnya satu hal saja: token yang **sudah** lari, di pool dengan fee setinggi mungkin, ditahan
menit sampai jam — bukan hari. Postingannya menyebut range (−10%/−15% short spot, −42% medium,
−59%/−65% slow bid-ask) tapi tidak pernah menyebut bin step, jadi preset ini **tidak** mendeklarasi
gate bin step sama sekali. Mengarang satu angka di situ akan memalsukan sumbernya.

Yang disebut terang-terangan adalah kesalahan yang membuatnya rugi 4 SOL: token dengan volume
~$30K per menit, dimasuki lewat pool fee 1% yang sudah ada alih-alih membuat pool 3%, lalu terdorong
keluar range oleh satu red candle. Kesimpulannya sendiri: pool 3% pada volume itu “would have
compensated for around 90% of the losses”. Kebalikannya ada di postingan lain: +8 SOL dalam tiga
menit di pool fee 10%. Karena itu **fee tier adalah gate yang menentukan, bukan pilihan tokennya**.

`baseFeeMin` diisi 2, bukan 3 seperti pelajaran itu, karena 2% adalah tier terendah yang pernah dia
tulis dimasuki dengan sengaja (posisi $LUNA berpindah 5% → 2% saat mereda). Gate tidak boleh menolak
rig yang sumbernya tercatat memakainya.

### Skolmbeagh-like

Ini menyalin **filter pemilihan token** untuk migrasi baru — checklist yang dijalankan dalam 20–30
detik sebelum likuiditas dikirim: umur < 30 menit, MC $50K–$200K, top-10 holder 10–35%, dev 0%,
sniper/insider/bundler masing-masing < 15%.

Thread aslinya adalah strategi DAMM v2, sedangkan scanner ini hanya membaca pool DLMM
(`dlmm.datapi.meteora.ag`). Yang diambil karena itu hanya separuh pemilihan token, yang memang
ditulis sebagai checklist bernomor dan berbicara tentang token mana yang layak, bukan venue mana
yang dipakai. Separuh konstruksi posisinya — fee tier 6%, fee scheduler eksponensial, keluar di
menit ke-45 — adalah setelan pool DAMM v2 yang tidak bisa dilihat screener DLMM, dan sengaja tidak
dipalsukan ke dalam angka-angka ini. Thread-nya juga tertanggal Juni 2025 dan penulisnya sejak itu
lebih banyak di DLMM: perlakukan angkanya sebagai transkripsi, bukan sebagai rekomendasi terkini.

**Preset ini akan tetap jarang berbunyi, dan bukan karena angkanya salah** — jendela 30 menit pada
pita market cap yang sempit memang membuat sebagian besar pemindaian tidak memuat satu pun pool yang
memenuhi syarat. Yang berubah pada 2026-08-13 adalah pool seperti itu kini bisa sampai ke penilaian:

| Penghalang | Status |
| --- | --- |
| Umur | **Sudah dibuka.** Dulu `loadPools` hanya mengambil pool teratas menurut volume 1 jam, dan yang termuda pun berumur 1,18 jam. Sekarang ada halaman kedua `sort_by=fee_tvl_ratio_1h:desc`, tempat pool baru migrasi berada. Pada pemindaian verifikasi, pool berumur 19 menit lolos gate umur dan ditolak karena market cap serta momentum — kriteria strategi itu sendiri, bukan batas pipeline. |
| Market cap | Masih tipis: hanya 1 dari 48 kandidat halaman volume yang di bawah $200K. Lantai $50K di hulu bukan penghalang bagi preset ini, karena `marketCapMin`-nya juga $50K. |
| GMGN | Ketiga gate sniper/insider/bundler gagal-tertutup, dan API-nya hanya terisi 0–6 dari ~35 token lintas percobaan lokal. `GMGN_API_KEY` terpasang di VPS. |

Preset ini di-commit sebagai transkripsi yang setia, bukan dilonggarkan supaya kelihatan berbunyi —
melonggarkannya berarti menggambarkan strategi yang tidak pernah dipostingkan siapa pun.

## Slow Wallet — yang tidak dikonstruksi dari postingan

Lima preset di atas semuanya transkripsi dari checklist atau artikel yang pernah dipublikasikan
terbuka. Slow Wallet beda posisinya, dan itu disebutkan terang-terangan supaya tidak disamakan
dengan lima yang lain: @0xVanChu tidak pernah mempublikasikan checklist untuk wallet keduanya ini —
cuma serpihan. Yang dia sebutkan:

- "Slow Wallet takes noticeably less time and nerves" dibanding wallet aksinya (yang jadi dasar
  preset VanChu-like) — "Bid-Ask on more proven tokens, without the constant race for new shitcoins
  and without the need to stare at the chart."
- Satu posisi konkret yang dia bagikan: $TOAD, strategi Bid-Ask, range −42%, deposit 20.000 USDC,
  return ~3% selama 11 jam, dan harga bertahan dalam pita 15% sepanjang posisi terbuka.

Angka-angka di tabel adalah sintesis saya sendiri di atas serpihan itu, disusun atas permintaan
langsung pengguna ("menurutmu kayak gimana metode screeningnya") — bukan hasil terka-terka acak,
tapi juga bukan klaim bahwa ini transkripsi persis dari sesuatu yang pernah dia tulis.

Tiga hal yang membedakannya dari preset lain:

- **Dua gate baru di mesin scoring**: `ageHoursMin` (kebalikan dari `ageHoursMax` yang dipakai
  Skolmbeagh-like — pool harus *sudah lewat* 7 hari pertamanya, bukan justru masih di dalamnya) dan
  `requireVerified` (satu-satunya preset yang mewajibkan token terverifikasi). Keduanya gagal-tertutup
  seperti gate opsional lain: umur tidak diketahui atau status verifikasi tidak diketahui dianggap
  gagal, bukan diloloskan.
- **Batas risiko paling ketat di seluruh aplikasi (45)**, kebalikan penuh dari VanChu-like (88) dan
  Skolmbeagh-like (92). Itu memang intinya: Slow Wallet ada karena wallet aksinya "costs adrenaline
  and stress", jadi pool yang lolos gate ini seharusnya sudah genuinely aman, bukan risiko yang
  ditoleransi demi cuan cepat.
- **Skor minimumnya rendah (35) untuk alasan yang sama seperti Auzhinta-like**: model 100 poin
  menghadiahkan momentum tinggi dan pool yang masih segar, dan preset ini sengaja membatasi momentum
  di 20% serta menuntut pool berumur ≥7 hari (yang paling banter dapat 5 dari 10 poin freshness).
  Pool yang genuinely lolos gate ini biasanya mendarat di kisaran 35–55, bukan 65+.

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
  holders, distribution."* Itulah gate dev, sniper, insider, dan top-10 di tabel, dipinjam utuh dari
  Skolmbeagh-like yang menuliskan checklist yang sama dalam angka. Bundler dipinjam dari sana juga,
  tapi ambangnya sejak itu dilonggarkan (lihat bawah).
- **Penilaian LP Army Academy sendiri**: *"extremely high risk and more like gambling. Not
  recommended to attempt."*

### Yang diubah dari sumbernya, atas instruksi eksplisit pengguna

Ambang-ambang di tabel di atas itu keputusan pengguna, bukan sumbernya, dan masing-masing dicatat
begitu di komentar kode supaya tidak terbaca sebagai transkripsi:

- **Volume 5 menit** $50K, bukan 1M yang disebut @0xMrBeefman. $50K dalam lima menit setara
  $600K/jam bila bertahan — sudah benar-benar runner — sedangkan candle lima menit bervolume 1M
  cukup langka sampai presetnya praktis tidak akan pernah berbunyi.
- **Market cap** diturunkan dari $300K ke **$150K**, sekarang di dalam pita $50K–$200K
  Skolmbeagh-like, bukan di atasnya.
- **TVL minimum, volume 1 jam, Vol/TVL, dan Fee/TVL** dihapus total. TVL sempat berlantai $10K,
  volume 1 jam sempat diturunkan bertahap dari $200K ke $50K lalu $25K, Vol/TVL sempat 1x
  (turun dari 3x), Fee/TVL sempat 5% — pengguna memutuskan gate lonjakan 5 menit di atas sudah
  cukup menangani arus, dan menghapus keempatnya alih-alih melonggarkannya lagi.
- **Base fee minimum** juga dihapus total, sempat 2% — pelajaran fee tier VanChu-like tidak lagi
  digerbang di sini.
- **Saldo dev maksimum** dilonggarkan dari 0% ke **10%** — token dengan sisa saldo dev kecil tidak
  lagi otomatis gugur.
- **Bundler** dilonggarkan dari 15% (angka Skolmbeagh-like) ke **50%**. Ini pelemahan nyata pada
  pemeriksaan rugpull, bukan pembulatan — pada 50% sebuah pool bisa lolos gate ini walau separuh
  volumenya lewat bundled buy.
- **Umur pool maksimum** dihapus total, sempat 24 jam. Angka itu murni inferensi — tidak ada sumber
  yang menyebut batas umur — dan dihapus alih-alih dilebarkan lagi.

**Preset ini butuh `GMGN_API_KEY`.** Volume 5m, sniper, insider, dan bundler semuanya dari GMGN dan
semuanya gagal-tertutup: tanpa kunci, preset ini diam total — persis posture Skolmbeagh-like. Kunci
itu terpasang di VPS, jadi ini hanya menggigit pada percobaan lokal.

### Yang dipinjam, dan yang tidak

| Dari | Dipinjam | Tidak dipinjam |
| --- | --- | --- |
| VanChu-like | Batas momentum yang lebih longgar | `baseFeeMin` 2% — pelajaran fee tier yang paling mahal di postingan itu, sejak dihapus (lihat atas) |
| Skolmbeagh-like | Sniper/insider ≤15%, top-10 ≤35%, bundler (dilonggarkan ke ≤50%, lihat atas) | Saldo dev 0% (dilonggarkan ke ≤10%, lihat atas); **lantai** top-10 10%: itu menyaring supply yang tersebar ke bot pada token baru migrasi, dan runner yang sudah bergerak melewati momen itu |

## Catatan risiko

- Data Top-10 holders, dev balance, JupShield, dan Organic Score berasal dari Pool Discovery API Meteora. RugCheck disimpan dalam cache agar pemindaian tidak membebani layanan eksternal.
- RugCheck membatasi laju permintaan cukup ketat: burst 39 mint tanpa jeda kehilangan sekitar sepertiga respons ke HTTP 429, dan kegagalan itu tersimpan sebagai “data tidak ada”. Semua permintaan ke host itu kini mengantre di satu jalur dengan jeda minimum dan satu kali retry, sehingga cakupannya penuh. Pemindaian dingin karena itu memakan 33–41 detik sekali (20 detik sebelum halaman fee ditambahkan), lalu tersebar oleh jitter pada masa kedaluwarsa cache; pemindaian hangat 1,6 detik. Pemindaian dingin memang melewati interval 30 detik, tetapi hanya sekali per restart — `activeFetch` membuat tick yang jatuh di tengah pemindaian ikut menunggu, bukan memulai pemindaian kedua.
- Tidak ada score yang menjamin profit. Slippage, perubahan liquidity bin, smart-contract risk, dan pergerakan harga setelah alert tetap dapat menghasilkan kerugian.
- Backtest historis penuh belum termasuk MVP; endpoint `/api/history` merekam alert selama proses server masih hidup untuk paper review.
- Kecepatan fee dihitung dari snapshot 1 jam yang dikirim Meteora tiap scan, bukan dari fee posisi kamu sendiri. Dia menggambarkan pool, bukan PnL-mu.
