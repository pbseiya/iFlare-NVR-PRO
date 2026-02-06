'use client';

import { SessionInfo } from '@/lib/api';
import { useState } from 'react';
import CameraGridItem from './CameraGridItem';
import LayoutSwitcher from './LayoutSwitcher';
import { Grid, X } from 'lucide-react';

type GridLayout = '1x1' | '2x2' | '3x3' | '4x4';

interface CameraGridProps {
    sessions: SessionInfo[];
    defaultLayout?: GridLayout;
}

export default function CameraGrid({ sessions, defaultLayout = '2x2' }: CameraGridProps) {
    const [layout, setLayout] = useState<GridLayout>(defaultLayout);
    const [focusedSessionId, setFocusedSessionId] = useState<number | null>(null);

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
        '1x1': 'grid-cols-1',
        '2x2': 'grid-cols-2',
        '3x3': 'grid-cols-3',
        '4x4': 'grid-cols-4',
    }[layout];

    const handleFocus = (sessionId: number) => {
        setFocusedSessionId(focusedSessionId === sessionId ? null : sessionId);
    };

    const clearFocus = () => {
        setFocusedSessionId(null);
    };

    return (
        <div className="space-y-4">
            {/* Header with Controls */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Grid className="w-5 h-5 text-gray-400" />
                        <h2 className="text-xl font-semibold text-white">Camera Grid</h2>
                    </div>
                    <span className="text-sm text-gray-500">
                        {activeSessions.length} / {maxCameras} cameras
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    {focusedSessionId && (
                        <button
                            onClick={clearFocus}
                            className="flex items-center gap-2 px-3 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors text-sm"
                        >
                            <X size={16} />
                            Clear Focus
                        </button>
                    )}
                    <LayoutSwitcher currentLayout={layout} onLayoutChange={setLayout} />
                </div>
            </div>

            {/* Camera Grid */}
            {activeSessions.length > 0 ? (
                <div className={`grid ${gridClasses} gap-4`}>
                    {activeSessions.map((session) => (
                        <CameraGridItem
                            key={session.id}
                            session={session}
                            onFocus={() => handleFocus(session.id)}
                            isFocused={focusedSessionId === session.id}
                        />
                    ))}
                </div>
            ) : (
                <div className="bg-gray-900 rounded-xl p-12 border border-gray-800 text-center">
                    <Grid className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-400 mb-2">No Active Cameras</h3>
                    <p className="text-gray-600">
                        Start a session to see live camera feeds here
                    </p>
                </div>
            )}

            {/* Info Footer */}
            {activeSessions.length > 0 && (
                <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Click any camera to focus • Double-click to fullscreen</span>
                        <span>Layout: {layout} Grid</span>
                    </div>
                </div>
            )}
        </div>
    );
}
