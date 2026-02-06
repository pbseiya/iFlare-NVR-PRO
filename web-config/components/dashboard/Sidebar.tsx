'use client';

import { Tv, LayoutGrid, Video, Settings, Home } from 'lucide-react';
import Link from 'next/link';

interface SidebarProps {
    selectedView: string;
    onViewChange: (view: 'overview' | 'cameras') => void;
}

export default function Sidebar({ selectedView, onViewChange }: SidebarProps) {
    const navItems = [
        { id: 'overview', label: 'Dashboard', icon: Home, href: '/dashboard' },
        { id: 'cameras', label: 'Cameras', icon: Tv, href: '/dashboard' },
        { id: 'recordings', label: 'Recordings', icon: Video, href: '/nvr' },
        { id: 'settings', label: 'Settings', icon: Settings, href: '/' },
    ];

    return (
        <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
            {/* Logo */}
            <div className="p-6 border-b border-gray-800">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600 p-2 rounded-lg">
                        <LayoutGrid className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-white">NVR Pro</h1>
                        <p className="text-xs text-gray-400">Dashboard</p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4">
                <ul className="space-y-2">
                    {navItems.map(item => {
                        const Icon = item.icon;
                        const isActive = selectedView === item.id;

                        if (item.href === '/dashboard') {
                            return (
                                <li key={item.id}>
                                    <button
                                        onClick={() => onViewChange(item.id as 'overview' | 'cameras')}
                                        className={`
                                            w-full flex items-center gap-3 px-4 py-3 rounded-lg
                                            transition-colors text-left
                                            ${isActive
                                                ? 'bg-blue-600 text-white'
                                                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                            }
                                        `}
                                    >
                                        <Icon className="w-5 h-5" />
                                        <span className="font-medium">{item.label}</span>
                                    </button>
                                </li>
                            );
                        }

                        return (
                            <li key={item.id}>
                                <Link
                                    href={item.href}
                                    className="
                                        w-full flex items-center gap-3 px-4 py-3 rounded-lg
                                        transition-colors text-gray-400 hover:bg-gray-800 hover:text-white
                                    "
                                >
                                    <Icon className="w-5 h-5" />
                                    <span className="font-medium">{item.label}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* System Status */}
            <div className="p-4 border-t border-gray-800">
                <div className="bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-sm font-medium text-white">System Online</span>
                    </div>
                    <p className="text-xs text-gray-400">All services operational</p>
                </div>
            </div>
        </div>
    );
}
