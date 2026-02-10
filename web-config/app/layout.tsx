import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
    title: "YOLOv11 Configuration",
    description: "Configure YOLOv11 inference sessions",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body suppressHydrationWarning className="bg-slate-50 text-slate-900">
                <Providers>
                    <div className="min-h-screen flex">
                        <Sidebar />
                        <main
                            className="flex-1 min-h-screen transition-all duration-300"
                            style={{ marginLeft: 'var(--sidebar-width, 256px)' }}
                        >
                            {children}
                        </main>
                    </div>
                </Providers>
            </body>
        </html>
    );
}
