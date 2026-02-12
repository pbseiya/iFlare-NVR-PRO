'use client';

import { SessionInfo } from '@/lib/api';
import { useState } from 'react';
import CameraGridItem from './CameraGridItem';
import LayoutSwitcher from './LayoutSwitcher';
import { Grid, X, ArrowLeft } from 'lucide-react';
import { useDetectionFilter } from '@/hooks/useDetectionFilter';
import { DetectionToggles } from '@/components/shared/DetectionToggles';
import Link from 'next/link';

type GridLayout = '1x1' | '2x2' | '3x3' | '4x4';

interface CameraGridProps {
    sessions: SessionInfo[];
    defaultLayout?: GridLayout;
}

export default function CameraGrid({ sessions, defaultLayout = '2x2' }: CameraGridProps) {
    const [layout, setLayout] = useState<GridLayout>(defaultLayout);
    const [focusedSessionId, setFocusedSessionId] = useState<number | null>(null);

    // Detection overlay toggles managed by custom hook
    const detectionFilter = useDetectionFilter();

    // Calculate max cameras based on layout
    const maxCameras = {
        '1x1': 1,
        '2x2': 4,
        '3x3': 9,
        '4x4': 16,
    }[layout];

    // Get active sessions (running only)
    const activeSessions = sessions.filter(s => s.status === 'running').slice(0, maxCameras);

    // Grid CSS classes based on layout
    const gridClasses = {
        '1x1': 'grid-cols-1 grid-rows-1',
        '2x2': 'grid-cols-2 grid-rows-2',
        '3x3': 'grid-cols-3 grid-rows-3',
        '4x4': 'grid-cols-4 grid-rows-4',
    }[layout];

    const handleFocus = (sessionId: number) => {
        setFocusedSessionId(focusedSessionId === sessionId ? null : sessionId);
    };

    const clearFocus = () => {
        setFocusedSessionId(null);
    };

    return (
        <div className="h-full flex flex-col overflow-hidden bg-black/20 rounded-lg">
            {/* Header with Controls - Ultra Compact */}
            <div className="flex items-center justify-between flex-shrink-0 px-3 py-2 border-b border-gray-800/50 bg-gray-900/40">
                <div className="flex items-center gap-3">
                    <Link
                        href="/"
                        className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                        title="Back to Dashboard"
                    >
                        <ArrowLeft size={18} />
                    </Link>
                    <div className="flex items-center gap-2">
                        <Grid className="w-4 h-4 text-blue-400" />
                        <h2 className="text-base font-bold text-white tracking-tight">MONITORING</h2>
                        <span className="text-[10px] text-gray-500 bg-gray-800/50 px-1.5 py-0.5 rounded border border-gray-700">
                            {activeSessions.length} CAM
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <DetectionToggles
                        filterState={detectionFilter}
                        actions={detectionFilter}
                        className="scale-75 origin-right"
                    />
                    <div className="h-4 w-px bg-gray-800 mx-1" />
                    <LayoutSwitcher currentLayout={layout} onLayoutChange={setLayout} />
                </div>
            </div>

            {/* Camera Grid - Strictly contained */}
            <div className="flex-1 min-h-0 relative p-2 overflow-hidden bg-black/40">
                {activeSessions.length > 0 ? (
                    <div
                        className={`grid ${gridClasses} gap-2 h-full w-full`}
                        style={{ maxHeight: '100%' }}
                    >
                        {activeSessions.map((session) => (
                            <CameraGridItem
                                key={session.id}
                                session={session}
                                onFocus={() => handleFocus(session.id)}
                                isFocused={focusedSessionId === session.id}
                                detectionOptions={detectionFilter}
                                layout={layout}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center bg-gray-900/50 rounded-xl border border-dashed border-gray-800 text-center">
                        <Grid className="w-12 h-12 text-gray-700 mb-4" />
                        <h3 className="text-lg font-semibold text-gray-400 mb-2">No Active Cameras</h3>
                        <p className="text-gray-600 max-w-sm text-sm">
                            Real-time monitoring requires active inference sessions.
                        </p>
                    </div>
                )}
            </div>

            {/* Status Footer - Invisible unless hovered or active */}
            {activeSessions.length > 0 && (
                <div className="bg-gray-950/80 backdrop-blur-md border-t border-gray-800 flex-shrink-0">
                    <div className="flex items-center justify-between text-[8px] uppercase tracking-widest font-bold text-gray-500 px-3 py-1">
                        <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1">
                                <span className="w-1 h-1 bg-blue-500 rounded-full animate-ping" />
                                LIVE VIEW
                            </span>
                            <span className="opacity-50">DBL-CLICK FULLSCREEN</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-blue-500/80 tracking-tighter">MODE: {layout}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

