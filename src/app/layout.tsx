import type { Metadata } from "next";
import "./globals.css";
import { TRPCProvider } from "@/trpc/provider";

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
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
