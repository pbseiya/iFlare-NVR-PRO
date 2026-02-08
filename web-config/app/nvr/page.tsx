'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, SessionInfo, Detection } from '@/lib/api';
import { Play, Pause, AlertTriangle, Monitor, Clock, Film, Radio, Tv } from 'lucide-react';
import { useSettings, OverlaySettings } from '@/components/SettingsContext';
import { useDetectionFilter } from '@/hooks/useDetectionFilter';
import { DetectionToggles } from '@/components/shared/DetectionToggles';
import { drawDetections } from '@/lib/detection-utils';
import SynchronizedPlayer from '@/components/dashboard/SynchronizedPlayer';

export default function NVRPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const initialSessionId = searchParams.get('session_id') ? parseInt(searchParams.get('session_id')!) : null;

    const [selectedSessionId, setSelectedSessionId] = useState<number | null>(initialSessionId);
    // Removed manual video/canvas refs
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState<Date>(new Date()); // Changed to Date object
    const [playbackSpeed, setPlaybackSpeed] = useState(1);

    // Playback State
    const [activeSegment, setActiveSegment] = useState<any | null>(null); // Specific clip
    const [isLiveMode, setIsLiveMode] = useState(true); // Preference for Live vs Playback

    // Visibility Toggles managed by custom hook
    const detectionFilter = useDetectionFilter();

    // Sidebar Tab
    const [sidebarTab, setSidebarTab] = useState<'sessions' | 'clips'>('sessions');

    // Fetch sessions
    const { data: sessionsData } = useQuery({
        queryKey: ['sessions'],
        queryFn: () => api.listSessions({ limit: 100 }),
        refetchInterval: 5000,
    });

    // Get selected session
    const selectedSession = useMemo(() => {
        if (!sessionsData || !selectedSessionId) return null;
        return sessionsData.sessions.find(s => s.id === selectedSessionId) || null;
    }, [sessionsData, selectedSessionId]);

    // Fetch detections for selected session OR active segment
    // SynchronizedPlayer handles its own fetching based on time, but if we want to pass them in, we can.
    // However, SynchronizedPlayer expects full session detections or handles fetching internally if we improved it.
    // For now, let's keep fetching here but optimize it for the player.
    const { data: detections = [] } = useQuery({
        queryKey: ['detections', selectedSessionId, activeSegment?.id],
        queryFn: async () => {
            if (!selectedSessionId) return [];
            // Fetching full session detections for now to ensure SynchronizedPlayer has context
            // Optimization: Fetch only relevant window? SynchronizedPlayer filters anyway.
            // We can stick to the previous optimized logic:
            if (activeSegment) {
                return api.getDetections(
                    selectedSessionId,
                    2000,
                    activeSegment.start_time,
                    activeSegment.end_time || undefined
                );
            }
            return api.getDetections(selectedSessionId, 1000);
        },
        enabled: !!selectedSessionId,
        refetchInterval: (query) => {
            return selectedSession?.status === 'running' && isLiveMode ? 2000 : false;
        }
    });

    // Fetch Segments (Clips)
    const { data: segments = [] } = useQuery({
        queryKey: ['segments', selectedSessionId],
        queryFn: () => selectedSessionId ? api.getSessionSegments(selectedSessionId) : Promise.resolve([]),
        enabled: !!selectedSessionId,
        refetchInterval: 5000,
    });

    // Auto-select first session if none selected AND no initial ID provided
    useEffect(() => {
        if (!selectedSessionId && !initialSessionId && sessionsData?.sessions && sessionsData.sessions.length > 0) {
            handleSessionSelect(sessionsData.sessions[0]);
        }
    }, [sessionsData, selectedSessionId, initialSessionId]);

    // Handle Session Selection
    const handleSessionSelect = (session: SessionInfo) => {
        setSelectedSessionId(session.id);
        // Update URL
        router.push(`/nvr?session_id=${session.id}`);

        setIsPlaying(false);
        setActiveSegment(null);
        // Default to Live if running, else Playback (clips or empty)
        setIsLiveMode(session.status === 'running');
        if (session.status === 'running') {
            setCurrentTime(new Date()); // Liveish
        } else {
            setCurrentTime(new Date(session.created_at)); // Start of session
        }
    };

    // Handle Clip Selection
    const handleSegmentSelect = (segment: any) => {
        setActiveSegment(segment);
        setIsLiveMode(false); // Force Playback mode
        setIsPlaying(true); // Auto-play
        setCurrentTime(new Date(segment.start_time)); // Jump to clip start
    };

    const handleGoLive = () => {
        setActiveSegment(null);
        setIsLiveMode(true);
        setIsPlaying(true);
    };

    // Removed videoSrc memo

    // Removed manual canvas render logic (useEffect)

    const { getSettingsForCamera, scopeSettings } = useSettings();
    const DEFAULT_SETTINGS = { overlayScale: 0.035, strokeScale: 0.003 };

    // Let's implement the `onTimeUpdate` handler to update our local state from the player's progress.
    const handlePlayerTimeUpdate = (time: Date) => {
        setCurrentTime(time);

        // Auto-update active segment based on time for timeline/sidebar sync
        if (segments && segments.length > 0) {
            const timeMs = time.getTime();
            const currentSeg = segments.find(s => {
                const start = new Date(s.start_time).getTime();
                const end = start + ((s.duration_seconds || 0) * 1000);
                // Simple inclusion check
                return timeMs >= start && timeMs <= end;
            });

            if (currentSeg && activeSegment?.id !== currentSeg.id) {
                setActiveSegment(currentSeg);
            }
        }
    };

    return (
        <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-gray-800 border-b border-gray-700 p-4 flex items-center gap-3 shadow-md z-10">
                <div className="bg-blue-600 p-2 rounded-lg">
                    <Tv className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-white">Inference NVR</h1>
                    <p className="text-xs text-gray-400">Professional Monitoring System</p>
                </div>

                <div className="ml-8 flex items-center gap-4 bg-gray-900/50 px-4 py-2 rounded-lg border border-gray-700">
                    <DetectionToggles
                        filterState={detectionFilter}
                        actions={detectionFilter}
                        className="bg-transparent border-none p-0 border-0"
                    />
                </div>

                {/* Playback Controls (Scope-aware?) - Maybe just speed? */}
                {!isLiveMode && (
                    <div className="ml-4 flex items-center gap-2 bg-gray-800 rounded p-1">
                        {[1, 2, 4, 8].map(speed => (
                            <button
                                key={speed}
                                onClick={() => setPlaybackSpeed(speed)} // Start playback if clicked?
                                className={`px-2 py-1 text-xs font-bold rounded ${playbackSpeed === speed ? 'bg-blue-600' : 'text-gray-400 hover:text-white'}`}
                            >
                                {speed}x
                            </button>
                        ))}
                    </div>
                )}

                <div className="ml-auto">
                    <a href="/" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors">
                        Back to Config
                    </a>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden h-full">
                {/* Main Content (Video Player) */}
                <div className="flex-1 p-6 flex flex-col gap-4 bg-gray-950 relative overflow-hidden min-w-0">
                    {selectedSession ? (
                        <div className="flex flex-col gap-4 h-full">
                            {/* Player Container */}
                            <div className="relative bg-black rounded-xl overflow-hidden shadow-2xl w-full h-full flex flex-col flex-1 items-center justify-center border border-gray-800 group">
                                {isLiveMode && selectedSession.status === 'running' ? (
                                    <>
                                        <LiveView
                                            key={selectedSession.id}
                                            sessionId={selectedSession.id}
                                            detectionFilter={detectionFilter}
                                            settings={scopeSettings.nvr
                                                ? getSettingsForCamera(selectedSession.name || undefined)
                                                : DEFAULT_SETTINGS
                                            }
                                        />
                                        <div className="absolute top-4 right-4 bg-red-600 text-white text-xs px-2 py-1 rounded-full animate-pulse flex items-center gap-1 z-10 shadow-lg">
                                            <div className="w-2 h-2 bg-white rounded-full" />
                                            LIVE
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Playback Mode - USE SYNCHRONIZED PLAYER */}
                                        <SynchronizedPlayer
                                            cameraName={selectedSession.name || selectedSession.model_name}
                                            sessions={[selectedSession]} // Pass singular session in array
                                            currentTime={currentTime}
                                            isPlaying={isPlaying}
                                            playbackSpeed={playbackSpeed}
                                            detections={detections}
                                            showBBox={detectionFilter.showBoxes}
                                            showLabels={detectionFilter.showLabels}
                                            showConfidence={detectionFilter.showConfidence}
                                            isMaster={true} // NVR is always master of its own timeline
                                            onTimeUpdate={handlePlayerTimeUpdate}
                                        />

                                        {/* Start/Pause Overlay - Control Synchronized Player state */}
                                        {!isPlaying && (
                                            <div
                                                className="absolute inset-0 flex items-center justify-center bg-black/10 cursor-pointer group-hover:bg-black/20 transition-colors z-20"
                                                onClick={() => setIsPlaying(true)}
                                            >
                                                <div className="p-4 bg-white/10 backdrop-blur-md rounded-full border border-white/20 hover:scale-110 transition-transform">
                                                    <Play className="w-12 h-12 text-white fill-white" />
                                                </div>
                                            </div>
                                        )}

                                        {/* Status Overlay */}
                                        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
                                            <div className="flex items-center gap-3">
                                                <span className={`
                                px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider shadow-lg backdrop-blur-md flex items-center gap-2
                                ${isPlaying ? 'bg-blue-500/80 text-white' : 'bg-red-500/80 text-white animate-pulse'}
                            `}>
                                                    {isPlaying ? <Play size={12} className="fill-current" /> : <div className="w-2 h-2 bg-white rounded-full animate-ping" />}
                                                    {isPlaying ? `Playback: ${currentTime.toLocaleTimeString()}` : "Paused"}
                                                </span>

                                                {/* Session Name Badge */}
                                                <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-black/60 text-white backdrop-blur-md border border-white/10 shadow-lg">
                                                    {selectedSession?.name || "Unnamed Session"}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Go Live Float Button */}
                                        {selectedSession.status === 'running' && (
                                            <button
                                                onClick={handleGoLive}
                                                className="absolute bottom-4 right-4 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 transition-transform hover:scale-105 z-30"
                                            >
                                                <Radio className="w-4 h-4" /> Go Live
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Controls Bar */}
                            <div className="bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700 flex flex-col gap-3 shrink-0">
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setIsPlaying(!isPlaying)} disabled={isLiveMode} className={`p-2 rounded-full transition-colors text-white ${isLiveMode ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'}`}>
                                        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                                    </button>

                                    {/* Current Time Display */}
                                    <span className="text-sm font-mono text-gray-300 min-w-[80px]">
                                        {currentTime.toLocaleTimeString()}
                                    </span>

                                    {/* Timeline Container */}
                                    <div className="flex-1 flex items-center gap-3">
                                        <span className="text-xs text-gray-500 font-mono w-16 text-right">
                                            {activeSegment ? new Date(activeSegment.start_time).toLocaleTimeString() : "--:--:--"}
                                        </span>

                                        {/* Seek Bar */}
                                        <div className="flex-1 relative h-3 bg-gray-700 rounded-full cursor-pointer group"
                                            onClick={(e) => {
                                                if (isLiveMode || !activeSegment) return;
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                                const start = new Date(activeSegment.start_time).getTime();
                                                const duration = activeSegment.duration_seconds * 1000;
                                                const targetTime = new Date(start + (pct * duration));
                                                setCurrentTime(targetTime);
                                            }}
                                        >
                                            {/* Progress Fill */}
                                            <div
                                                className="absolute top-0 left-0 h-full bg-blue-500 rounded-full group-hover:bg-blue-400 transition-all relative overflow-visible"
                                                style={{
                                                    width: activeSegment
                                                        ? `${Math.min(100, Math.max(0, (currentTime.getTime() - new Date(activeSegment.start_time).getTime()) / (activeSegment.duration_seconds * 1000) * 100))}%`
                                                        : '0%'
                                                }}
                                            >
                                                {/* Handle Knob */}
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity translate-x-1/2" />
                                            </div>
                                        </div>

                                        <span className="text-xs text-gray-500 font-mono w-16">
                                            {activeSegment ? new Date(new Date(activeSegment.start_time).getTime() + (activeSegment.duration_seconds * 1000)).toLocaleTimeString() : "--:--:--"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500 bg-gray-900 rounded-xl border-2 border-dashed border-gray-800">
                            <div className="text-center">
                                <Tv className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                <p className="text-xl font-medium">Select a session</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col h-full shrink-0">
                    {/* Sidebar Tabs */}
                    <div className="flex border-b border-gray-800 bg-gray-900">
                        <button
                            className={`flex-1 p-4 text-sm font-semibold transition-all ${sidebarTab === 'sessions' ? 'text-blue-400 border-b-2 border-blue-500 bg-gray-800/50' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30 border-b-2 border-transparent'}`}
                            onClick={() => setSidebarTab('sessions')}
                        >
                            Sessions
                        </button>
                        <button
                            className={`flex-1 p-4 text-sm font-semibold transition-all ${sidebarTab === 'clips' ? 'text-blue-400 border-b-2 border-blue-500 bg-gray-800/50' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30 border-b-2 border-transparent'}
                            ${!selectedSession ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={() => selectedSession && setSidebarTab('clips')}
                            disabled={!selectedSession}
                        >
                            Clips ({segments.length})
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                        {sidebarTab === 'sessions' ? (
                            // SESSIONS LIST
                            sessionsData?.sessions.map((session: SessionInfo) => (
                                <div
                                    key={session.id}
                                    onClick={() => handleSessionSelect(session)}
                                    className={`p-4 rounded-xl cursor-pointer transition-all border group relative overflow-hidden ${selectedSession?.id === session.id
                                        ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_15px_rgba(37,99,235,0.2)]'
                                        : 'bg-gray-800/40 border-gray-700/50 hover:bg-gray-800'
                                        }`}
                                >
                                    {selectedSession?.id === session.id && <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent pointer-events-none" />}
                                    <div className="flex justify-between items-start mb-2 relative z-10">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${session.status === 'running' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-700 text-gray-400 border border-gray-600'}`}>
                                            {session.status}
                                        </span>
                                        <span className="text-[10px] text-gray-500 font-mono">#{session.id}</span>
                                    </div>
                                    <div className="font-semibold text-sm truncate text-gray-200 mb-1 group-hover:text-white transition-colors relative z-10">
                                        {session.name ? session.name : session.model_name.split('/').pop()}
                                    </div>
                                    <div className="text-xs text-gray-500 flex items-center gap-1.5 relative z-10">
                                        <Clock className="w-3.5 h-3.5" />
                                        {new Date(session.created_at).toLocaleTimeString()}
                                    </div>
                                </div>
                            ))
                        ) : (
                            // CLIPS LIST
                            <div className="space-y-3">
                                <div className="px-1 flex justify-between items-center text-xs font-bold text-gray-500 uppercase tracking-widest">
                                    <span>Recordings</span>
                                    <span className="bg-gray-800 px-2 py-0.5 rounded text-gray-400">{selectedSession?.fps_target} FPS</span>
                                </div>
                                <div className="space-y-2">
                                    {(() => {
                                        const seen = new Set();
                                        const uniqueSegments = segments?.filter(s => {
                                            const key = new Date(s.start_time).getTime();
                                            if (seen.has(key)) return false;
                                            seen.add(key);
                                            return true;
                                        }) || [];

                                        return uniqueSegments.length > 0 ? (
                                            uniqueSegments.map((segment) => {
                                                const isActive = activeSegment?.id === segment.id;
                                                const startTime = new Date(segment.start_time);
                                                const duration = segment.duration_seconds
                                                    ? `${Math.round(segment.duration_seconds)}s`
                                                    : "Recording...";

                                                return (
                                                    <button
                                                        key={segment.id}
                                                        onClick={() => handleSegmentSelect(segment)}
                                                        className={`
                                                    w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 group relative overflow-hidden
                                                    ${isActive
                                                                ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-500/30'
                                                                : 'bg-gray-800/40 border-gray-700/50 hover:bg-gray-800 hover:border-gray-600'
                                                            }
                                                `}
                                                    >
                                                        {isActive && <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent pointer-events-none" />}
                                                        <div className={`
                                                    p-2.5 rounded-lg shrink-0 transition-colors
                                                    ${isActive ? 'bg-white/20 text-white' : 'bg-gray-700/50 text-gray-500 group-hover:text-gray-300'}
                                                `}>
                                                            <Film size={18} />
                                                        </div>
                                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                            <div className={`text-sm font-semibold truncate transition-colors ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                                                                {startTime.toLocaleTimeString()}
                                                            </div>
                                                            <div className={`text-xs truncate font-mono ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>
                                                                {duration} • {startTime.toLocaleDateString()}
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <div className="text-center py-10 flex flex-col items-center justify-center text-gray-500 border-2 border-dashed border-gray-800 rounded-xl bg-gray-900/50">
                                                <Film className="w-8 h-8 opacity-20 mb-2" />
                                                <p>No clips found</p>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Canvas-based Live View Component
const LiveView = ({ sessionId, detectionFilter, settings }: { sessionId: number, detectionFilter: any, settings: OverlaySettings }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const latestDataRef = useRef<any>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const detectionFilterRef = useRef(detectionFilter);
    const settingsRef = useRef(settings);

    useEffect(() => {
        detectionFilterRef.current = detectionFilter;
        settingsRef.current = settings;
        if (latestDataRef.current) {
            draw();
        }
    }, [detectionFilter, settings]);

    const draw = () => {
        const canvas = canvasRef.current;
        const data = latestDataRef.current;
        const img = imgRef.current;
        const currentToggles = detectionFilterRef.current;
        const currentSettings = settingsRef.current;

        if (canvas && data && img) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                canvas.width = canvas.parentElement?.clientWidth || 640;
                canvas.height = canvas.parentElement?.clientHeight || 360;

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const hRatio = canvas.width / img.width;
                const vRatio = canvas.height / img.height;
                const ratio = Math.min(hRatio, vRatio);
                const centerShift_x = (canvas.width - img.width * ratio) / 2;
                const centerShift_y = (canvas.height - img.height * ratio) / 2;

                ctx.drawImage(img, 0, 0, img.width, img.height,
                    centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);

                if (data.detections) {
                    drawDetections(
                        ctx,
                        canvas,
                        data.detections,
                        { width: img.width, height: img.height },
                        currentToggles
                    );
                }
            }
        }
    };

    useEffect(() => {
        const connect = () => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.hostname}:8000/ws/live/${sessionId}`;
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'frame' && data.frame) {
                        latestDataRef.current = data;
                        const img = new Image();
                        img.onload = () => {
                            imgRef.current = img;
                            draw();
                        };
                        img.src = `data:image/jpeg;base64,${data.frame}`;
                    }
                } catch (e) { console.error(e); }
            };

            ws.onclose = () => {
                retryTimeoutRef.current = setTimeout(connect, 3000);
            };
        };

        connect();
        return () => {
            if (wsRef.current) wsRef.current.close();
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        };
    }, [sessionId]);

    if (!latestDataRef.current) {
        return (
            <div className="flex flex-col items-center justify-center text-gray-500 animate-pulse w-full h-full">
                <Monitor className="w-12 h-12 mb-2 opacity-50" />
                <p>Waiting for live stream...</p>
            </div>
        );
    }

    return <canvas ref={canvasRef} className="w-full h-full" />;
};
