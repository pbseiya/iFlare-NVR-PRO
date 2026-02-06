'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, SessionInfo, Detection } from '@/lib/api';
import TimelineScrubber from '@/components/dashboard/TimelineScrubber';
import { Play, Pause, SkipBack, SkipForward, Clock, Calendar as CalendarIcon, ZoomIn, ZoomOut } from 'lucide-react';

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
    const [selectedCamera, setSelectedCamera] = useState<string>('');
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

    // Fetch all sessions
    const { data: sessionsResponse } = useQuery({
        queryKey: ['sessions'],
        queryFn: () => api.listSessions({ limit: 2000 }),
    });
    const allSessions = sessionsResponse?.sessions || [];

    // Derive unique cameras (sources) by Session Name
    const cameras = useMemo(() => {
        const sources = new Set(allSessions.map(s => s.name || s.source_path).filter(Boolean));
        return Array.from(sources);
    }, [allSessions]);

    // Filter sessions by Camera and Date Range
    const filteredSessions = useMemo(() => {
        if (!selectedCamera) return [];
        const start = new Date(startDate).setHours(0, 0, 0, 0);
        const end = new Date(endDate).setHours(23, 59, 59, 999);

        return allSessions.filter(s => {
            const name = s.name || s.source_path;
            if (name !== selectedCamera) return false;

            const sessionTime = new Date(s.created_at).getTime();
            return sessionTime >= start && sessionTime <= end;
        });
    }, [allSessions, selectedCamera, startDate, endDate]);

    // Fetch detections only for visible time range (simplified: fetch for all filtered sessions)
    const { data: detections = [] } = useQuery({
        queryKey: ['detections', selectedCamera, startDate, endDate],
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

    // Auto-select first camera
    useEffect(() => {
        if (!selectedCamera && cameras.length > 0) {
            setSelectedCamera(cameras[0]);
        }
    }, [cameras, selectedCamera]);

    const handleSpeedChange = (speed: number) => setPlaybackSpeed(speed);

    // Navigation (Jump by 50% of view)
    const navigateTime = (direction: 'back' | 'forward') => {
        const jump = zoomLevel * 0.5;
        const newTime = new Date(currentTime.getTime() + (direction === 'forward' ? jump : -jump));
        setCurrentTime(newTime);
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
                        {/* Camera Selector */}
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-500 mb-1">Source / Camera</span>
                            <select
                                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none min-w-[200px]"
                                onChange={(e) => setSelectedCamera(e.target.value)}
                                value={selectedCamera}
                            >
                                <option value="">Select Camera...</option>
                                {cameras.map(cam => (
                                    <option key={cam} value={cam}>{cam}</option>
                                ))}
                            </select>
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
                    {/* Video Player Area */}
                    <div className="flex-1 bg-black rounded-2xl border border-gray-800 relative overflow-hidden flex items-center justify-center">
                        {selectedCamera ? (
                            <div className="text-center">
                                <p className="text-xl text-gray-500 mb-2">Video Player Placeholder</p>
                                <div className="inline-block bg-gray-800 rounded px-4 py-2 mt-2">
                                    <p className="text-sm text-gray-300 font-mono">{selectedCamera}</p>
                                    <p className="text-xs text-gray-500">
                                        {filteredSessions.length} segments in range
                                    </p>
                                    <p className="text-xs text-gray-600 mt-1">
                                        Overlays: {[showBBox && 'Box', showLabels && 'Label', showConfidence && 'Conf'].filter(Boolean).join(', ') || 'None'}
                                    </p>
                                </div>
                                <p className="text-blue-500 font-mono mt-8 text-4xl">
                                    {currentTime.toLocaleTimeString([], { hour12: false })}
                                </p>
                                {isPlaying && (
                                    <p className="text-green-500 text-sm mt-2 animate-pulse">
                                        PLAYING ({playbackSpeed}x)
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="text-center text-gray-600">
                                <Clock size={48} className="mx-auto mb-4 opacity-50" />
                                <p>Select a camera to view recordings</p>
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
