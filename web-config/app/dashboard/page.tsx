'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Sidebar from '@/components/dashboard/Sidebar';
import SessionCardSimple from '@/components/dashboard/SessionCardSimple';
import { LayoutGrid, Activity } from 'lucide-react';

export default function DashboardPage() {
    const queryClient = useQueryClient();
    const [selectedView, setSelectedView] = useState<'overview' | 'cameras'>('overview');

    // Fetch sessions
    const { data: sessionsData, isLoading } = useQuery({
        queryKey: ['sessions'],
        queryFn: () => api.listSessions({ limit: 100 }),
        refetchInterval: 5000,
    });

    // Stop session mutation
    const stopSessionMutation = useMutation({
        mutationFn: (sessionId: number) => api.stopSession(sessionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
        },
    });

    // Resume session mutation
    const resumeSessionMutation = useMutation({
        mutationFn: (sessionId: number) => api.resumeSession(sessionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
        },
    });

    const sessions = sessionsData?.sessions || [];
    const runningSessions = sessions.filter(s => s.status === 'running');
    const completedSessions = sessions.filter(s => s.status === 'completed');

    return (
        <div className="min-h-screen bg-gray-950 text-white flex">
            {/* Sidebar */}
            <Sidebar selectedView={selectedView} onViewChange={setSelectedView} />

            {/* Main Content */}
            <div className="flex-1 p-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">NVR Dashboard</h1>
                    <p className="text-gray-400">Professional Monitoring System</p>
                </div>

                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-400 text-sm">Active Sessions</span>
                            <Activity className="w-5 h-5 text-green-500" />
                        </div>
                        <div className="text-3xl font-bold text-green-500">{runningSessions.length}</div>
                    </div>

                    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-400 text-sm">Total Sessions</span>
                            <LayoutGrid className="w-5 h-5 text-blue-500" />
                        </div>
                        <div className="text-3xl font-bold text-blue-500">{sessions.length}</div>
                    </div>

                    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-400 text-sm">Completed</span>
                            <LayoutGrid className="w-5 h-5 text-gray-500" />
                        </div>
                        <div className="text-3xl font-bold text-gray-400">{completedSessions.length}</div>
                    </div>
                </div>

                {/* Sessions Grid */}
                <div className="mb-6">
                    <h2 className="text-xl font-semibold mb-4">Active Sessions</h2>
                    {isLoading ? (
                        <div className="text-gray-500">Loading...</div>
                    ) : runningSessions.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {runningSessions.map(session => (
                                <SessionCardSimple
                                    key={session.id}
                                    session={session}
                                    onStop={(id) => stopSessionMutation.mutate(id)}
                                    onResume={(id) => resumeSessionMutation.mutate(id)}
                                    isStopping={stopSessionMutation.isPending}
                                    isResuming={resumeSessionMutation.isPending}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 text-center text-gray-500">
                            No active sessions
                        </div>
                    )}
                </div>

                {/* Recent Sessions */}
                <div>
                    <h2 className="text-xl font-semibold mb-4">Recent Sessions</h2>
                    {completedSessions.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {completedSessions.slice(0, 6).map(session => (
                                <SessionCardSimple
                                    key={session.id}
                                    session={session}
                                    onStop={(id) => stopSessionMutation.mutate(id)}
                                    onResume={(id) => resumeSessionMutation.mutate(id)}
                                    isStopping={stopSessionMutation.isPending}
                                    isResuming={resumeSessionMutation.isPending}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 text-center text-gray-500">
                            No recent sessions
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

