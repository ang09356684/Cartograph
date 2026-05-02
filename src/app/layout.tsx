import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { buildSearchIndex } from "@/lib/searchIndex";
import {
  CommandPalette,
  CommandPaletteTrigger,
} from "@/components/CommandPalette";

export const metadata: Metadata = {
  title: "Cartograph",
  description: "Cross-repo service manifest visualization",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const searchIndex = await buildSearchIndex();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-[1600px] px-6 py-4 flex items-center gap-4">
            <Link
              href="/"
              className="text-lg font-semibold text-slate-900 no-underline hover:no-underline"
            >
              Cartograph
            </Link>
            <span className="text-slate-400 text-sm hidden md:inline">
              service-manifest visualization
            </span>
            <a
              href="/service-flow.html"
              className="text-sm text-sky-600 hover:text-sky-700 no-underline hover:underline"
            >
              Service Flow ↗
            </a>
            <div className="ml-auto">
              <CommandPaletteTrigger />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-6 py-8">{children}</main>
        <CommandPalette index={searchIndex} />
      </body>
    </html>
  );
}
