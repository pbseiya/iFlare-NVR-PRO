'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { api, SessionInfo, Detection } from '@/lib/api';
import TimelineScrubber from '@/components/dashboard/TimelineScrubber';
import { useDetectionFilter } from '@/hooks/useDetectionFilter';
import { DetectionToggles } from '@/components/shared/DetectionToggles';
import SynchronizedPlayer from '@/components/dashboard/SynchronizedPlayer';
import { Play, Pause, SkipBack, SkipForward, Clock, Calendar as CalendarIcon, ZoomIn, ZoomOut, ChevronDown, Check } from 'lucide-react';

const ZOOM_SCALES = [
    { label: '5m', ms: 300000 },
    { label: '15m', ms: 900000 },
    { label: '1H', ms: 3600000 },
    { label: '4H', ms: 14400000 },
    { label: '12H', ms: 43200000 },
    { label: '1D', ms: 86400000 },
    { label: '7D', ms: 604800000 },
    { label: '1M', ms: 2592000000 },
    { label: '3M', ms: 7776000000 },
    { label: '6M', ms: 15552000000 },
];

export default function RecordingsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Initialize state from URL or defaults
    const today = new Date().toISOString().split('T')[0];
    const urlStart = searchParams.get('start');
    const urlEnd = searchParams.get('end');
    const urlCams = searchParams.get('cams');

    const [startDate, setStartDate] = useState<string>(urlStart || today);
    const [endDate, setEndDate] = useState<string>(urlEnd || today);
    const [selectedCameras, setSelectedCameras] = useState<string[]>(urlCams ? urlCams.split(',') : []);

    // Update URL when state changes
    const updateUrl = useCallback((start: string, end: string, cams: string[]) => {
        const currentStart = searchParams.get('start');
        const currentEnd = searchParams.get('end');
        const currentCams = searchParams.get('cams');
        const newCamsStr = cams.length > 0 ? cams.join(',') : null;

        if (currentStart === start && currentEnd === end && currentCams === newCamsStr) {
            return; // No change needed
        }

        const params = new URLSearchParams(searchParams);
        params.set('start', start);
        params.set('end', end);
        if (cams.length > 0) params.set('cams', cams.join(','));
        else params.delete('cams');

        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, [pathname, router, searchParams]);

    useEffect(() => {
        updateUrl(startDate, endDate, selectedCameras);
    }, [startDate, endDate, selectedCameras, updateUrl]);

    // Controls State
    const [isCamDropdownOpen, setIsCamDropdownOpen] = useState(false);
    const camDropdownRef = useRef<HTMLDivElement>(null);

    // Overlay State - Standardized Hook
    const detectionFilter = useDetectionFilter();

    // Playback State
    const [currentTime, setCurrentTime] = useState<Date>(new Date());
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
    const [zoomLevel, setZoomLevel] = useState<number>(3600000); // Default 1 Hour

    // Click outside to close dropdown
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (camDropdownRef.current && !camDropdownRef.current.contains(event.target as Node)) {
                setIsCamDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Fetch all sessions (increase limit to get a good history)
    const { data: sessionsResponse } = useQuery({
        queryKey: ['sessions'],
        queryFn: () => api.listSessions({ limit: 1000 }),
    });
    const allSessions = sessionsResponse?.sessions || [];

    // Derive unique cameras (sources) by Session Name
    const cameras = useMemo(() => {
        const sources = new Set(allSessions.map(s => s.name || s.source_path).filter(Boolean));
        return Array.from(sources);
    }, [allSessions]);

    // Filter sessions by Camera and Date Range
    const filteredSessions = useMemo(() => {
        if (selectedCameras.length === 0) return [];
        const start = new Date(startDate).setHours(0, 0, 0, 0);
        const end = new Date(endDate).setHours(23, 59, 59, 999);

        return allSessions.filter(s => {
            const name = s.name || s.source_path;
            if (!selectedCameras.includes(name)) return false;

            const sessionStart = new Date(s.created_at).getTime();
            // If running, assume it extends to "now" (or at least the end of the query window)
            const sessionEnd = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();

            // Check for overlap: Session starts before window ends AND ends after window starts
            return sessionStart <= end && sessionEnd >= start;
        });
    }, [allSessions, selectedCameras, startDate, endDate]);

    // Timeline View Window (calculated from currentTime and zoomLevel)
    const { viewStart, viewEnd } = useMemo(() => {
        // Center the view on currentTime
        const halfZoom = zoomLevel / 2;
        const currentMs = currentTime.getTime();

        return {
            viewStart: new Date(currentMs - halfZoom),
            viewEnd: new Date(currentMs + halfZoom)
        };
    }, [currentTime, zoomLevel]);

    // Sync Date Range with Current Time to ensure we have data
    useEffect(() => {
        const currentStr = currentTime.toISOString().split('T')[0];

        // Only auto-expand if we are playing and move out of range
        if (isPlaying) {
            if (currentStr < startDate) {
                setStartDate(currentStr);
            } else if (currentStr > endDate) {
                setEndDate(currentStr);
            }
        }
    }, [currentTime, startDate, endDate, isPlaying]);

    // URL State Verification
    useEffect(() => {
        // Simple URL param check to restore state if needed (Implementation stub for future)
        // For now, we rely on the manual selectors which the user requested to persist.
        // A full URL sync would require `useSearchParams` and `useRouter` from next/navigation.
    }, []);

    // Fetch detections only for visible time range (simplified: fetch for all filtered sessions)
    // Fetch detections based on selected Date Range (startDate, endDate)
    const { data: detections = [] } = useQuery({
        queryKey: ['detections', selectedCameras, startDate, endDate],
        queryFn: async () => {
            if (filteredSessions.length === 0) return [];

            // Limit to first 10 sessions to avoid overload if selecting many cameras/days
            const recentSessions = filteredSessions.slice(0, 10);

            // Use Local Time strings for fetching to match DB (which stores Local Time)
            const startDay = new Date(startDate);
            const endDay = new Date(endDate);

            // Construct Local ISO string: YYYY-MM-DDTHH:mm:ss
            // We want to cover the full selected range PLUS a buffer for overnight events.
            // Many sessions might run past midnight (e.g. 10 PM to 2 AM).
            // If user selects "Feb 8", they expect to see the night shift of Feb 8, which extends into Feb 9 am.
            const toLocalISO = (date: Date, timeStr: string) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}T${timeStr}`;
            };

            const fetchStart = toLocalISO(startDay, '00:00:00');

            // Extend fetchEnd by 1 day to handle overnight sessions
            const bufferedEndDay = new Date(endDay);
            bufferedEndDay.setDate(bufferedEndDay.getDate() + 1);
            const fetchEnd = toLocalISO(bufferedEndDay, '23:59:59.999');

            // Fetch with high limit to cover the full range (Max 100k per backend constraint)
            const promises = recentSessions.map(s => api.getDetections(s.id, 100000, fetchStart, fetchEnd));
            const results = await Promise.all(promises);
            const flatResults = results.flat();
            console.log(`[Recordings] Fetched ${flatResults.length} detections for range ${fetchStart} - ${fetchEnd}`);
            if (flatResults.length > 0) {
                console.log('[Recordings] First Detection:', flatResults[0]);
                console.log('[Recordings] Last Detection:', flatResults[flatResults.length - 1]);
            }
            return flatResults;
        },
        enabled: filteredSessions.length > 0,
        refetchOnWindowFocus: false,
        staleTime: 10000, // Reduced from 60s to 10s for faster updates
        refetchInterval: 10000, // Auto-refresh every 10s
    });

    // Fetch video segments for visible sessions
    const { data: segmentsBySession = {} } = useQuery({
        queryKey: ['segments', filteredSessions.map(s => s.id)],
        queryFn: async () => {
            const map: Record<number, any[]> = {};
            // Limit to recent/visible sessions similar to detections to avoid overload
            const recentSessions = filteredSessions.slice(0, 20);

            const promises = recentSessions.map(async (s) => {
                try {
                    // console.log(`[Recordings] Fetching segments for session ${s.id}...`);
                    const segs = await api.getSessionSegments(s.id);
                    // console.log(`[Recordings] Fetched ${segs.length} segments for session ${s.id}`);
                    map[s.id] = segs;
                } catch (e) {
                    console.error(`Failed to fetch segments for session ${s.id}`, e);
                }
            });

            await Promise.all(promises);
            // console.log('[Recordings] Segments Map keys:', Object.keys(map));
            return map;
        },
        enabled: filteredSessions.length > 0,
        refetchOnWindowFocus: false,
        staleTime: 5000, // Reduced stale time
        refetchInterval: 5000, // Auto-refresh every 5s for segments (faster than detections)
    });

    // Auto-select first camera if none selected
    useEffect(() => {
        if (selectedCameras.length === 0 && cameras.length > 0) {
            setSelectedCameras([cameras[0]]);
        }
    }, [cameras, selectedCameras.length]);

    // Playback Loop
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPlaying) {
            interval = setInterval(() => {
                setCurrentTime(prev => {
                    // Increment time by 100ms * playbackSpeed
                    // Real-time updates: if we update every 100ms, we add 100ms * speed
                    const delta = 100 * playbackSpeed;
                    return new Date(prev.getTime() + delta);
                });
            }, 100);
        }
        return () => clearInterval(interval);
    }, [isPlaying, playbackSpeed]);

    const handleSpeedChange = (speed: number) => setPlaybackSpeed(speed);

    // Navigation (Jump by 50% of view)
    const navigateTime = (direction: 'back' | 'forward') => {
        const jump = zoomLevel * 0.5;
        const newTime = new Date(currentTime.getTime() + (direction === 'forward' ? jump : -jump));
        setCurrentTime(newTime);
    };

    const toggleCamera = (cam: string) => {
        setSelectedCameras(prev =>
            prev.includes(cam) ? prev.filter(c => c !== cam) : [...prev, cam]
        );
    };

    return (
        <div className="flex h-screen bg-gray-950 text-white">
            <main className="flex-1 flex flex-col min-w-0 transition-all duration-300">
                {/* Header */}
                <header className="px-6 py-4 bg-gray-900 border-b border-gray-800 flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold">Recordings</h1>
                        <p className="text-gray-400 text-sm">Long-term timeline analysis</p>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap justify-end">
                        {/* Camera Selector (Multi-Select) */}
                        <div className="flex flex-col relative" ref={camDropdownRef}>
                            <span className="text-xs text-gray-500 mb-1">Sources / Cameras</span>
                            <button
                                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none min-w-[200px] flex items-center justify-between"
                                onClick={() => setIsCamDropdownOpen(!isCamDropdownOpen)}
                            >
                                <span className="truncate max-w-[180px]">
                                    {selectedCameras.length === 0 ? 'Select Cameras...' :
                                        selectedCameras.length === 1 ? selectedCameras[0] :
                                            `${selectedCameras.length} Cameras Selected`}
                                </span>
                                <ChevronDown size={14} className="text-gray-400" />
                            </button>

                            {isCamDropdownOpen && (
                                <div className="absolute top-full left-0 mt-1 w-full min-w-[220px] bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto p-1">
                                    {cameras.map(cam => {
                                        const isSelected = selectedCameras.includes(cam);
                                        return (
                                            <div
                                                key={cam}
                                                className={`
                                                    flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-sm
                                                    ${isSelected ? 'bg-blue-600/20 text-blue-200' : 'text-gray-300 hover:bg-gray-700'}
                                                `}
                                                onClick={() => toggleCamera(cam)}
                                            >
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-500'}`}>
                                                    {isSelected && <Check size={10} className="text-white" />}
                                                </div>
                                                <span className="truncate">{cam}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Date Range Selector */}
                        <div className="flex items-center gap-2">
                            <div className="flex flex-col">
                                <span className="text-xs text-gray-500 mb-1">From</span>
                                <input
                                    type="date"
                                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </div>
                            <span className="mt-5 text-gray-500">-</span>
                            <div className="flex flex-col">
                                <span className="text-xs text-gray-500 mb-1">To</span>
                                <input
                                    type="date"
                                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Overlay Controls */}
                        <div className="flex flex-col ml-2">
                            <span className="text-xs text-gray-500 mb-1">Overlays</span>
                            <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700 h-[38px] items-center gap-3 px-3">
                                <DetectionToggles
                                    filterState={detectionFilter}
                                    actions={detectionFilter}
                                    className="border-0 p-0"
                                />
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <div className="flex-1 flex flex-col p-6 gap-6 overflow-hidden">
                    {/* Video Player Grid */}
                    <div className="flex-1 bg-black rounded-2xl border border-gray-800 relative overflow-hidden">
                        {selectedCameras.length > 0 ? (
                            <div className={`grid h-full gap-1 ${selectedCameras.length === 1 ? 'grid-cols-1' :
                                selectedCameras.length <= 2 ? 'grid-cols-2' :
                                    selectedCameras.length <= 4 ? 'grid-cols-2 grid-rows-2' :
                                        'grid-cols-3 grid-rows-3'
                                }`}>
                                {selectedCameras.map(cam => {
                                    // Filter sessions for this specific camera
                                    const cameraSessions = allSessions.filter(s => {
                                        const name = s.name || s.source_path;
                                        // Just filter by name. Time filtering happens inside player (or we pass all and let player pick)
                                        // Actually, player needs the full list to find the right one for ANY time.
                                        return name === cam;
                                    });

                                    return (
                                        <div key={cam} className="relative bg-black border border-gray-900 overflow-hidden group">
                                            {/* Player Component */}
                                            <SynchronizedPlayer
                                                cameraName={cam}
                                                sessions={cameraSessions}
                                                currentTime={currentTime}
                                                isPlaying={isPlaying}
                                                playbackSpeed={playbackSpeed}
                                                detections={detections}
                                                showBBox={detectionFilter.showBoxes}
                                                showLabels={detectionFilter.showLabels}
                                                showConfidence={detectionFilter.showConfidence}
                                                isMaster={false}
                                                segmentsMap={segmentsBySession}
                                            />

                                            {/* Camera Name Label */}
                                            <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-xs font-mono text-gray-200 z-10 pointer-events-none">
                                                {cam}
                                            </div>

                                            {/* Overlay Info */}
                                            <div className="absolute bottom-2 left-2 text-[10px] text-gray-400 font-mono text-left bg-black/40 px-1 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                                IDs: {detectionFilter.showBoxes ? 'ON' : 'OFF'} | Labels: {detectionFilter.showLabels ? 'ON' : 'OFF'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex h-full items-center justify-center text-center text-gray-600">
                                <div>
                                    <Clock size={48} className="mx-auto mb-4 opacity-50" />
                                    <p>Select a camera to view recordings</p>
                                </div>
                            </div>
                        )}

                        {/* Global Status Overlay */}
                        {isPlaying && (
                            <div className="absolute top-4 right-4 bg-green-900/80 text-green-200 px-3 py-1 rounded-full text-xs font-bold animate-pulse z-50">
                                LIVE SYNC {playbackSpeed}x
                            </div>
                        )}
                    </div>

                    {/* Timeline Controls */}
                    <div className="flex flex-col gap-4 bg-gray-900 p-4 rounded-xl border border-gray-800">
                        {/* Control Row */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button
                                    className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
                                    onClick={() => navigateTime('back')}
                                >
                                    <SkipBack size={20} />
                                </button>
                                <button
                                    className="p-3 bg-blue-600 hover:bg-blue-500 rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center justify-center w-12 h-12"
                                    onClick={() => setIsPlaying(!isPlaying)}
                                >
                                    {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                                </button>
                                <button
                                    className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
                                    onClick={() => navigateTime('forward')}
                                >
                                    <SkipForward size={20} />
                                </button>
                            </div>

                            {/* Speed Controls */}
                            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
                                {[1, 2, 4, 8, 16, 32, 64].map(speed => (
                                    <button
                                        key={speed}
                                        onClick={() => handleSpeedChange(speed)}
                                        className={`
                                            px-3 py-1.5 rounded text-xs font-bold transition-colors
                                            ${playbackSpeed === speed
                                                ? 'bg-blue-600 text-white shadow'
                                                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                                            }
                                        `}
                                    >
                                        {speed}x
                                    </button>
                                ))}
                            </div>

                            {/* Zoom Scale Controls */}
                            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
                                {ZOOM_SCALES.map(scale => (
                                    <button
                                        key={scale.label}
                                        onClick={() => setZoomLevel(scale.ms)}
                                        className={`
                                            px-3 py-1.5 rounded text-xs font-bold transition-colors
                                            ${zoomLevel === scale.ms
                                                ? 'bg-blue-600 text-white shadow'
                                                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                                            }
                                        `}
                                    >
                                        {scale.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Scrubber */}
                        <div className="relative">
                            <TimelineScrubber
                                startTime={viewStart}
                                endTime={viewEnd}
                                currentTime={currentTime}
                                events={detections}
                                sessions={filteredSessions}
                                segmentsBySessionId={segmentsBySession}
                                selectedCameras={selectedCameras}
                                onSeek={setCurrentTime}
                                height={60 + (selectedCameras.length > 1 ? selectedCameras.length * 20 : 0)} // Dynamic height? Adjusting container height might be needed.
                                className="rounded-lg border border-gray-700"
                            />
                            {/* Time Axis Context */}
                            <div className="flex justify-between text-xs text-gray-500 mt-1 font-mono">
                                <span>{viewStart.toLocaleString()}</span>
                                <span className="text-white font-bold">{currentTime.toLocaleTimeString()}</span>
                                <span>{viewEnd.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
