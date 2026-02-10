'use client';

import { SessionInfo } from '@/lib/api';
import { Clock, Activity, Video, TrendingUp } from 'lucide-react';
import Link from 'next/link';

interface SessionCardProps {
    session: SessionInfo;
}

export default function SessionCard({ session }: SessionCardProps) {
    const isRunning = session.status === 'running';

    return (
        <Link href={`/nvr?session_id=${session.id}`}>
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-blue-500 transition-all cursor-pointer group">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors truncate" title={session.name || session.model_name.split('/').pop()}>
                            {session.name || session.model_name.split('/').pop()}
                        </h3>
                        <p className="text-sm text-gray-500">Session #{session.id}</p>
                    </div>
                    <div className={`
                        flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium
                        ${isRunning
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-gray-700 text-gray-400 border border-gray-600'
                        }
                    `}>
                        {isRunning && <span className="inline-block w-2 h-2 bg-green-400 rounded-full mr-1 animate-pulse" />}
                        {session.status}
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-400" />
                        <div>
                            <p className="text-xs text-gray-500">Detections</p>
                            <p className="text-sm font-semibold text-white">
                                {session.total_detections?.toLocaleString() || '0'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Video className="w-4 h-4 text-purple-400" />
                        <div>
                            <p className="text-xs text-gray-500">Frames</p>
                            <p className="text-sm font-semibold text-white">
                                {session.total_frames?.toLocaleString() || '0'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-400" />
                        <div>
                            <p className="text-xs text-gray-500">Avg Conf</p>
                            <p className="text-sm font-semibold text-white">
                                {session.avg_confidence ? `${(session.avg_confidence * 100).toFixed(1)}%` : 'N/A'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-yellow-400" />
                        <div>
                            <p className="text-xs text-gray-500">FPS Target</p>
                            <p className="text-sm font-semibold text-white">{session.fps_target}</p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="pt-4 border-t border-gray-800">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">
                            {new Date(session.created_at).toLocaleDateString()} {new Date(session.created_at).toLocaleTimeString()}
                        </span>
                        <span className="text-blue-400 group-hover:text-blue-300 font-medium">
                            View Details →
                        </span>
                    </div>
                </div>
            </div>
        </Link>
    );
}
