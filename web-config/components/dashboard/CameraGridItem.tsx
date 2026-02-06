'use client';

import { SessionInfo } from '@/lib/api';
import { Activity, Video, Maximize2 } from 'lucide-react';
import { useState } from 'react';

interface CameraGridItemProps {
    session: SessionInfo;
    onFocus?: () => void;
    isFocused?: boolean;
}

export default function CameraGridItem({ session, onFocus, isFocused = false }: CameraGridItemProps) {
    const [isHovered, setIsHovered] = useState(false);
    const isRunning = session.status === 'running';

    return (
        <div
            className={`
                relative bg-gray-900 rounded-lg overflow-hidden border-2 transition-all cursor-pointer
                ${isFocused
                    ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                    : isHovered
                        ? 'border-blue-400'
                        : 'border-gray-800'
                }
            `}
            onClick={onFocus}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Video Placeholder - Will be replaced with actual video player */}
            <div className="aspect-video bg-gray-950 flex items-center justify-center">
                <div className="text-center">
                    <Video className="w-12 h-12 text-gray-700 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                        {isRunning ? 'Live Stream' : 'No Stream'}
                    </p>
                    <p className="text-xs text-gray-700 mt-1">Session #{session.id}</p>
                </div>
            </div>

            {/* Overlay - Session Info */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-white truncate">
                            {session.name || session.model_name.split('/').pop()}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`
                                inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                                ${isRunning
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-gray-700 text-gray-400'
                                }
                            `}>
                                {isRunning && <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />}
                                {session.status}
                            </span>
                            <span className="text-xs text-gray-400">
                                {session.fps_target} FPS
                            </span>
                        </div>
                    </div>

                    {/* Stats Badge */}
                    <div className="flex items-center gap-2 ml-2">
                        <div className="text-right">
                            <div className="flex items-center gap-1 text-blue-400">
                                <Activity size={12} />
                                <span className="text-xs font-semibold">
                                    {session.total_detections?.toLocaleString() || '0'}
                                </span>
                            </div>
                            <span className="text-xs text-gray-500">detections</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Focus Icon - Show on hover */}
            {isHovered && !isFocused && (
                <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm rounded-lg p-2">
                    <Maximize2 size={16} className="text-white" />
                </div>
            )}

            {/* Focused Indicator */}
            {isFocused && (
                <div className="absolute top-2 left-2 bg-blue-500 text-white px-2 py-1 rounded-md text-xs font-semibold">
                    FOCUSED
                </div>
            )}
        </div>
    );
}
