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
- Preset **Safer** dan **Yanman-like** dengan aturan yang transparan.
- Score 0–100: momentum 25, fee efficiency 25, volume quality 20, security 20, freshness 10.
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
4. Pilih `SCANNER_PRESET=safer` atau `SCANNER_PRESET=yanman`.
5. Restart aplikasi dan klik **Telegram → Kirim pesan tes**.

Token Telegram hanya dibaca oleh server. Browser tidak pernah menerima nilainya.

## Arti preset

| Aturan | Safer | Yanman-like |
| --- | ---: | ---: |
| Market cap | $100K–$5M | $100K–$10M |
| TVL minimum | $10K | $500 |
| Momentum 1h | 10–40% | 20–200% |
| Volume 1h minimum | $10K | $5K |
| Vol/TVL minimum | 1.0x | 0.5x |
| Fee/TVL minimum | 1.0% | 0.5% |
| Freeze authority | Wajib off | Wajib off |
| Cooldown alert | 30 menit | 15 menit |

Preset “Yanman-like” meniru filter publik yang dianalisis, bukan klaim bahwa ini strategi persis milik orang tersebut. Kondisinya lebih agresif dan dapat memasukkan pool dengan likuiditas sangat tipis.

## Catatan risiko

- Data Top-10 holders, dev balance, JupShield, dan Organic Score berasal dari Pool Discovery API Meteora. RugCheck disimpan dalam cache agar pemindaian tidak membebani layanan eksternal.
- Tidak ada score yang menjamin profit. Slippage, perubahan liquidity bin, smart-contract risk, dan pergerakan harga setelah alert tetap dapat menghasilkan kerugian.
- Backtest historis penuh belum termasuk MVP; endpoint `/api/history` merekam alert selama proses server masih hidup untuk paper review.
