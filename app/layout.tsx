import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Bantu Beres Bimbel Pro",
  description:
    "Kelola bimbel dan les privat: siswa, jadwal, presensi, SPP, honor, dan laporan.",
  icons: { icon: "/logo.png" },
  manifest: "/manifest.webmanifest",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
