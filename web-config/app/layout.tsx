import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
    title: "YOLOv11 Configuration",
    description: "Configure YOLOv11 inference sessions",
};

import { ThemeProvider } from "@/components/ThemeProvider";

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body suppressHydrationWarning className="bg-background text-foreground antialiased">
                <ThemeProvider
                    attribute="class"
                    defaultTheme="dark"
                    enableSystem={false}
                    disableTransitionOnChange
                >
                    <Providers>
                        <div className="min-h-screen flex bg-background text-foreground">
                            <Sidebar />
                            <main
                                className="flex-1 min-h-screen transition-all duration-300 bg-background text-foreground"
                                style={{ marginLeft: 'var(--sidebar-width, 256px)' }}
                            >
                                {children}
                            </main>
                        </div>
                    </Providers>
                </ThemeProvider>
            </body>
        </html>
    );
}
