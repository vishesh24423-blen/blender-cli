import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { Box, Github } from "lucide-react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "BlenderLab — 3D Models from Blender Python Scripts",
  description:
    "Paste a Blender Python script, pick output formats, and get model files (GLB, FBX, STL, USD) rendered by headless Blender on GitHub Actions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <div className="app-container">
          <header className="app-header">
            <div className="header-inner">
              <Link href="/" className="logo">
                <span className="logo-icon">
                  <Box size={16} />
                </span>
                <span className="logo-text">
                  BlenderLab
                </span>
              </Link>
              <nav className="header-links">
                <Link href="/" className="header-link">
                  New job
                </Link>
                <Link href="/guide" className="header-link">
                  Guide
                </Link>
                <a
                  href="https://github.com/vishesh24423-blen/blender-cli"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="header-link header-link--icon"
                >
                  <Github size={15} />
                  <span>GitHub</span>
                </a>
              </nav>
            </div>
          </header>

          <main className="main-content">{children}</main>

          <footer className="app-footer">
            <p className="footer-text">
              BlenderLab — headless Blender 5.2 on GitHub Actions · GLB / FBX / STL / USD
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
