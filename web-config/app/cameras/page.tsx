'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import CameraGrid from '@/components/dashboard/CameraGrid';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function CamerasPage() {
    // Fetch sessions
    const { data: sessionsData, isLoading } = useQuery({
        queryKey: ['sessions'],
        queryFn: () => api.listSessions({ limit: 100 }),
        refetchInterval: 2000,
    });

    const sessions = sessionsData?.sessions || [];

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {/* Header */}
            <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link
                                href="/"
                                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                            >
                                <ArrowLeft size={20} />
                                <span>Back to Home</span>
                            </Link>
                            <div className="h-6 w-px bg-gray-700" />
                            <div>
                                <h1 className="text-2xl font-bold">Multi-Camera View</h1>
                                <p className="text-sm text-gray-400">Monitor all active sessions</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Camera Grid */}
            <div className="p-6">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="text-gray-500">Loading cameras...</div>
                    </div>
                ) : (
                    <CameraGrid sessions={sessions} defaultLayout="2x2" />
                )}
            </div>
        </div>
    );
}
