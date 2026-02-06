'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, SessionInfo, Detection } from '@/lib/api';
import Sidebar from '@/components/dashboard/Sidebar';
import TimelineScrubber from '@/components/dashboard/TimelineScrubber';
import { Play, Pause, SkipBack, SkipForward, Calendar, Clock } from 'lucide-react';

export default function RecordingsPage() {
    const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
    const [currentTime, setCurrentTime] = useState<Date>(new Date());
    const [isPlaying, setIsPlaying] = useState(false);

    // Fetch all sessions
    const { data: sessionsResponse } = useQuery({
        queryKey: ['sessions'],
        queryFn: () => api.listSessions({ limit: 100 }),
    });
    const sessions = sessionsResponse?.sessions || [];

    // Fetch detections for selected session
    const { data: detections = [] } = useQuery({
        queryKey: ['detections', selectedSessionId],
        queryFn: () => selectedSessionId ? api.getDetections(selectedSessionId, 1000) : Promise.resolve([]),
        enabled: !!selectedSessionId,
    });

    const selectedSession = sessions.find(s => s.id === selectedSessionId);

    // Mock playback (simple timer for now)
    // In real implementation, this would sync with a video player

    // Calculate start/end times based on session or detections
    // For demo, defaulting to last 24 hours if no session
    const endTime = selectedSession?.ended_at ? new Date(selectedSession.ended_at) : new Date();
    const startTime = selectedSession?.created_at
        ? new Date(selectedSession.created_at)
        : new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

    const handleSessionSelect = (sessionId: string) => {
        setSelectedSessionId(Number(sessionId));
        setIsPlaying(false);
    };

    return (
        <div className="flex h-screen bg-gray-950 text-white">
            <Sidebar />

            <main className="flex-1 flex flex-col min-w-0 transition-all duration-300 ml-[var(--sidebar-width,256px)]">
                {/* Header */}
                <header className="px-6 py-4 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Recordings</h1>
                        <p className="text-gray-400 text-sm">Analyze historical detection events</p>
                    </div>

                    <div className="flex items-center gap-4">
                        <select
                            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            onChange={(e) => handleSessionSelect(e.target.value)}
                            value={selectedSessionId || ''}
                        >
                            <option value="">Select Session...</option>
                            {sessions.map(session => (
                                <option key={session.id} value={session.id}>
                                    #{session.id} - {session.name || session.model_name} ({new Date(session.created_at).toLocaleDateString()})
                                </option>
                            ))}
                        </select>
                    </div>
                </header>

                {/* Main Content */}
                <div className="flex-1 flex flex-col p-6 gap-6 overflow-hidden">
                    {/* Video Player Area (Placeholder for now) */}
                    <div className="flex-1 bg-black rounded-2xl border border-gray-800 relative overflow-hidden flex items-center justify-center">
                        {selectedSession ? (
                            <div className="text-center">
                                <p className="text-xl text-gray-500 mb-2">Video Player Placeholder</p>
                                <p className="text-sm text-gray-600">Session #{selectedSession.id}</p>
                                <p className="text-blue-500 font-mono mt-4 text-2xl">
                                    {currentTime.toLocaleTimeString()}
                                </p>
                            </div>
                        ) : (
                            <div className="text-center text-gray-600">
                                <Clock size={48} className="mx-auto mb-4 opacity-50" />
                                <p>Select a session to begin review</p>
                            </div>
                        )}
                    </div>

                    {/* Timeline Controls */}
                    <div className="flex flex-col gap-2 bg-gray-900 p-4 rounded-xl border border-gray-800">
                        {/* Playback Controls */}
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <button className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors">
                                    <SkipBack size={20} />
                                </button>
                                <button
                                    className="p-3 bg-blue-600 hover:bg-blue-500 rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
                                    onClick={() => setIsPlaying(!isPlaying)}
                                >
                                    {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                                </button>
                                <button className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors">
                                    <SkipForward size={20} />
                                </button>
                            </div>

                            <div className="flex items-center gap-4 text-sm font-mono text-gray-400">
                                <span>{currentTime.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Scrubber */}
                        <TimelineScrubber
                            startTime={startTime}
                            endTime={endTime}
                            currentTime={currentTime}
                            events={detections}
                            onSeek={setCurrentTime}
                            height={80}
                            className="rounded-lg border border-gray-700"
                        />
                    </div>
                </div>
            </main>
        </div>
    );
}
