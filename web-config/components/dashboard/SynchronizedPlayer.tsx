'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { api, SessionInfo, VideoSegment, Detection } from '@/lib/api';
import { Loader2, AlertTriangle } from 'lucide-react';

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
}: SynchronizedPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [segments, setSegments] = useState<VideoSegment[]>([]);

    // 1. Find the active session for the current time
    const currentSession = useMemo(() => {
        const timeMs = currentTime.getTime();

        const found = sessions.find(s => {
            // User confirmed DB stores Local Time. Browser treats ISO w/o Z as Local.
            const startStr = s.created_at;
            const start = new Date(startStr).getTime();

            let end = null;
            if (s.ended_at) {
                const endStr = s.ended_at;
                end = new Date(endStr).getTime();
            }

            // Add tolerance for matching (e.g. 30 minutes)
            // This handles cases where detections exist slightly outside the reported session bounds
            const TOLERANCE = 30 * 60 * 1000;

            const effectiveStart = start - TOLERANCE;
            const effectiveEnd = end ? end + TOLERANCE : null;

            return timeMs >= effectiveStart && (effectiveEnd ? timeMs <= effectiveEnd : true);
        });

        // 2. Fallback: Detection-based matching
        // If the session metadata (start/end) is wrong but we have detections at this time,
        // trust the detections to identify the active session.
        if (!found && detections.length > 0) {
            const nearbyDetection = detections.find(d => {
                if (!d.timestamp) return false;
                // Detections from API might be UTC or Local.
                // If backend sends ISO without Z (Local Naive), new Date() treats as Local.
                // If backend sends ISO with Z (UTC), new Date() treats as UTC.
                // Let's assume they match the timeline's coordinate system.
                const t = new Date(d.timestamp).getTime();
                return Math.abs(t - timeMs) < 60000; // Within 1 minute
            });

            if (nearbyDetection) {
                // Return matching session if found
                const sessionMatch = sessions.find(s => s.id === nearbyDetection.session_id);
                if (sessionMatch) return sessionMatch;
            }
        }

        if (found) console.log(`[SyncPlayer ${cameraName}] Matched Session: ${found.id}`);
        else console.warn(`[SyncPlayer ${cameraName}] No matching session found!`);

        return found;
    }, [sessions, currentTime, cameraName, detections]);

    // Store video intrinsic dimensions for SVG coordinate system
    const [videoDims, setVideoDims] = useState<{ width: number, height: number } | null>(null);

    // Filter detections for this session only (Optimization)
    // Memoize the filtering of detections for the current session to avoid re-filtering on every tick
    const sessionDetections = useMemo(() => {
        if (!currentSession) return [];
        const filtered = detections.filter(d => d.session_id === currentSession.id);
        console.log(`[SyncPlayer ${cameraName}] Session ${currentSession.id} has ${filtered.length} detections (Total: ${detections.length})`);
        if (detections.length > 0 && filtered.length === 0) {
            console.log('[SyncPlayer] Mismatch? First det session:', detections[0].session_id, 'Current:', currentSession.id);
        }
        return filtered;
    }, [currentSession?.id, detections]); // removed detections from dep if it's stable, but it might change

    // 2. Fetch Segments when Session Changes
    useEffect(() => {
        if (!currentSession) {
            setSegments([]);
            return;
        }

        let cancelled = false;
        api.getSessionSegments(currentSession.id)
            .then(data => {
                if (!cancelled) setSegments(data);
            })
            .catch(err => {
                console.warn("Failed to fetch segments", err);
                if (!cancelled) setSegments([]);
            });

        return () => { cancelled = true; };
    }, [currentSession?.id]);

    // 3. Find Active Segment vs Legacy File
    const activeSource = useMemo(() => {
        if (!currentSession) return null;

        // A. Check segments first
        if (segments.length > 0) {
            const timeMs = currentTime.getTime();

            // Filter segments that start <= currentTime
            // FIX: Exclude 'recording' segments as they are 0-byte and not playable yet.
            const candidates = segments.filter(s =>
                new Date(s.start_time).getTime() <= timeMs && s.status === 'completed'
            );

            console.log(`[SyncPlayer ${cameraName}] Active Source Check: Time=${timeMs}, Candidates=${candidates.length}`);

            if (candidates.length > 0) {
                const seg = candidates[candidates.length - 1];
                if (seg.end_time) {
                    const end = new Date(seg.end_time).getTime();
                    // Tolerance for gaps? 
                    if (timeMs > end + 5000) { // Increased gap tolerance to 5s
                        return null; // Gap?
                    }
                }
                return { type: 'segment', data: seg };
            }
            return null; // Before first segment?
        }

        // B. Fallback to Legacy Session File or Live RTSP
        // If we have a video_output_path, use it. If not, but it's an RTSP source, we might need a direct stream URL.
        // For now, assuming video_output_path is the source of truth for "recording file".
        if (currentSession.video_output_path || currentSession.source_type === 'rtsp') {
            // Validate start time. If invalid, default to currentTime to avoid "1970" jumps.
            let start = currentSession.created_at;
            if (!start || isNaN(new Date(start).getTime())) {
                console.warn(`[SyncPlayer ${cameraName}] Invalid session start time: ${start}. Defaulting to now.`);
                start = new Date().toISOString();
            }

            return {
                type: 'legacy',
                path: currentSession.video_output_path || currentSession.source_path,
                start: start
            };
        }

        return null; // No video source found
    }, [currentSession, segments, currentTime, cameraName]);

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
    // Use a local time state that updates on every animation frame for smooth overlays
    const [currentRenderTime, setCurrentRenderTime] = useState<number>(currentTime.getTime());
    // Debug State
    const [showDebug, setShowDebug] = useState(false);
    const requestRef = useRef<number | null>(null);

    // Video Animation Loop (Running only when playing)
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
                        if (isNaN(sourceStartMs)) sourceStartMs = Date.now(); // Fallback
                    }
                    const nowMs = sourceStartMs + (videoRef.current.currentTime * 1000);
                    setCurrentRenderTime(nowMs);
                } else {
                    // Gap handling: If no video source, rely on the main clock (currentTime)
                    // We can't smooth-interpolate easily without a reference, so sync to target.
                    // Or ideally, the parent updates currentTime, and we display it.
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
    }, [isPlaying, activeSource]);

    // Sync render time when paused (so seeking updates overlay)
    useEffect(() => {
        if (!isPlaying) {
            setCurrentRenderTime(currentTime.getTime());
        }
    }, [currentTime, isPlaying]);

    // Find detections for the current frame (e.g., +/- 100ms)
    const activeDetections = useMemo(() => {
        if (!currentSession || sessionDetections.length === 0) return [];

        // Use the smooth render time instead of the prop time
        // The prop time (currentTime) might jump in 1s intervals, causing stutter
        const timeMs = currentRenderTime;

        // Tolerance: We use a wide window to find candidates, but then pick the closest one per class.
        // Increased to handle potential drift between video stream and DB timestamps (observed ~2 mins).
        const TOLERANCE = 150 * 1000;

        // 1. Find all candidates within tolerance
        const candidates = sessionDetections.filter(d => {
            if (!d.timestamp) return false;
            const detTime = new Date(d.timestamp).getTime();
            return Math.abs(detTime - timeMs) <= TOLERANCE;
        });

        // 2. Group by class and pick the closest one
        const closestByClass = new Map<string, { diff: number, det: Detection }>();

        candidates.forEach(d => {
            const detTime = new Date(d.timestamp as string).getTime();
            const diff = Math.abs(detTime - timeMs);
            const cls = d.class_name || 'unknown';

            if (!closestByClass.has(cls) || diff < closestByClass.get(cls)!.diff) {
                closestByClass.set(cls, { diff, det: d });
            }
        });

        return Array.from(closestByClass.values()).map(v => v.det);
    }, [currentRenderTime, currentSession, sessionDetections]);

    // Color Mapping
    const getColor = (className: string) => {
        const cls = className.toLowerCase();
        if (cls.includes('fire_smoke')) return '#EF4444'; // Red
        if (cls.includes('smoke')) return '#A855F7'; // Purple
        if (cls.includes('steam')) return '#3B82F6'; // Blue
        if (cls.includes('fire')) return '#EAB308'; // Yellow
        return '#22C55E'; // Green (default)
    };

    // 6. Master Clock Logic
    const handleTimeUpdate = () => {
        if (!isMaster || !onTimeUpdate || !videoRef.current || !activeSource) return;

        const video = videoRef.current;
        let sourceStartMs = 0;
        if (activeSource.type === 'segment') {
            const seg = activeSource.data as VideoSegment;
            sourceStartMs = new Date(seg.start_time).getTime();
        } else {
            sourceStartMs = new Date(activeSource.start as string).getTime();
        }

        const newTimeMs = sourceStartMs + (video.currentTime * 1000);
        onTimeUpdate(new Date(newTimeMs));
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            setVideoDims({
                width: videoRef.current.videoWidth,
                height: videoRef.current.videoHeight
            });
        }
    };

    // Ensure video dims are set if metadata was already loaded (e.g. cached)
    useEffect(() => {
        if (videoRef.current && videoRef.current.readyState >= 1) {
            setVideoDims({
                width: videoRef.current.videoWidth,
                height: videoRef.current.videoHeight
            });
        }
    }, [videoSrc]);

    // 7. Video Controls Sync (Play/Pause)
    useEffect(() => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.play().catch(e => console.warn("Play failed", e));
        } else {
            videoRef.current.pause();
        }
    }, [isPlaying]);

    // 8. Video Time Sync (Seek/Drift Correction)
    useEffect(() => {
        if (!videoRef.current || !activeSource || isMaster) return; // Master drives itself

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

        // If drift is significant (> 500ms), seek
        if (drift > 500) {
            const seekTime = (targetTimeMs - sourceStartMs) / 1000;
            if (seekTime >= 0 && isFinite(seekTime)) {
                // Check if seekTime is within video duration if metadata loaded
                if (!isNaN(video.duration) && seekTime > video.duration) {
                    // gap or end of segment handling could go here
                } else {
                    video.currentTime = seekTime;
                }
            }
        }
    }, [currentTime, activeSource, isMaster]);


    // Replace render with overlay support
    return (
        <div className="relative w-full h-full bg-black group flex items-center justify-center">
            {/* Debug Toggle Button (Top-Right of Player, moved down to avoid Live Sync overlap) */}
            <button
                onClick={(e) => { e.stopPropagation(); setShowDebug(!showDebug); }}
                className={`absolute top-16 right-2 z-50 p-1.5 rounded-md transition-colors shadow-lg ${showDebug ? 'bg-red-600 text-white' : 'bg-black/50 text-gray-400 hover:bg-black/80'}`}
                title="Toggle Debug Info"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m8 2 1.88 1.88" /><path d="M14.12 3.88 16 2" /><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" /><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" /><path d="M12 20v-9" /><path d="M6.53 9C4.6 8.8 3 7.1 3 5" /><path d="M6 13H2" /><path d="M3 21c0-2.1 1.7-3.9 3.8-4" /><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" /><path d="M22 13h-4" /><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" /></svg>
            </button>

            {/* Debug Overlay Panel */}
            {showDebug && (
                <div className="absolute top-10 right-2 z-20 w-80 bg-black/90 border border-gray-700 rounded-lg p-2 text-[10px] font-mono text-gray-200 overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
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
                        <span className="truncate">{activeSource?.type === 'segment' ? 'Segment' : 'Legacy'}</span>

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
                                const color = getColor(d.class_name || '');
                                return (
                                    <div key={i} className="grid grid-cols-4 gap-1 items-center border-b border-gray-800 pb-0.5 last:border-0">
                                        <span style={{ color }}>{d.class_name}</span>
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

            {/* 
                Container for Video + Overlay 
                We use aspect-ratio logic or just centered layout. 
                Ideally, we want the overlay to match the video size exactly.
                If video is object-contain, it might have letterboxing.
                We can position the overlay using a wrapper that has the same aspect ratio as the video.
            */}

            <div className="relative" style={{
                aspectRatio: videoDims ? `${videoDims.width}/${videoDims.height}` : 'auto',
                height: '100%',
                maxHeight: '100%',
                maxWidth: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
            }}>
                <video
                    ref={videoRef}
                    className="w-full h-full object-contain block"
                    src={videoSrc || undefined}
                    controls={false}
                    muted
                    playsInline
                    onTimeUpdate={handleTimeUpdate}
                    onWaiting={() => setIsLoading(true)}
                    onPlaying={() => setIsLoading(false)}
                    onLoadedMetadata={handleLoadedMetadata}
                    onError={() => console.log("Video Playback Error")}
                />

                {/* SVG Overlay */}
                {videoDims && activeDetections.length > 0 && (
                    <svg
                        className="absolute top-0 left-0 w-full h-full pointer-events-none"
                        viewBox={`0 0 ${videoDims.width} ${videoDims.height}`}
                        preserveAspectRatio="xMidYMid meet" // Match object-contain behavior
                    >
                        {(() => {
                            // Sort detections by priority for Z-index (Low -> High)
                            const getPriority = (cls: string = '') => {
                                if (cls.includes('fire_smoke')) return 4;
                                if (cls.includes('smoke')) return 3;
                                if (cls.includes('fire')) return 2;
                                if (cls.includes('steam')) return 1;
                                return 0;
                            };

                            const sortedDetections = [...activeDetections].sort((a, b) => {
                                const pA = getPriority((a.class_name || '').toLowerCase());
                                const pB = getPriority((b.class_name || '').toLowerCase());
                                return pA - pB;
                            });

                            return sortedDetections.map((det, idx) => {
                                const color = getColor(det.class_name || '');
                                return (
                                    <g key={idx}>
                                        {showBBox && (
                                            <rect
                                                x={det.bbox_x1}
                                                y={det.bbox_y1}
                                                width={det.bbox_x2 - det.bbox_x1}
                                                height={det.bbox_y2 - det.bbox_y1}
                                                fill="none"
                                                stroke={color}
                                                strokeWidth="2"
                                            />
                                        )}
                                        {(showLabels || showConfidence) && (
                                            <text
                                                x={det.bbox_x1}
                                                y={det.bbox_y1 - 5}
                                                fill={color}
                                                fontWeight="bold"
                                                fontSize="14" // Larger font for readability
                                                style={{ textShadow: '1px 1px 2px black' }}
                                            >
                                                {showLabels ? det.class_name : ''}
                                                {showLabels && showConfidence ? ' ' : ''}
                                                {showConfidence ? `${Math.round(det.confidence * 100)}%` : ''}
                                            </text>
                                        )}
                                    </g>
                                );
                            });
                        })()}
                    </svg>
                )}
            </div>

            {/* Overlay Info (Top Right) */}
            <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-gray-300 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-20">
                {activeSource?.type === 'segment' ? 'SEG' : 'FILE'} | {new Date(currentTime).toLocaleTimeString()}
            </div>
        </div>
    );
}
