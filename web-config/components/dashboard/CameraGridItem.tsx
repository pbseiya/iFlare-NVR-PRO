'use client';

import { SessionInfo } from '@/lib/api';
import { Maximize2, Circle } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import LiveCameraFeed from './LiveCameraFeed';
import { DrawDetectionsOptions } from '@/lib/detection-utils';

interface CameraGridItemProps {
    session: SessionInfo;
    onFocus?: () => void;
    isFocused?: boolean;
    detectionOptions: DrawDetectionsOptions;
    layout?: string;
}

export default function CameraGridItem({ session, onFocus, isFocused = false, detectionOptions, layout }: CameraGridItemProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const isRunning = session.status === 'running';

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(document.fullscreenElement === containerRef.current);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const handleDoubleClick = () => {
        if (containerRef.current) {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                containerRef.current.requestFullscreen();
            }
        }
    };

    return (
        <div
            ref={containerRef}
            className={`
                relative bg-gray-950 overflow-hidden transition-all cursor-pointer h-full w-full flex flex-col
                ${isFullscreen ? 'rounded-none border-0' : 'rounded-lg border-2'}
                ${isFocused && !isFullscreen
                    ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                    : isHovered && !isFullscreen
                        ? 'border-blue-400'
                        : !isFullscreen ? 'border-gray-800' : ''
                }
            `}
            onClick={onFocus}
            onDoubleClick={handleDoubleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Live Video Feed with Detection Overlay */}
            <div className="flex-1 min-h-0 relative bg-black">
                <div className="absolute inset-0 flex items-center justify-center">
                    <LiveCameraFeed session={session} options={detectionOptions} />
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
                                <Circle size={8} className="fill-current" />
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
                <div
                    className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm rounded-lg p-2 cursor-pointer hover:bg-black/70 transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleDoubleClick();
                    }}
                >
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

