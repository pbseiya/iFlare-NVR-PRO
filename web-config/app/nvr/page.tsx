'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, SessionInfo, Detection, SessionConfig } from '@/lib/api';
import { Play, Pause, FastForward, Rewind, Maximize, AlertTriangle, Monitor, Calendar, Clock, ChevronRight, Video, Tv, ArrowLeft, Film, Radio } from 'lucide-react';

export default function NVRPage() {
    const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [editSession, setEditSession] = useState<SessionInfo | null>(null);
    const queryClient = useQueryClient();

    // Playback State
    const [activeSegment, setActiveSegment] = useState<any | null>(null); // Specific clip
    const [isLiveMode, setIsLiveMode] = useState(true); // Preference for Live vs Playback

    // Visibility Toggles
    const [showBoxes, setShowBoxes] = useState(true);
    const [showLabels, setShowLabels] = useState(true);
    const [showConfidence, setShowConfidence] = useState(true);

    // Sidebar Tab
    const [sidebarTab, setSidebarTab] = useState<'sessions' | 'clips'>('sessions');

    // Fetch sessions
    const { data: sessionsData, isLoading: isLoadingSessions } = useQuery({
        queryKey: ['sessions'],
        queryFn: () => api.listSessions({ limit: 100 }),
        refetchInterval: 5000,
    });

    // Get selected session
    const selectedSession = useMemo(() => {
        if (!sessionsData || !selectedSessionId) return null;
        return sessionsData.sessions.find(s => s.id === selectedSessionId) || null;
    }, [sessionsData, selectedSessionId]);

    // Fetch detections for selected session
    const { data: detections = [] } = useQuery({
        queryKey: ['detections', selectedSessionId],
        queryFn: () => selectedSessionId ? api.getDetections(selectedSessionId) : Promise.resolve([]),
        enabled: !!selectedSessionId,
        refetchInterval: (query) => {
            return selectedSession?.status === 'running' ? 2000 : false;
        }
    });

    // Fetch Segments (Clips)
    const { data: segments = [] } = useQuery({
        queryKey: ['segments', selectedSessionId],
        queryFn: () => selectedSessionId ? api.getSessionSegments(selectedSessionId) : Promise.resolve([]),
        enabled: !!selectedSessionId,
        refetchInterval: 5000,
    });

    // Auto-select first session if none selected
    useEffect(() => {
        if (!selectedSessionId && sessionsData?.sessions && sessionsData.sessions.length > 0) {
            handleSessionSelect(sessionsData.sessions[0]);
        }
    }, [sessionsData, selectedSessionId]);

    // Handle Session Selection
    const handleSessionSelect = (session: SessionInfo) => {
        setSelectedSessionId(session.id);
        setIsPlaying(false);
        setCurrentTime(0);
        setActiveSegment(null);
        // Default to Live if running, else Playback (clips or empty)
        setIsLiveMode(session.status === 'running');
        setSidebarTab('clips'); // Auto-switch to clips view
    };

    // Handle Clip Selection
    const handleClipSelect = (segment: any) => {
        setActiveSegment(segment);
        setIsLiveMode(false); // Force Playback mode
        setIsPlaying(true); // Auto-play
    };

    const handleGoLive = () => {
        setActiveSegment(null);
        setIsLiveMode(true);
    };

    // Video Source Logic
    const videoSrc = useMemo(() => {
        if (activeSegment) {
            return `http://localhost:8000/api/video/stream?path=${encodeURIComponent(activeSegment.file_path)}`;
        }
        // Fallback for Legacy Single-File Recordings
        if (!selectedSession?.source_path) return '';
        if (selectedSession.save_video && selectedSession.video_output_path) {
            return `http://localhost:8000/api/video/stream?path=${encodeURIComponent(selectedSession.video_output_path)}`;
        }
        return '';
    }, [selectedSession, activeSegment]);


    // Video Events
    const handleTimeUpdate = () => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
        }
    };

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const seek = (time: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    // Canvas Render Logic
    useEffect(() => {
        let animationFrameId: number;

        const render = () => {
            if (videoRef.current && canvasRef.current && selectedSession) {
                const video = videoRef.current;
                const canvas = canvasRef.current;
                const ctx = canvas.getContext('2d');

                if (ctx) {
                    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
                        canvas.width = video.clientWidth;
                        canvas.height = video.clientHeight;
                    }

                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    // Logic: find detections for current frame (mapped by timestamp?)
                    // For now, simpler frame mapping if possible, or timestamp matching
                    // Segments have 'start_time'.
                    // Frame matching in segmented files is tricky without absolute timestamps.
                    // Fallback to simple logic: Just draw nothing if complex?
                    // Or improved logic: segment start + video.currentTime = session absolute time.
                    // Detections have 'timestamp'. Match!

                    let referenceTime = 0;
                    if (activeSegment) {
                        referenceTime = new Date(activeSegment.start_time).getTime();
                    } else if (selectedSession.created_at) {
                        referenceTime = new Date(selectedSession.created_at).getTime();
                    }

                    const currentAbsTime = referenceTime + (video.currentTime * 1000);

                    // Find detections within 100ms
                    const activeDetections = detections.filter(d => {
                        const dTime = new Date(d.timestamp).getTime();
                        return Math.abs(dTime - currentAbsTime) < 100; // 100ms window
                    });

                    // Draw
                    if (activeDetections.length > 0) {
                        drawDetections(ctx, canvas, activeDetections, {
                            width: video.videoWidth,
                            height: video.videoHeight
                        }, {
                            showBoxes, showLabels, showConfidence
                        });
                    }
                }
            }
            animationFrameId = requestAnimationFrame(render);
        };

        if (!isLiveMode) {
            render();
        }

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [selectedSession, detections, showBoxes, showLabels, showConfidence, isLiveMode, activeSegment]);

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col">
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
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input type="checkbox" checked={showBoxes} onChange={e => setShowBoxes(e.target.checked)} className="rounded text-blue-500 focus:ring-blue-500 bg-gray-700 border-gray-600" />
                        Show Boxes
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} className="rounded text-blue-500 focus:ring-blue-500 bg-gray-700 border-gray-600" />
                        Show Labels
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input type="checkbox" checked={showConfidence} onChange={e => setShowConfidence(e.target.checked)} className="rounded text-blue-500 focus:ring-blue-500 bg-gray-700 border-gray-600" />
                        Show Confidence
                    </label>
                </div>

                <div className="ml-auto">
                    <a href="/" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors">
                        Back to Config
                    </a>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Main Content (Video Player) */}
                <div className="flex-1 p-6 flex flex-col gap-4 overflow-y-auto bg-gray-950 relative">
                    {selectedSession ? (
                        <div className="flex flex-col gap-4 h-full">
                            {/* Player Container */}
                            <div className="relative bg-black rounded-xl overflow-hidden shadow-2xl w-full h-full flex flex-col flex-1 items-center justify-center border border-gray-800 group">
                                {isLiveMode && selectedSession.status === 'running' ? (
                                    <>
                                        <LiveView
                                            sessionId={selectedSession.id}
                                            toggles={{ showBoxes, showLabels, showConfidence }}
                                        />
                                        <div className="absolute top-4 right-4 bg-red-600 text-white text-xs px-2 py-1 rounded-full animate-pulse flex items-center gap-1 z-10 shadow-lg">
                                            <div className="w-2 h-2 bg-white rounded-full" />
                                            LIVE
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Playback Mode (File) */}
                                        {videoSrc ? (
                                            <>
                                                <video
                                                    ref={videoRef}
                                                    src={videoSrc}
                                                    className="w-full h-full object-contain"
                                                    onTimeUpdate={handleTimeUpdate}
                                                    onLoadedMetadata={handleLoadedMetadata}
                                                    onPlay={() => setIsPlaying(true)}
                                                    onPause={() => setIsPlaying(false)}
                                                    onClick={togglePlay}
                                                    autoPlay
                                                />
                                                <canvas
                                                    ref={canvasRef}
                                                    className="absolute inset-0 w-full h-full pointer-events-none"
                                                />
                                                {/* Start/Pause Overlay */}
                                                {!isPlaying && (
                                                    <div
                                                        className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer group-hover:bg-black/20 transition-colors"
                                                        onClick={togglePlay}
                                                    >
                                                        <div className="p-4 bg-white/10 backdrop-blur-md rounded-full border border-white/20 hover:scale-110 transition-transform">
                                                            <Play className="w-12 h-12 text-white fill-white" />
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Clip Info Overlay */}
                                                {activeSegment && (
                                                    <div className="absolute top-4 left-4 bg-black/70 backdrop-blur text-white text-xs px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                                                        <Film className="w-3 h-3 text-blue-400" />
                                                        Playback: {new Date(activeSegment.start_time).toLocaleTimeString()}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center text-gray-500">
                                                <AlertTriangle className="w-12 h-12 mb-2 text-yellow-500" />
                                                <p>No video source selected.</p>
                                                <p className="text-xs">Select a clip from the sidebar to play.</p>
                                            </div>
                                        )}

                                        {/* Go Live Float Button */}
                                        {selectedSession.status === 'running' && (
                                            <button
                                                onClick={handleGoLive}
                                                className="absolute bottom-4 right-4 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 transition-transform hover:scale-105"
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
                                    <button onClick={togglePlay} disabled={isLiveMode} className={`p-2 rounded-full transition-colors text-white ${isLiveMode ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'}`}>
                                        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                                    </button>
                                    <span className="text-sm font-mono text-gray-300">
                                        {formatTime(currentTime)} / {formatTime(duration)}
                                    </span>
                                    <div className="flex-1 relative h-2 bg-gray-700 rounded-full cursor-pointer group"
                                        onClick={(e) => {
                                            if (isLiveMode) return;
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const pct = (e.clientX - rect.left) / rect.width;
                                            seek(pct * duration);
                                        }}
                                    >
                                        <div
                                            className="absolute top-0 left-0 h-full bg-blue-500 rounded-full group-hover:bg-blue-400 transition-colors"
                                            style={{ width: `${(currentTime / duration) * 100}%` }}
                                        />
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
                <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
                    {/* Sidebar Tabs */}
                    <div className="flex border-b border-gray-700">
                        <button
                            className={`flex-1 p-3 text-sm font-medium ${sidebarTab === 'sessions' ? 'bg-gray-700 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-200'}`}
                            onClick={() => setSidebarTab('sessions')}
                        >
                            Sessions
                        </button>
                        <button
                            className={`flex-1 p-3 text-sm font-medium ${sidebarTab === 'clips' ? 'bg-gray-700 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-200'}
                            ${!selectedSession ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={() => selectedSession && setSidebarTab('clips')}
                            disabled={!selectedSession}
                        >
                            Clips ({segments.length})
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {sidebarTab === 'sessions' ? (
                            // SESSIONS LIST
                            sessionsData?.sessions.map((session: SessionInfo) => (
                                <div
                                    key={session.id}
                                    onClick={() => handleSessionSelect(session)}
                                    className={`p-3 rounded-lg cursor-pointer transition-colors border ${selectedSession?.id === session.id
                                        ? 'bg-blue-600/20 border-blue-500/50'
                                        : 'bg-gray-700/30 border-transparent hover:bg-gray-700'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${session.status === 'running' ? 'bg-green-500/20 text-green-400' : 'text-gray-400 border border-gray-600'}`}>
                                            {session.status}
                                        </span>
                                        <span className="text-xs text-gray-500">#{session.id}</span>
                                    </div>
                                    <div className="font-medium text-sm truncate text-white mb-1">
                                        {session.name ? session.name : session.model_name.split('/').pop()}
                                    </div>
                                    <div className="text-xs text-gray-500 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(session.created_at).toLocaleTimeString()}
                                    </div>
                                </div>
                            ))
                        ) : (
                            // CLIPS LIST
                            <div className="space-y-2">
                                <div className="px-2 py-1 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Recordings ({selectedSession?.fps_target} FPS)
                                </div>
                                {segments.length === 0 ? (
                                    <div className="text-center p-4 text-gray-500 text-xs">
                                        No segments recorded yet.
                                        {selectedSession?.status === 'running' && <div className="mt-1 animate-pulse">Recording in progress...</div>}
                                    </div>
                                ) : (
                                    segments.slice().reverse().map((seg: any) => (
                                        <div
                                            key={seg.id}
                                            onClick={() => handleClipSelect(seg)}
                                            className={`p-2 rounded-md cursor-pointer border flex items-center gap-3 transition-colors ${activeSegment?.id === seg.id
                                                    ? 'bg-blue-600/30 border-blue-500'
                                                    : 'bg-gray-700/30 border-gray-700 hover:bg-gray-700'
                                                }`}
                                        >
                                            <div className="bg-gray-800 p-2 rounded text-blue-400">
                                                <Film className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-gray-200">
                                                    {new Date(seg.start_time).toLocaleTimeString()}
                                                </div>
                                                <div className="text-xs text-gray-500 flex justify-between">
                                                    <span>{seg.duration_seconds ? Math.round(seg.duration_seconds) + 's' : 'Recording...'}</span>
                                                    <span>{new Date(seg.start_time).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Helpers
function drawDetections(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    detections: any[],
    sourceDim: { width: number, height: number },
    options: { showBoxes: boolean, showLabels: boolean, showConfidence: boolean }
) {
    if (!options.showBoxes) return;

    detections.forEach(d => {
        const bbox = d.bbox_x1 !== undefined ? [d.bbox_x1, d.bbox_y1, d.bbox_x2, d.bbox_y2] : d.bbox;
        const className = d.class_name || d.class;
        const conf = d.confidence || d.conf;

        const scaleX = canvas.width / sourceDim.width;
        const scaleY = canvas.height / sourceDim.height;

        if (!isFinite(scaleX) || !isFinite(scaleY)) return;

        const x = bbox[0] * scaleX;
        const y = bbox[1] * scaleY;
        const w = (bbox[2] - bbox[0]) * scaleX;
        const h = (bbox[3] - bbox[1]) * scaleY;

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        if (options.showLabels) {
            ctx.fillStyle = '#ef4444';
            let text = `${className}`;
            if (options.showConfidence) {
                text += ` ${Math.round(conf * 100)}%`;
            }
            ctx.font = 'bold 12px sans-serif';
            const textMetrics = ctx.measureText(text);
            ctx.fillRect(x, y - 20, textMetrics.width + 10, 20);

            ctx.fillStyle = 'white';
            ctx.fillText(text, x + 5, y - 5);
        }
    });
}

const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Canvas-based Live View Component
const LiveView = ({ sessionId, toggles }: { sessionId: number, toggles: any }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const latestDataRef = useRef<any>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const togglesRef = useRef(toggles);

    useEffect(() => {
        togglesRef.current = toggles;
        if (latestDataRef.current) {
            draw();
        }
    }, [toggles]);

    const draw = () => {
        const canvas = canvasRef.current;
        const data = latestDataRef.current;
        const img = imgRef.current;
        const currentToggles = togglesRef.current;

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

                ctx.save();
                ctx.translate(centerShift_x, centerShift_y);
                ctx.scale(ratio, ratio);

                if (currentToggles.showBoxes && data.detections) {
                    data.detections.forEach((d: any) => {
                        const bbox = d.bbox;
                        const className = d.class;
                        const conf = d.conf;

                        const x = bbox[0];
                        const y = bbox[1];
                        const w = bbox[2] - bbox[0];
                        const h = bbox[3] - bbox[1];

                        ctx.strokeStyle = '#ef4444';
                        ctx.lineWidth = 2 / ratio;
                        ctx.strokeRect(x, y, w, h);

                        if (currentToggles.showLabels) {
                            ctx.fillStyle = '#ef4444';
                            let text = `${className}`;
                            if (currentToggles.showConfidence) {
                                text += ` ${Math.round(conf * 100)}%`;
                            }
                            const fontSize = Math.max(12, 12 / ratio);
                            ctx.font = `bold ${fontSize}px sans-serif`;
                            const padding = 5 / ratio;
                            const textMetrics = ctx.measureText(text);
                            const bgHeight = fontSize + padding * 2;
                            ctx.fillRect(x, y - bgHeight, textMetrics.width + padding * 2, bgHeight);

                            ctx.fillStyle = 'white';
                            ctx.fillText(text, x + padding, y - padding);
                        }
                    });
                }
                ctx.restore();
            }
        }
    };

    useEffect(() => {
        const connect = () => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//localhost:8000/ws/live/${sessionId}`;
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
