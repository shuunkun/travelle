import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import { AppProvider } from "@/components/providers/AppProvider";
import { CloudBanner } from "@/components/cloud/CloudBanner";

export const metadata: Metadata = {
  title: "Travellé | Trip Planner & Expense Splitter",
  description: "Plan your trips and split expenses easily with Travellé.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#fafafa]">
        <AppProvider>
          <Navbar />
          <main className="pt-16 min-h-screen">
            <CloudBanner />
            {children}
          </main>
        </AppProvider>
      </body>
    </html>
  );
}
