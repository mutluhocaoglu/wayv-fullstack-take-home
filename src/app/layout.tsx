import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wayv Take Home",
  description: "Project foundation for the Wayv take-home assignment",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
