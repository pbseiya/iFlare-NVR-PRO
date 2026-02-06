'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, SessionInfo, Detection } from '@/lib/api';
import TimelineScrubber from '@/components/dashboard/TimelineScrubber';
import { Play, Pause, SkipBack, SkipForward, Clock, Calendar as CalendarIcon, ZoomIn, ZoomOut, ChevronDown, Check } from 'lucide-react';

const ZOOM_SCALES = [
    { label: '1H', ms: 3600000 },
    { label: '4H', ms: 14400000 },
    { label: '12H', ms: 43200000 },
    { label: '1D', ms: 86400000 },
    { label: '7D', ms: 604800000 },
    { label: '1M', ms: 2592000000 },
];

export default function RecordingsPage() {
    const today = new Date().toISOString().split('T')[0];

    // Controls State
    const [selectedCameras, setSelectedCameras] = useState<string[]>([]);
    const [isCamDropdownOpen, setIsCamDropdownOpen] = useState(false);
    const camDropdownRef = useRef<HTMLDivElement>(null);

    const [startDate, setStartDate] = useState<string>(today);
    const [endDate, setEndDate] = useState<string>(today);

    // Overlay State
    const [showBBox, setShowBBox] = useState(true);
    const [showLabels, setShowLabels] = useState(true);
    const [showConfidence, setShowConfidence] = useState(true);

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

            const sessionTime = new Date(s.created_at).getTime();
            return sessionTime >= start && sessionTime <= end;
        });
    }, [allSessions, selectedCameras, startDate, endDate]);

    // Fetch detections only for visible time range (simplified: fetch for all filtered sessions)
    const { data: detections = [] } = useQuery({
        queryKey: ['detections', selectedCameras, startDate, endDate],
        queryFn: async () => {
            if (filteredSessions.length === 0) return [];
            // Optimize: Limit concurrent fetches or only fetch for sessions near currentTime
            // For now, fetching first 20 sessions to avoid overload
            const recentSessions = filteredSessions.slice(0, 20);
            const promises = recentSessions.map(s => api.getDetections(s.id, 500));
            const results = await Promise.all(promises);
            return results.flat();
        },
        enabled: filteredSessions.length > 0,
    });

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

    // Auto-select first camera if none selected
    useEffect(() => {
        if (selectedCameras.length === 0 && cameras.length > 0) {
            setSelectedCameras([cameras[0]]);
        }
    }, [cameras, selectedCameras.length]);

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
                                {[
                                    { id: 'bbox', label: 'Box', state: showBBox, setter: setShowBBox },
                                    { id: 'class', label: 'Label', state: showLabels, setter: setShowLabels },
                                    { id: 'conf', label: 'Conf', state: showConfidence, setter: setShowConfidence },
                                ].map(opt => (
                                    <label key={opt.id} className="flex items-center gap-1.5 cursor-pointer text-sm select-none">
                                        <div className={`
                                            w-4 h-4 rounded border flex items-center justify-center transition-colors
                                            ${opt.state ? 'bg-blue-600 border-blue-600' : 'border-gray-500 hover:border-gray-400'}
                                        `}>
                                            {opt.state && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={opt.state}
                                            onChange={(e) => opt.setter(e.target.checked)}
                                        />
                                        <span className={opt.state ? 'text-gray-200' : 'text-gray-400'}>{opt.label}</span>
                                    </label>
                                ))}
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
                                {selectedCameras.map(cam => (
                                    <div key={cam} className="relative bg-gray-900 border border-gray-900 flex items-center justify-center overflow-hidden">
                                        <div className="absolute top-2 left-2 bg-black/50 px-2 py-1 rounded text-xs font-mono text-gray-200 z-10">
                                            {cam}
                                        </div>

                                        {/* Mock Video Content */}
                                        <div className="text-center opacity-50">
                                            <p className="text-4xl font-bold text-gray-800 mb-2">{cam}</p>
                                            <p className="text-sm text-gray-600">
                                                {currentTime.toLocaleTimeString()}
                                            </p>
                                        </div>

                                        {/* Overlay Info (Mock) */}
                                        <div className="absolute bottom-2 left-2 text-[10px] text-gray-500 font-mono text-left">
                                            IDs: {showBBox ? 'ON' : 'OFF'} | Labels: {showLabels ? 'ON' : 'OFF'}
                                        </div>
                                    </div>
                                ))}
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
                                {[1, 2, 4, 8, 16].map(speed => (
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
                                onSeek={setCurrentTime}
                                height={60}
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
