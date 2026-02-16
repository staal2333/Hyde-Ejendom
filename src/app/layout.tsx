import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ejendom AI – Research Agent",
  description: "AI-drevet ejendomsresearch og outreach-agent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased min-h-screen bg-surface-50">
        {children}
      </body>
    </html>
  );
}
