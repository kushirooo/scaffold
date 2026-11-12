import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAF CONSULT | Password Recovery",
  description: "RAF CONSULT account password recovery.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
