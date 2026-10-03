# Hasil verifikasi

- Unit dan PostgreSQL PGlite: kalkulasi cicilan/dispensasi, pembatalan, laba menurut tanggal kas, tarif historis, presensi upsert, tagihan idempotent, relasi/kapasitas, isolasi tenant, role guru/admin, rollback impor, lockout login.
- API: health mengembalikan database belum disiapkan; permintaan lintas origin ditolak; pendaftaran tanpa database mengembalikan 503 yang jelas.
- TypeScript dan build Next.js produksi lulus.
- Browser Chromium: layar masuk/daftar, 18 halaman kerja memakai fixture dari pengujian PostgreSQL, modal/ Escape, tema terang/gelap, navigasi HP 390px, tidak ada overflow halaman atau JavaScript page errors.
- Tidak ada pesan WhatsApp dikirim dan tidak ada deployment Vercel.

## Batas verifikasi
Browser menguji UI dengan respons snapshot fixture, bukan koneksi Neon produksi. Alur data nyata diuji di PostgreSQL PGlite khusus test. Project Neon `empty-paper-68217939`, branch `br-plain-lake-b4junk2l`, sudah dimigrasi pada 3 Oktober 2026 melalui connector Neon dalam satu transaksi. Query pascamigrasi: 5 tabel aplikasi, 4 foreign key, 1 migrasi, 0 akun dan 0 tenant. Connection string pooled/direct tersimpan lokal dan tidak di GitHub. Koneksi TCP dari runtime lokal gagal DNS `EAI_AGAIN`, sehingga alur aplikasi ke Neon end-to-end belum dinyatakan lulus; cek `/api/health` setelah deploy.

## Checklist setelah Neon siap
1. Migrasi awal selesai; untuk perubahan schema berikutnya gunakan `npm run db:migrate`.
2. Daftar lembaga → masuk → buat akun tim.
3. Program/pengajar/kelas/siswa/pendaftaran → presensi → tagihan → cicilan → kuitansi.
4. Periksa role dan isolasi tenant pada akun nyata.
5. Import repository ke Vercel sendiri, set APP_URL persis domain dan DATABASE_URL pooled.
