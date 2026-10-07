import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import { AppProvider } from "@/components/providers/AppProvider";
import { CloudBanner } from "@/components/cloud/CloudBanner";
import { ToastProvider } from "@/components/ui/Toast";

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
          <ToastProvider>
            <Navbar />
            <main className="pt-16 min-h-screen">
              <CloudBanner />
              {children}
            </main>
          </ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}
