'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { api, SessionInfo, VideoSegment, Detection } from '@/lib/api';
import { useSettings } from '@/components/SettingsContext';
import { drawDetections, getClassColor } from '@/lib/detection-utils';

interface SynchronizedPlayerProps {
    cameraName: string;
    sessions: SessionInfo[];
    currentTime: Date;
    isPlaying: boolean;
    playbackSpeed: number;
    detections?: Detection[];
    showBBox?: boolean;
    showLabels?: boolean;
    showConfidence?: boolean;
    isMaster?: boolean;
    onTimeUpdate?: (time: Date) => void;
    // Optimization: Pass pre-fetched segments to avoid internal API calls
    segmentsMap?: Record<number, VideoSegment[]>;
}

export default function SynchronizedPlayer({
    cameraName,
    sessions,
    currentTime,
    isPlaying,
    playbackSpeed,
    onTimeUpdate,
    isMaster = false,
    detections = [],
    showBBox = true,
    showLabels = true,
    showConfidence = true,
    segmentsMap,
}: SynchronizedPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [localSegments, setLocalSegments] = useState<VideoSegment[]>([]);

    // Global Settings with Camera Override
    const { getSettingsForCamera, scopeSettings } = useSettings();

    const DEFAULT_SETTINGS = { overlayScale: 0.035, strokeScale: 0.003 };

    const effectiveSettings = scopeSettings.recordings
        ? getSettingsForCamera(cameraName)
        : DEFAULT_SETTINGS;

    // 1. Find the active session for the current time
    const currentSession = useMemo(() => {
        const timeMs = currentTime.getTime();

        // Strategy 1: Check if any detection in the buffer is VERY close (correlated)
        // This helps when session times might be slightly off or gaps exist
        const relevantDetection = detections.find(d => {
            if (!d.timestamp) return false;
            const dt = new Date(d.timestamp).getTime();
            return Math.abs(dt - timeMs) < 2000; // 2s tolerance
        });

        if (relevantDetection) {
            const sessionMatch = sessions.find(s => s.id === relevantDetection.session_id);
            if (sessionMatch) return sessionMatch;
        }

        // Strategy 2: Standard Time Range Check
        const found = sessions.find(s => {
            const startStr = s.created_at;
            const start = new Date(startStr).getTime();

            let end = null;
            if (s.ended_at) {
                const endStr = s.ended_at;
                end = new Date(endStr).getTime();
            }

            // Increased tolerance for Postgres UTC matching
            const TOLERANCE_START = 60 * 60 * 1000; // 1h tolerance for late starts
            const TOLERANCE_END = 60 * 60 * 1000;   // 1h tolerance for ends

            const effectiveStart = start - TOLERANCE_START;
            const effectiveEnd = end ? end + TOLERANCE_END : (s.status === 'running' ? Date.now() + 86400000 : null);

            return timeMs >= effectiveStart && (effectiveEnd ? timeMs <= effectiveEnd : true);
        });

        return found;
    }, [sessions, currentTime, detections]);

    // Store video intrinsic dimensions for Canvas
    const [videoDims, setVideoDims] = useState<{ width: number, height: number } | null>(null);

    // Use passed segments if available, otherwise use local state
    const segments = useMemo(() => {
        if (segmentsMap && currentSession) {
            return segmentsMap[currentSession.id] || [];
        }
        return localSegments;
    }, [segmentsMap, currentSession, localSegments]);

    // Filter detections for this session only (Optimization)
    const sessionDetections = useMemo(() => {
        if (!currentSession) return [];
        return detections.filter(d => d.session_id === currentSession.id);
    }, [currentSession?.id, detections]);

    // 2. Fetch Segments when Session Changes (Only if not provided via props)
    useEffect(() => {
        if (!currentSession || segmentsMap) {
            if (!currentSession) setLocalSegments([]);
            return;
        }

        let cancelled = false;
        api.getSessionSegments(currentSession.id)
            .then(data => {
                if (!cancelled) setLocalSegments(data);
            })
            .catch(err => {
                if (!cancelled) setLocalSegments([]);
            });

        return () => { cancelled = true; };
    }, [currentSession?.id, segmentsMap]);

    // 3. Find Active Segment vs Legacy File
    const activeSource = useMemo(() => {
        if (!currentSession) return null;

        if (segments.length > 0) {
            const timeMs = currentTime.getTime();

            const candidates = segments.filter(s => {
                const start = new Date(s.start_time).getTime();

                // Allow any segment with a file path unless explicitly failed
                const isReady = s.status === 'completed' || s.status === 'ready' || (s.file_path && !s.file_path.endsWith('.m4v'));

                // Increased tolerance for matching to 4.0 seconds (was 2.5s) to handle larger RTSP gaps
                // DEBUG: Log filtering
                // console.log(`[SyncPlayer] Checking time: ${new Date(timeMs).toISOString()} against ${segments.length} segments`);

                return start <= timeMs + 4000 && isReady;
            });

            if (candidates.length > 0) {
                // [Fix] Iterate backwards through candidates to find the *first* one that actually fits the strict range.
                // Previously, we just took the last candidate (newest), which might be too early (in the lookahead window but not in the playback window).
                for (let i = candidates.length - 1; i >= 0; i--) {
                    const seg = candidates[i];
                    const start = new Date(seg.start_time).getTime();
                    let end = seg.end_time
                        ? new Date(seg.end_time).getTime()
                        : start + ((seg.duration_seconds || 0) * 1000);

                    // If currentTime is within the segment (plus small buffer), it's active
                    if (timeMs >= start - 2000 && timeMs <= end + 10000) {
                        // console.log(`[SyncPlayer] Selected Source: ${seg.id}`);
                        return { type: 'segment', data: seg };
                    }
                }
                console.warn(`[SyncPlayer] Candidates found but NONE in range!`);
            } else {
                console.warn(`[SyncPlayer] No candidates found for time: ${new Date(timeMs).toISOString()}`);
            }
            return null;
        }

        // [Fix] Only fall back to full video file if source_type is 'video' (static file analysis).
        // For RTSP/Webcam, if no segments are found, we should return null (NO SIGNAL)
        // instead of trying to open a non-existent "output" file which causes 404 errors.
        if (currentSession.source_type === 'video' && (currentSession.video_output_path || currentSession.source_path)) {
            let start = currentSession.created_at;
            if (!start || isNaN(new Date(start).getTime())) {
                start = new Date().toISOString();
            }

            return {
                type: 'legacy',
                path: currentSession.video_output_path || currentSession.source_path,
                start: start
            };
        }

        return null;
    }, [currentSession, segments, currentTime]);

    // 4. Resolve Video URL
    const videoSrc = useMemo(() => {
        if (!activeSource) return null;
        if (activeSource.type === 'segment') {
            return api.getVideoUrl((activeSource.data as VideoSegment).file_path);
        } else {
            return api.getVideoUrl(activeSource.path as string);
        }
    }, [activeSource]);

    // 5. Smooth Animation Loop for Overlays
    useEffect(() => {
        console.log('[Player] Active Source:', activeSource, 'IsLoading:', isLoading, 'VideoSrc:', videoSrc);
        setError(false); // Reset error when source changes
    }, [activeSource, isLoading, videoSrc]);

    const [currentRenderTime, setCurrentRenderTime] = useState<number>(currentTime.getTime());
    const [showDebug, setShowDebug] = useState(false);
    const [error, setError] = useState(false);
    const requestRef = useRef<number | null>(null);

    useEffect(() => {
        const animate = () => {
            if (videoRef.current && !videoRef.current.paused && isPlaying) {
                if (activeSource) {
                    let sourceStartMs = 0;
                    if (activeSource.type === 'segment') {
                        sourceStartMs = new Date((activeSource.data as VideoSegment).start_time).getTime();
                    } else {
                        const startStr = activeSource.start as string;
                        sourceStartMs = new Date(startStr).getTime();
                        if (isNaN(sourceStartMs)) sourceStartMs = Date.now();
                    }
                    const nowMs = sourceStartMs + (videoRef.current.currentTime * 1000);
                    setCurrentRenderTime(nowMs);
                } else {
                    setCurrentRenderTime(currentTime.getTime());
                }
            }
            requestRef.current = requestAnimationFrame(animate);
        };

        if (isPlaying) {
            requestRef.current = requestAnimationFrame(animate);
        }

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isPlaying, activeSource, currentTime]);

    useEffect(() => {
        if (!isPlaying) {
            setCurrentRenderTime(currentTime.getTime());
        }
    }, [currentTime, isPlaying]);

    // Find detections for the current frame
    const activeDetections = useMemo(() => {
        if (!currentSession || sessionDetections.length === 0) return [];
        const timeMs = currentRenderTime;
        const TOLERANCE = 2000;

        const candidates = sessionDetections.filter(d => {
            if (!d.timestamp) return false;
            const detTime = new Date(d.timestamp).getTime();
            const diff = Math.abs(detTime - timeMs);
            return diff <= TOLERANCE;
        });

        const closestByClass = new Map<string, { diff: number, det: Detection }>();

        candidates.forEach(d => {
            const detTime = new Date(d.timestamp as string).getTime();
            const diff = Math.abs(detTime - timeMs);
            const cls = d.class_name || d.class || 'unknown';

            if (!closestByClass.has(cls) || diff < closestByClass.get(cls)!.diff) {
                closestByClass.set(cls, { diff, det: d });
            }
        });

        return Array.from(closestByClass.values()).map(v => v.det);
    }, [currentRenderTime, currentSession, sessionDetections]);

    const lastSeekTime = useRef<number>(0);

    // 6. Master Clock Logic
    const handleTimeUpdate = () => {
        if (!isMaster || !onTimeUpdate || !videoRef.current || !activeSource) return;

        const video = videoRef.current;

        // Prevent updates while seeking to avoid "rebound"
        // This is the standard way to handle seek-updates
        if (video.seeking) return;

        let sourceStartMs = 0;
        if (activeSource.type === 'segment') {
            const seg = activeSource.data as VideoSegment;
            sourceStartMs = new Date(seg.start_time).getTime();
        } else {
            sourceStartMs = new Date(activeSource.start as string).getTime();
        }

        const currentVideoTimeMs = sourceStartMs + (video.currentTime * 1000);

        // Removed Drift Guard: It causes stuck timeline if keyframe snap is large.
        // We trust the video time (once not seeking) to be the source of truth.

        onTimeUpdate(new Date(currentVideoTimeMs));
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            setVideoDims({
                width: videoRef.current.videoWidth,
                height: videoRef.current.videoHeight
            });
        }
    };

    useEffect(() => {
        // Reset dims when source changes to prevent stale layout/bbox
        setVideoDims(null);
        if (videoRef.current && videoRef.current.readyState >= 1) {
            setVideoDims({
                width: videoRef.current.videoWidth,
                height: videoRef.current.videoHeight
            });
        }
    }, [videoSrc]);

    // 7. Video Controls Sync
    useEffect(() => {
        if (!videoRef.current) return;
        if (isPlaying) {
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(e => console.warn("Play failed", e));
            }
        } else {
            videoRef.current.pause();
        }
    }, [isPlaying, videoSrc]);

    // 8. Video Time Sync
    useEffect(() => {
        if (!videoRef.current || !activeSource) return;

        const video = videoRef.current;
        let sourceStartMs = 0;
        if (activeSource.type === 'segment') {
            sourceStartMs = new Date((activeSource.data as VideoSegment).start_time).getTime();
        } else {
            sourceStartMs = new Date(activeSource.start as string).getTime();
        }

        const currentVideoTimeMs = sourceStartMs + (video.currentTime * 1000);
        const targetTimeMs = currentTime.getTime();
        const drift = Math.abs(currentVideoTimeMs - targetTimeMs);

        if (drift > 500) {
            const seekTime = (targetTimeMs - sourceStartMs) / 1000;
            if (seekTime >= 0 && isFinite(seekTime)) {
                if (!isNaN(video.duration) && seekTime > video.duration) {
                    // [Gap Jump Logic]
                    // If we are past the duration of the current video, it means we are in a gap.
                    // We should check if the gap is small enough to jump over.
                    const GAP_JUMP_LIMIT = 5000; // Increased to 5s for safety
                    const timeSinceEnd = seekTime - video.duration;

                    if (timeSinceEnd < GAP_JUMP_LIMIT / 1000) {
                        // We are in a small gap.
                        // For MASTER player, loop effect below handles it (Freewheel).
                        // For now, do not update currentTime here, let the loop drive it.
                    }
                } else {
                    video.currentTime = seekTime;
                }
            }
        }
    }, [currentTime, activeSource, isMaster]);

    // 9. Gap Jumping / Auto-Advance Logic (Master Only)
    // Also serves as "Freewheel" logic when activeSource is null but we are playing
    // 9. Gap Jumping / Auto-Advance Logic (Master Only)
    // Also serves as "Freewheel" logic when activeSource is null but we are playing
    useEffect(() => {
        if (!isMaster || !isPlaying) return;

        const intervalMs = 100;
        const tickAmountMs = intervalMs * playbackSpeed;

        const checkTick = () => {
            // Case 1: No active source (GAP or End of list)
            // We should just tick forward blindly if we are "playing" to traverse the gap
            if (!activeSource) {
                if (onTimeUpdate) {
                    const nextTime = new Date(currentTime.getTime() + tickAmountMs);
                    console.log('[SyncPlayer] Freewheeling gap (No Source)...', nextTime.toISOString());
                    onTimeUpdate(nextTime);
                }
                return;
            }

            // Case 2: Active Source exists
            if (videoRef.current) {
                const video = videoRef.current;

                // Check if video has ended or is stuck at end
                // Loosened tolerance to 0.5s to catch end of video earlier
                if (video.ended || (video.duration > 0 && video.currentTime >= video.duration - 0.5)) {
                    // Force jump
                    const nextTickTime = new Date(currentTime.getTime() + tickAmountMs);
                    console.log('[SyncPlayer] Freewheeling gap (Video End)...', nextTickTime.toISOString(), `CT: ${video.currentTime}/${video.duration}`);
                    if (onTimeUpdate) {
                        onTimeUpdate(nextTickTime);
                    }
                }
            }
        };

        const interval = setInterval(checkTick, intervalMs);
        return () => clearInterval(interval);
    }, [isMaster, isPlaying, activeSource, currentTime, onTimeUpdate, playbackSpeed]);

    // Canvas Draw Effect
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !videoDims) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Match canvas resolution to its display size (clientWidth/Height)
        // This ensures the drawing context matches the rendered size on screen,
        // correcting for any CSS scaling or aspect ratio adjustments.
        const displayWidth = canvas.clientWidth;
        const displayHeight = canvas.clientHeight;

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (activeDetections.length > 0) {
            // Note: drawDetections expects showBoxes/showLabels, mapped from props
            drawDetections(
                ctx,
                canvas,
                activeDetections,
                videoDims,
                {
                    showBoxes: showBBox,
                    showLabels,
                    showConfidence,
                    overlayScale: effectiveSettings.overlayScale,
                    strokeScale: effectiveSettings.strokeScale
                }
            );
        }
    }, [activeDetections, videoDims, showBBox, showLabels, showConfidence]);


    return (
        <div className="relative w-full h-full bg-black group flex items-center justify-center">
            {/* Debug Toggle Button */}
            <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDebug(!showDebug); }}
                className={`absolute top-2 right-2 z-50 p-1.5 rounded-md transition-colors shadow-lg cursor-pointer ${showDebug ? 'bg-red-600 text-white' : 'bg-black/50 text-gray-400 hover:bg-black/80'}`}
                title="Toggle Debug Info"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m8 2 1.88 1.88" /><path d="M14.12 3.88 16 2" /><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" /><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" /><path d="M12 20v-9" /><path d="M6.53 9C4.6 8.8 3 7.1 3 5" /><path d="M6 13H2" /><path d="M3 21c0-2.1 1.7-3.9 3.8-4" /><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" /><path d="M22 13h-4" /><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" /></svg>
            </button>

            {/* Debug Overlay Panel */}
            {/* Debug Overlay Panel */}
            {showDebug && (
                <div className="absolute top-10 right-2 z-40 w-80 bg-black/90 border border-gray-700 rounded-lg p-2 text-[10px] font-mono text-gray-200 overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-1 border-b border-gray-700 pb-1">
                        <span className="font-bold text-blue-400">Debug Inspection</span>
                        <div className="text-right">
                            <div>R: {new Date(currentRenderTime).toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 3 })}</div>
                        </div>
                    </div>

                    {/* Timing Stats */}
                    <div className="mb-2 p-1 bg-gray-800 rounded grid grid-cols-2 gap-x-2 gap-y-0.5">
                        <span className="text-gray-400">Target (T):</span>
                        <span>{currentTime.toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 3 })}</span>

                        <span className="text-gray-400">Drift (R-T):</span>
                        <span className={`${Math.abs(currentRenderTime - currentTime.getTime()) > 500 ? 'text-red-500' : 'text-green-500'}`}>
                            {(currentRenderTime - currentTime.getTime()).toFixed(0)}ms
                        </span>

                        <span className="text-gray-400">Video Time:</span>
                        <span>{videoRef.current?.currentTime.toFixed(3)}s</span>

                        <span className="text-gray-400">Source:</span>
                        <span className="truncate">{activeSource ? (activeSource.type === 'segment' ? 'Segment' : 'Legacy') : 'None'}</span>

                        <span className="text-gray-400">Master?:</span>
                        <span className={isMaster ? 'text-green-400' : 'text-yellow-400'}>{isMaster ? 'YES' : 'NO'}</span>

                        <span className="text-gray-400">Playing?:</span>
                        <span>{isPlaying ? 'YES' : 'NO'}</span>

                        <span className="text-gray-400">Video Paused?:</span>
                        <span>{videoRef.current?.paused ? 'YES' : 'NO'}</span>

                        {/* Deep Sync Debug */}
                        <div className="col-span-2 mt-1 pt-1 border-t border-gray-700 grid grid-cols-2 gap-x-2">
                            <span className="text-gray-500">Seg Start:</span>
                            <span className="truncate" title={activeSource?.type === 'segment' ? (activeSource.data as VideoSegment).start_time : ''}>
                                {activeSource?.type === 'segment'
                                    ? (activeSource.data as VideoSegment).start_time.split('T')[1]
                                    : 'N/A'}
                            </span>

                            <span className="text-gray-500">Calc Seek:</span>
                            <span>
                                {(() => {
                                    let start = 0;
                                    if (activeSource?.type === 'segment') start = new Date((activeSource.data as VideoSegment).start_time).getTime();
                                    else if (activeSource?.start) start = new Date(activeSource.start as string).getTime();
                                    return ((currentTime.getTime() - start) / 1000).toFixed(3);
                                })()}s
                            </span>

                            <span className="text-gray-500">Duration:</span>
                            <span>{videoRef.current?.duration.toFixed(3)}s</span>
                        </div>
                    </div>

                    <div className="space-y-1 max-h-60 overflow-y-auto">
                        <div className="grid grid-cols-4 gap-1 text-gray-500 font-bold mb-1">
                            <span>Class</span>
                            <span>Conf</span>
                            <span>Time</span>
                            <span>BBox</span>
                        </div>
                        {activeDetections.length === 0 ? (
                            <div className="text-gray-500 italic text-center py-2">
                                No active detections<br />
                                <span className="text-xs text-gray-600">
                                    (Range: {new Date(currentRenderTime - 1000).toLocaleTimeString()} - {new Date(currentRenderTime + 1000).toLocaleTimeString()})
                                </span>
                            </div>
                        ) : (
                            activeDetections.map((d, i) => {
                                const cls = d.class_name || 'Unknown';
                                const color = getClassColor(cls);
                                return (
                                    <div key={i} className="grid grid-cols-4 gap-1 items-center border-b border-gray-800 pb-0.5 last:border-0">
                                        <span style={{ color }}>{cls}</span>
                                        <span>{(d.confidence * 100).toFixed(0)}%</span>
                                        <span className="truncate" title={d.timestamp || undefined}>{d.timestamp?.split('T')[1].replace('Z', '')}</span>
                                        <span className="truncate" title={`[${d.bbox_x1},${d.bbox_y1},${d.bbox_x2},${d.bbox_y2}]`}>
                                            {d.bbox_x1},{d.bbox_y1}...
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    <div className="mt-1 pt-1 border-t border-gray-700 text-gray-500 flex justify-between">
                        <span>Buffer: {sessionDetections?.length || 0}</span>
                        <span>Active: {activeDetections.length}</span>
                    </div>
                </div>
            )}

            <div className="relative w-full max-w-full max-h-full flex items-center justify-center" style={{
                aspectRatio: videoDims ? `${videoDims.width}/${videoDims.height}` : 'auto'
            }}>
                <video
                    ref={videoRef}
                    className={`w-full h-full object-contain block ${!activeSource ? 'hidden' : ''}`}
                    src={videoSrc || undefined}
                    controls={false}
                    muted
                    playsInline
                    onTimeUpdate={handleTimeUpdate}
                    onWaiting={() => setIsLoading(true)}
                    onPlaying={() => setIsLoading(false)}
                    onLoadedMetadata={handleLoadedMetadata}
                    onError={() => { console.log("Video Playback Error"); setError(true); }}
                />
                {/* Overlay: No Signal / Loading / Debug */}
                {/* Overlay: No Signal / Loading / Debug */}
                {(!videoSrc || error) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white z-10 p-4 text-center">
                        <p className="text-xl font-bold mb-2">
                            {error ? 'PLAYBACK ERROR' : 'NO SIGNAL / PROCESSING'}
                        </p>

                        {/* Only show technical details if Debug Mode is ON */}
                        {true && ( // Force debug for now to help user diagnose
                            <div className="text-xs font-mono text-left bg-gray-900 p-2 rounded max-w-full overflow-auto mt-2 border border-gray-700 pointer-events-auto">
                                <p className="text-red-400 font-bold mb-1">[DEBUG INFO]</p>
                                <p>Time: {currentTime.toLocaleString()}</p>
                                <p>Active Source: {activeSource ? (activeSource.type === 'segment' ? (activeSource.data as any).file_path.split('/').pop() : activeSource.path) : 'None (GAP)'}</p>
                                <p>Status: {isPlaying ? 'PLAYING (Freewheel)' : 'PAUSED'}</p>
                            </div>
                        )}
                        <p>Video Src: {videoSrc || 'None'}</p>
                        <p>Error: {error ? 'Playback Error' : 'No Source'}</p>
                        <p>Segments Available: {segments.length}</p>
                    </div>
                )}

                {/* Canvas Overlay using drawDetections */}
                {videoDims && activeDetections.length > 0 && (
                    <canvas
                        ref={canvasRef}
                        className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
                    />
                )}
            </div>
        </div>
    );
}
