'use client';

import { SessionInfo } from '@/lib/api';
import { Clock, Activity, Video, TrendingUp, Play, Square, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface SessionCardProps {
    session: SessionInfo;
    onStop?: (id: number) => void;
    onResume?: (id: number) => void;
    onEdit?: (session: SessionInfo) => void;
    onDelete?: (id: number) => void;
    isStopping?: boolean;
    isResuming?: boolean;
    isDeleting?: boolean;
}

/**
 * SessionCard - For Admin users
 * Shows session info with Stop/Resume + Edit/Delete buttons
 */
export default function SessionCard({
    session,
    onStop,
    onResume,
    onEdit,
    onDelete,
    isStopping = false,
    isResuming = false,
    isDeleting = false
}: SessionCardProps) {
    const isRunning = session.status === 'running';

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-slate-200 dark:border-gray-800 hover:border-blue-500 transition-all group">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <Link href={`/nvr?session_id=${session.id}`} className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors cursor-pointer truncate" title={session.name || session.model_name.split('/').pop()}>
                        {session.name || session.model_name.split('/').pop()}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-gray-500">Session #{session.id}</p>
                </Link>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Edit Button */}
                    {onEdit && (
                        <button
                            onClick={() => onEdit(session)}
                            className="p-2 text-slate-400 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors"
                            title="Edit Session"
                        >
                            <Edit size={16} />
                        </button>
                    )}
                    {/* Delete Button */}
                    {onDelete && (
                        <button
                            onClick={() => onDelete(session.id)}
                            disabled={isDeleting}
                            className="p-2 text-slate-400 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                            title="Delete Session"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                    {/* Status Badge */}
                    <div className={`
                        px-3 py-1 rounded-full text-xs font-medium
                        ${isRunning
                            ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/30'
                            : 'bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-gray-400 border border-slate-200 dark:border-gray-600'
                        }
                    `}>
                        {isRunning && <span className="inline-block w-2 h-2 bg-green-400 rounded-full mr-1 animate-pulse" />}
                        {session.status}
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" />
                    <div>
                        <p className="text-xs text-slate-500 dark:text-gray-500">Detections</p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {session.total_detections?.toLocaleString() || '0'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-purple-400" />
                    <div>
                        <p className="text-xs text-slate-500 dark:text-gray-500">Frames</p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {session.total_frames?.toLocaleString() || '0'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <div>
                        <p className="text-xs text-slate-500 dark:text-gray-500">Avg Conf</p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {session.avg_confidence ? `${(session.avg_confidence * 100).toFixed(1)}%` : 'N/A'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-yellow-400" />
                    <div>
                        <p className="text-xs text-gray-500">Config</p>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white bg-yellow-100 dark:bg-yellow-400/10 px-1.5 rounded" title="FPS Target">
                                {session.fps_target} FPS
                            </span>
                            {session.source_width && session.source_height && (
                                <span className="text-xs font-mono text-slate-500 dark:text-gray-400 bg-slate-100 dark:bg-gray-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-gray-700" title="Source Resolution">
                                    {session.source_width}x{session.source_height}
                                </span>
                            )}
                            {session.save_video && (
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${session.video_height
                                    ? "text-blue-400 bg-blue-400/10 border-blue-400/20"
                                    : "text-amber-400 bg-amber-400/10 border-amber-400/20"
                                    }`} title="Storage Resolution">
                                    {session.video_height ? `${session.video_height}p` : "Orig"}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Buttons - Stop/Resume */}
            {(onStop || onResume) && (
                <div className="pt-4 border-t border-slate-200 dark:border-gray-800">
                    {isRunning ? (
                        <button
                            onClick={() => onStop?.(session.id)}
                            disabled={isStopping}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-500/10 text-red-400 font-medium hover:bg-red-500/20 border border-red-500/30 transition-colors disabled:opacity-50"
                        >
                            <Square size={16} fill="currentColor" />
                            {isStopping ? 'Stopping...' : 'Stop Session'}
                        </button>
                    ) : (
                        <button
                            onClick={() => onResume?.(session.id)}
                            disabled={isResuming}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-500/10 text-green-400 font-medium hover:bg-green-500/20 border border-green-500/30 transition-colors disabled:opacity-50"
                        >
                            <Play size={16} fill="currentColor" />
                            {isResuming ? 'Resuming...' : 'Resume Session'}
                        </button>
                    )}
                </div>
            )}

            {/* Footer - Timestamp */}
            <div className="pt-4 border-t border-slate-200 dark:border-gray-800 mt-4">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">
                        {new Date(session.created_at).toLocaleDateString()} {new Date(session.created_at).toLocaleTimeString()}
                    </span>
                    <Link href={`/nvr?session_id=${session.id}`} className="text-blue-400 group-hover:text-blue-300 font-medium">
                        View Details →
                    </Link>
                </div>
            </div>
        </div>
    );
}
