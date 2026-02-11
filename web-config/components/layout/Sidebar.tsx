"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Camera, Settings, Film, Menu, ChevronLeft, ChevronRight, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";

const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Cameras", href: "/cameras", icon: Camera },
    { name: "Recordings", href: "/recordings", icon: Film },
    { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Prevent hydration mismatch
    useEffect(() => {
        setMounted(true);
    }, []);

    // Update CSS variable when sidebar state changes
    useEffect(() => {
        const sidebarWidth = isCollapsed ? '64px' : '256px';
        document.documentElement.style.setProperty('--sidebar-width', sidebarWidth);
    }, [isCollapsed]);

    return (
        <>
            {/* Mobile Menu Button */}
            <button
                onClick={() => setIsMobileOpen(!isMobileOpen)}
                className="fixed top-4 left-4 z-50 lg:hidden rounded-lg bg-white dark:bg-slate-800 p-2 text-slate-900 dark:text-white shadow-lg border border-slate-200 dark:border-slate-700"
            >
                <Menu size={24} />
            </button>

            {/* Sidebar */}
            <aside
                className={cn(
                    "fixed left-0 top-0 z-40 h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xl transition-all duration-300 border-r border-slate-200 dark:border-slate-800",
                    isCollapsed ? "w-16" : "w-64",
                    isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                )}
            >
                {/* Logo Area */}
                <div className="flex h-16 items-center justify-center border-b border-slate-200 dark:border-slate-800">
                    {!isCollapsed && (
                        <h1 className="text-xl font-bold tracking-wider">
                            NVR<span className="text-blue-600 dark:text-blue-500">PRO</span>
                        </h1>
                    )}
                    {isCollapsed && (
                        <div className="text-xl font-bold text-blue-600 dark:text-blue-500">N</div>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 space-y-1 px-3 py-4">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-blue-600 text-white shadow-md"
                                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white",
                                    isCollapsed && "justify-center"
                                )}
                                title={isCollapsed ? item.name : undefined}
                            >
                                <item.icon size={20} />
                                {!isCollapsed && item.name}
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer / Status / Theme Toggle */}
                <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-4">
                    {/* Theme Toggle */}
                    {mounted && (
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className={cn(
                                "flex w-full items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors",
                                isCollapsed && "justify-center px-0"
                            )}
                            title={isCollapsed ? "Toggle theme" : undefined}
                        >
                            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                            {!isCollapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
                        </button>
                    )}

                    {!isCollapsed && (
                        <div className="flex items-center gap-3">
                            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-xs text-slate-500 dark:text-slate-400">System Online</span>
                        </div>
                    )}
                    {isCollapsed && (
                        <div className="flex justify-center">
                            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        </div>
                    )}
                </div>

                {/* Collapse Toggle Button */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute -right-3 top-20 hidden lg:flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors border-2 border-white dark:border-slate-900"
                    title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
            </aside>

            {/* Overlay for Mobile */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}
        </>
    );
}

