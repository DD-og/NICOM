import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NICOM Review Portal",
  description: "Paper review management for NICOM, Institute of Management, Nirma University",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
