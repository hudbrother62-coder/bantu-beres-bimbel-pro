# Bantu Beres Bimbel Pro
Aplikasi operasional bimbel/privat berbasis panduan PANDUAN_BantuBeres-BIMBEL-PRO.pdf. Pemilik mengelola siswa, program, pengajar, kelas dan pendaftaran; pengajar mencatat sesi/presensi; admin menerima cicilan SPP dan mengirim kuitansi; pemilik memeriksa honor dan laporan laba.

## Ketentuan
- Next.js App Router, Neon PostgreSQL, Drizzle, siap impor Vercel; tidak deploy otomatis.
- Satu akun pemilik mendaftarkan satu lembaga; semua data dibatasi tenant. Pemilik membuat akun admin/pengajar. Login email/username, tanpa verifikasi email.
- Role diperiksa server; pengajar hanya kelas dan honornya sendiri. Admin tidak mendapat honor, pengeluaran atau laba.
- Master data dapat diarsip/restore; penghapusan permanen hanya arsip yang tidak digunakan. Transaksi pembayaran dibatalkan dengan audit, tidak dihapus diam-diam.
- SPP berupa snapshot bulanan per pendaftaran, diskon nominal, dispensasi tanpa kas masuk. Pembayaran dikunci transaksional untuk mencegah kelebihan/dobel, tanggal penerimaan terpisah bulan tagihan.
- Honor snapshot saat sesi selesai; presensi upsert tidak menduplikasi sesi; honor bukan pengeluaran kedua.
- Semua daftar memiliki pencarian, filter, template Excel, preview impor dan ekspor. Kalender berindikator agenda, presensi batch per kelas, laporan bulanan dan kartu SPP 12 bulan.
- WhatsApp klik kirim manual, tidak mengaku sudah terkirim. Tidak mengirim pesan saat QA.
- Logo master Bantu Beres digunakan apa adanya. Palet ungu terkendali; light/dark, mobile navigation, fokus keyboard/modal/validasi.

## Batas bukti
Isi lengkap room Analisis Konsep Web Bimbel belum dapat diambil. PDF merupakan sumber terverifikasi. Pembuatan project Neon baru membutuhkan koneksi yang mendukung create_project atau kredensial Neon. Tidak menggunakan database proyek lain.
