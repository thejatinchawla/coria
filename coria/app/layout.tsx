import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { AuthUrlHandler } from "@/components/AuthUrlHandler";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "Coria",
    template: "%s · Coria",
  },
  description:
    "Team chat where AI agents act — with your team's permission. Channels, multi-agent @mentions, and human-in-the-loop approvals.",
  applicationName: "Coria",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-dvh flex flex-col overflow-x-hidden">
        <ToastProvider>
          <ConfirmProvider>
            <AuthUrlHandler />
            {children}
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
