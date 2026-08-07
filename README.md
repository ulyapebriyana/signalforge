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
- Preset **Yanman-like** dan **Auzhinta-like** dengan aturan yang transparan.
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
4. Pilih `SCANNER_PRESET=yanman` atau `SCANNER_PRESET=auzhinta`.
5. Restart aplikasi dan klik **Telegram → Kirim pesan tes**.

Token Telegram hanya dibaca oleh server. Browser tidak pernah menerima nilainya.

## Arti preset

| Aturan | Yanman-like | Auzhinta-like |
| --- | ---: | ---: |
| Market cap | $100K–$10M | $150K–$15M |
| TVL minimum | $500 | $35K |
| Momentum 1h | 20–200% | −35–400% |
| Volume 1h minimum | $5K | $10K |
| Vol/TVL minimum | 0.5x | 0.3x |
| Fee/TVL minimum | 0.5% | 1.0% |
| Bin step | — | 80–125 |
| Base fee minimum | — | 2% |
| Top-10 holder maksimum | — | 45% |
| Saldo dev maksimum | — | 5% |
| Umur pool maksimum | — | 72 jam |
| Ambang Hot / Watch | 80 / 65 | 60 / 48 |
| Freeze authority | Wajib off | Wajib off |
| Cooldown alert | 15 menit | 10 menit |

Keduanya rekonstruksi dari filter yang pernah dibagikan terbuka, bukan klaim bahwa ini strategi
persis milik orang tersebut.

**Yanman-like** agresif dan dapat memasukkan pool dengan likuiditas sangat tipis.

**Auzhinta-like** menyalin rig yang dipakai berulang di posisi-posisi yang dia posting: bin step
80–125, base fee 2–3%, pool yang baru lahir, dan TVL minimal $35K supaya IL saat dump masih
tertahan. Dua hal membuatnya berbeda dari preset lain:

- **Batas momentumnya negatif.** Range bid-ask satu sisi yang lebar justru memanen fee saat harga
  turun — posisi MOGDOG-SOL yang dia posting tutup di +10.89% sementara tokennya jatuh ~70%. Jadi
  yang wajib benar adalah pool-nya masih membayar (`Fee/TVL ≥ 1%`), bukan arah harganya.
- **Ambang Hot/Watch-nya sendiri.** Model 100 poin dibangun untuk pool yang tidak pernah dia
  sentuh: memecoin tanpa verifikasi kehilangan poin verifikasi dan jarang menahan volume/TVL 2x,
  jadi kandidat kuat pun mendarat di kisaran 50-an. Memakai tangga 65/80 akan mematikan semua
  alert-nya.

Gate yang lebih longgar soal risiko ini menanggung penurunan harga yang nyata. Batas top-10 holder
dan saldo dev adalah pengganti kasar untuk pengecekan Bubblemaps manual, dan keduanya gagal-tertutup
saat data holder tidak tersedia.

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

## Catatan risiko

- Data Top-10 holders, dev balance, JupShield, dan Organic Score berasal dari Pool Discovery API Meteora. RugCheck disimpan dalam cache agar pemindaian tidak membebani layanan eksternal.
- Tidak ada score yang menjamin profit. Slippage, perubahan liquidity bin, smart-contract risk, dan pergerakan harga setelah alert tetap dapat menghasilkan kerugian.
- Backtest historis penuh belum termasuk MVP; endpoint `/api/history` merekam alert selama proses server masih hidup untuk paper review.
- Kecepatan fee dihitung dari snapshot 1 jam yang dikirim Meteora tiap scan, bukan dari fee posisi kamu sendiri. Dia menggambarkan pool, bukan PnL-mu.
