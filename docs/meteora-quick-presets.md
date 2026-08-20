# Meteora Quick Presets

Userscript ini menambahkan panel preset kecil di kanan bawah halaman Meteora DLMM. Panel dapat mengisi:

- jumlah SOL;
- batas Min% dan Max%;
- preset batas bawah −5% sampai −25% dan batas atas +10% sampai +30%;
- strategi Spot, Bid-Ask, atau Curve.

Script sengaja **tidak** menekan konfirmasi akhir dan tidak dapat menandatangani transaksi wallet. Setelah form terisi, periksa token, pool, fee tier, range, slippage, price impact, dan jumlah SOL pada antarmuka Meteora sebelum melanjutkan sendiri.

## Instalasi

1. Pasang ekstensi Tampermonkey dari toko ekstensi resmi browser.
2. Buka Tampermonkey lalu pilih **Create a new script**.
3. Hapus isi editor dan tempel seluruh isi `tools/meteora-quick-presets.user.js`.
4. Simpan dengan `Ctrl+S` atau `Cmd+S`.
5. Buka atau muat ulang halaman pool DLMM Meteora.

## Pemakaian

1. Isi jumlah SOL.
2. Pilih preset range atau isi Min% dan Max% sendiri.
3. Pilih strategi.
4. Tekan **Siapkan Ape In**.
5. Periksa formulir Meteora yang disorot.
6. Lanjutkan transaksi dan konfirmasi wallet secara manual hanya jika semuanya benar.

## Batasan

Meteora dapat mengubah struktur halaman sewaktu-waktu. Jika panel melaporkan bahwa kolom tidak ditemukan, buka panel **Create Position** atau **Ape In** terlebih dahulu, lalu coba lagi. Jangan menaikkan slippage hanya untuk mengatasi bundle Jito yang kedaluwarsa.

Jangan memasang userscript acak yang meminta seed phrase, private key, izin clipboard, atau akses ke semua situs. Script ini tidak memakai dependency eksternal, tidak melakukan request jaringan, dan hanya aktif pada domain Meteora yang tercantum di bagian `@match`.
