# Bantu Beres Bimbel Pro

Web app operasional bimbel dan les privat. Next.js App Router + React + Neon PostgreSQL. **Tidak ada deployment Vercel otomatis.**

## Fitur
- Daftar lembaga/pemilik; masuk melalui email atau username tanpa verifikasi email.
- Akses pemilik, admin operasional, pengajar; isolasi data antar lembaga dan pemeriksaan akses server.
- Program, pengajar, kelas kelompok/privat/online, siswa/wali, pendaftaran kelas, kapasitas dan diskon.
- Pencarian, filter, pilihan batch, edit, arsip, restore, penghapusan permanen dengan pemeriksaan relasi.
- Template, preview impor Excel `.xlsx` maksimal 500 baris/5 MB, impor atomik dan ekspor data induk.
- Kalender bulanan dengan indikator jadwal/agenda dan rekap agenda.
- Presensi batch, materi, riwayat, honor snapshot; pengajar maksimal 7 hari ke belakang.
- Tagihan SPP snapshot bulanan, cicilan, dispensasi, kartu SPP 12 bulan; proteksi duplikasi dan kelebihan pembayaran.
- Kuitansi cetak/PDF dan pesan WhatsApp manual, rekap honor/slip WA.
- Pengeluaran, laporan pemasukan/laba/kehadiran, ekspor Excel/cetak PDF, audit aktivitas.
- Pengaturan rekening, tanggal jatuh tempo, zona waktu dan template pengingat.
- Tema terang/gelap, navigasi HP, keyboard/modal, validasi dan status proses.

## Persiapan database Neon baru

Project Neon `bantu-beres-bimbel-pro` sudah tersedia: `empty-paper-68217939`, branch `br-plain-lake-b4junk2l`, PostgreSQL 18, AWS us-east-2. Pada 3 Oktober 2026 migrasi awal diterapkan secara atomik melalui connector Neon: 5 tabel aplikasi, 4 foreign key, dan 1 catatan migrasi Drizzle terverifikasi. Database tanpa akun/data contoh. Connection string pooled/direct sudah disiapkan di `.env.local` lokal, tidak dimasukkan ke GitHub.

1. Gunakan project Neon di atas; tidak perlu membuat project lain.
2. Ambil connection string pooled dan direct. Simpan di `.env.local` sesuai `.env.example`.
3. Jalankan `npm ci`, lalu `npm run db:migrate`. Migrasi Drizzle versioned ada di `db/migrations`.
4. Jalankan `npm run db:check`. Hasil sehat harus menunjukkan `connected: true` dan `migrated: true`.
5. Jalankan `npm run dev`, lalu buka `/api/health`. Endpoint ini benar-benar melakukan query ke PostgreSQL dan memeriksa tabel inti, bukan hanya mengecek env.
6. Daftar lembaga dan akun pemilik pertama lewat aplikasi. Tidak ada password default/data contoh produksi.

```env
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://.../neondb?sslmode=require
APP_URL=http://localhost:3000
```

## Import GitHub ke Vercel sendiri

1. New Project → Import repository `hudbrother62-coder/bantu-beres-bimbel-pro`.
2. Framework Next.js, Root Directory `.`. Gunakan Node.js 22 atau 24.
3. Tambahkan `DATABASE_URL` pooled; `APP_URL` harus persis URL produksi, tanpa slash akhir. Tidak perlu `NEXT_PUBLIC_DATABASE_URL`.
4. Migrasi dilakukan satu kali sebelum digunakan. Jangan menaruh migrasi otomatis pada build setiap preview.
5. Deploy sendiri. Jika domain berubah, perbarui `APP_URL`, lalu redeploy.
6. Daftar akun pemilik. Menu Akses tim untuk membuat akun admin dan pengajar.

Preview domains perlu nilai `APP_URL` yang cocok jika menguji form, karena API menolak asal permintaan lain.

## Aturan operasional

SPP dibuat per pendaftaran kelas; siswa di beberapa kelas punya tagihan masing-masing. Tarif dikunci saat tagihan dibuat. Perubahan tarif tidak menimpa tagihan lama. Pembayaran dicatat per tagihan; untuk beberapa bulan catat pada tiap tagihan terkait. Tagihan sudah lunas tidak menerima pembayaran tambahan.

Honor dihitung dari sesi selesai, dikunci saat presensi pertama kali dicatat. Menyimpan ulang kelas/tanggal sama tidak menggandakan honor. Honor pada laporan adalah kewajiban honor, bukan konfirmasi pembayaran honor. Jangan catat honor lagi sebagai pengeluaran operasional.

Cuti menghentikan tagihan baru. Tagihan yang telah dibuat tetap ada; dispensasi bila dibebaskan. Data referensi yang masih digunakan harus diarsipkan, tidak dihapus permanen. Pembayaran/sesi dapat dibatalkan pemilik dengan alasan; histori audit tetap disimpan.

WA hanya klik-kirim pribadi. Tidak ada pengiriman otomatis/Fonnte terjadwal. Pengguna menekan Kirim di WhatsApp; aplikasi tidak mengklaim pesan telah terkirim.

## Pengujian

`npm test` memeriksa kalkulasi dan alur database lewat PostgreSQL PGlite khusus pengujian: pendaftaran, login, CRUD, relasi, presensi upsert, honor historis, tagihan idempotent, cicilan/dispensasi, pembatalan, role dan isolasi tenant. `npm run typecheck` dan `npm run build` untuk pemeriksaan produksi.

Query langsung melalui connector Neon berhasil dan schema/migrasi terverifikasi. Koneksi TCP aplikasi dari lingkungan kerja ini belum dapat diuji karena DNS host Neon menghasilkan `EAI_AGAIN`; pengujian `/api/health` setelah deploy tetap wajib. Konten room Analisis Konsep Web Bimbel tidak dapat dipulihkan lengkap; implementasi mengacu PDF panduan aplikasi lama yang tersedia. Belum dinyatakan parity terhadap spesifikasi room yang tidak dapat dibaca.

## Struktur

`app/` UI dan API Next.js; `components/` ruang kerja/modal; `lib/domain.ts` aturan dan field; `lib/service.ts` transaksi/relasi/akses; `lib/auth.ts` scrypt/session; `db/` Drizzle schema/migrasi; `tests/` PostgreSQL integrasi dan unit.

Cookie sesi HttpOnly/SameSite, 6 jam. Password scrypt dengan salt acak. Salah password 5 kali mengunci akun 15 menit. Menonaktifkan akun mencabut sesi. Database URL tidak dikirim browser. Secret tidak disimpan di repository.


## Checklist release sebelum deploy Vercel

1. Pastikan GitHub Actions terakhir hijau. Workflow menjalankan `npm run verify`: unit/integration test, TypeScript, dan production build.
2. Gunakan project Neon `empty-paper-68217939` yang sudah dimigrasi.
3. Jalankan migrasi sekali menggunakan `DATABASE_URL_UNPOOLED`, lalu `npm run db:check` harus menghasilkan `connected: true` dan `migrated: true`.
4. Saat import repository ke Vercel gunakan Node.js 22, Framework Next.js, Root Directory `.`.
5. Isi Environment Variables production: `DATABASE_URL` (pooled) dan `APP_URL` (URL production final tanpa slash akhir). Jangan membuat `NEXT_PUBLIC_DATABASE_URL`.
6. Setelah deploy buka `/api/health`. Kondisi sehat: `configured: true`, `connected: true`, `migrated: true`.
7. Baru setelah health sehat, daftar akun owner pertama dan lakukan smoke test: login → program → pengajar → kelas → siswa → pendaftaran → presensi → tagihan → pembayaran → kuitansi → laporan.
