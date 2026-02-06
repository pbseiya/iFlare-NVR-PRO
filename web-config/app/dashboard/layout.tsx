import type { Metadata } from "next";
import "../globals.css";
import { Providers } from "../providers";

export const metadata: Metadata = {
    title: "NVR Dashboard - Professional Monitoring",
    description: "Professional NVR Dashboard with multi-camera view",
};

export default function DashboardLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body suppressHydrationWarning className="bg-gray-950 text-white">
                <Providers>
                    {/* No wrapper - dashboard page handles its own layout */}
                    {children}
                </Providers>
            </body>
        </html>
    );
}
