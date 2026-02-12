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
        <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">

            {/* Main Content Area - Full height, No outer padding */}
            <div className="flex-1 overflow-hidden min-h-0">
                {isLoading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-gray-500">Loading cameras...</div>
                    </div>
                ) : (
                    <div className="w-full h-full">
                        <CameraGrid sessions={sessions} defaultLayout="2x2" />
                    </div>
                )}
            </div>
        </div>
    );
}
