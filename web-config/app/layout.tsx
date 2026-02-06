import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ConditionalSidebar } from "@/components/layout/ConditionalSidebar";

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
                        <ConditionalSidebar />
                        <main className="flex-1 lg:ml-64 min-h-screen transition-all duration-300 [.dashboard-route_&]:ml-0">
                            <div className="p-4 md:p-8 max-w-7xl mx-auto [.dashboard-route_&]:p-0 [.dashboard-route_&]:max-w-none">
                                {children}
                            </div>
                        </main>
                    </div>
                </Providers>
            </body>
        </html>
    );
}
