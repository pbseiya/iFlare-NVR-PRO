'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, SessionConfig, SessionInfo, LANGUAGE_MODELS } from '@/lib/api';
import { Play, StopCircle, RefreshCw, Settings, Trash2, PlayCircle, Edit } from 'lucide-react';
import { EditSessionModal } from '@/components/EditSessionModal';
import { Modal } from '@/components/Modal';

export default function Home() {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState<SessionConfig>({
        name: '',
        model_name: '~/projects/yolov11_inference_cpu/models/om_flare_yolov11.pt',
        language: 'python+pytorch',
        source_type: 'video',
        source_path: '~/projects/iflare4sale/original/media/DSCF0008.AVI',
        fps_target: 1,
        conf_threshold: 0.25,
        iou_threshold: 0.45,
        save_video: false,
        video_output_path: null,
        recording_mode: 'none',
        render_mode: 'pipeline',
    });
    const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; sessionId: number | null }>({ show: false, sessionId: null });

    const LANGUAGE_MODELS = {
        'python+pytorch': '~/projects/yolov11_inference_cpu/models/om_flare_yolov11.pt',
        'python+openvino': '~/projects/yolov11_inference_cpu/models/yolov11/om_flare_yolov11.xml',
        'cpp+openvino': '~/projects/yolov11_inference_cpu/models/yolov11/om_flare_yolov11.xml',
        'rust+openvino': '~/projects/yolov11_inference_cpu/models/yolov11/om_flare_yolov11.xml',
    };

    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLanguage = e.target.value as keyof typeof LANGUAGE_MODELS;
        setFormData({
            ...formData,
            language: newLanguage,
            model_name: LANGUAGE_MODELS[newLanguage] || formData.model_name
        });
    };

    // Auto-configure defaults for RTSP
    const handleSourceTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newType = e.target.value as any;
        setFormData(prev => ({
            ...prev,
            source_type: newType,
            // If RTSP, default to save_video=true and recording_mode=clean
            save_video: newType === 'rtsp' ? true : prev.save_video,
            recording_mode: newType === 'rtsp' ? 'clean' : prev.recording_mode
        }));
    };

    // Fetch sessions with auto-refresh every 5 seconds
    const [editSession, setEditSession] = useState<SessionInfo | null>(null);

    // Fetch sessions with auto-refresh every 2 seconds
    const sessionsQuery = useQuery({
        queryKey: ['sessions'],
        queryFn: () => api.listSessions({ limit: 10 }),
        refetchInterval: 2000
    });

    const { data: sessionsData, isLoading } = sessionsQuery;

    const createSessionMutation = useMutation({
        mutationFn: api.createSession,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
            setFormData({ ...formData, source_path: '' }); // Clear only required fields
        },
        onError: (error: any) => {
            alert(`Error creating session: ${error.message}`);
        }
    });

    const stopSessionMutation = useMutation({
        mutationFn: (id: number) => api.stopSession(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] })
    });

    const resumeSessionMutation = useMutation({
        mutationFn: (sessionId: number) => api.resumeSession(sessionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
            alert('Session resumed successfully!');
        },
        onError: (error: any) => {
            alert(`Error resuming session: ${error.response?.data?.detail || error.message}`);
        },
    });

    const deleteSessionMutation = useMutation({
        mutationFn: (id: number) => api.deleteSession(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
            setDeleteConfirm({ show: false, sessionId: null });
        },
        onError: (error: any) => {
            alert(`Error deleting session: ${error.response?.data?.detail || error.message}`);
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createSessionMutation.mutate(formData);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            <div className="container mx-auto px-4 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
                        <Settings className="w-10 h-10 text-blue-400" />
                        YOLOv11 Configuration
                    </h1>
                    <p className="text-gray-400">Configure and manage inference sessions</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Configuration Form */}
                    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
                        <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-2">
                            <Play className="w-6 h-6 text-green-400" />
                            New Session
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Session Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Session Name (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={formData.name || ''}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="e.g. Main Gate Camera"
                                />
                            </div>

                            {/* Model Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Model File / Path
                                </label>
                                <input
                                    type="text"
                                    value={formData.model_name}
                                    onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>

                            {/* Language */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Language & Runtime
                                </label>
                                <select
                                    value={formData.language}
                                    onChange={handleLanguageChange}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="python+pytorch">Python + PyTorch</option>
                                    <option value="cpp+openvino">C++ + OpenVINO</option>
                                    <option value="rust+openvino">Rust + OpenVINO</option>
                                </select>
                            </div>

                            {/* Source Type */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Source Type
                                </label>
                                <select
                                    value={formData.source_type}
                                    onChange={handleSourceTypeChange}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="video">Video File</option>
                                    <option value="rtsp">RTSP Stream</option>
                                    <option value="webcam">Webcam</option>
                                </select>
                            </div>

                            {/* Source Path */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Source Path
                                </label>
                                <input
                                    type="text"
                                    value={formData.source_path}
                                    onChange={(e) => setFormData({ ...formData, source_path: e.target.value })}
                                    placeholder="/path/to/video.mp4 or rtsp://..."
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>

                            {/* FPS Target */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    FPS Target: {formData.fps_target}
                                </label>
                                <input
                                    type="range"
                                    min="1"
                                    max="60"
                                    value={formData.fps_target}
                                    onChange={(e) => setFormData({ ...formData, fps_target: parseInt(e.target.value) })}
                                    className="w-full"
                                />
                            </div>

                            {/* Confidence Threshold */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Confidence Threshold: {formData.conf_threshold.toFixed(2)}
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={formData.conf_threshold}
                                    onChange={(e) => setFormData({ ...formData, conf_threshold: parseFloat(e.target.value) })}
                                    className="w-full"
                                />
                            </div>

                            {/* IoU Threshold */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    IoU Threshold: {formData.iou_threshold.toFixed(2)}
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={formData.iou_threshold}
                                    onChange={(e) => setFormData({ ...formData, iou_threshold: parseFloat(e.target.value) })}
                                    className="w-full"
                                />
                            </div>

                            {/* Save Video */}
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="save_video"
                                    checked={formData.save_video}
                                    onChange={(e) => setFormData({ ...formData, save_video: e.target.checked })}
                                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                                />
                                <label htmlFor="save_video" className="text-sm font-medium text-gray-300">
                                    Save Output Video
                                </label>
                            </div>

                            {/* Recording Mode (Conditional) */}
                            {formData.save_video && (
                                <div className="ml-8 p-3 bg-gray-700/30 rounded-lg border border-gray-600/50">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Recording Mode</label>
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="recording_mode"
                                                value="clean"
                                                checked={formData.recording_mode === 'clean'}
                                                onChange={(e) => setFormData({ ...formData, recording_mode: 'clean' })}
                                                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-300">Clean (No BBox)</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="recording_mode"
                                                value="annotated"
                                                checked={formData.recording_mode === 'annotated' || formData.recording_mode === 'none'} // fallback
                                                onChange={(e) => setFormData({ ...formData, recording_mode: 'annotated' })}
                                                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-300">Annotated</span>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={createSessionMutation.isPending}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <Play className="w-5 h-5" />
                                {createSessionMutation.isPending ? 'Creating...' : 'Start Session'}
                            </button>
                        </form>
                    </div>

                    {/* Sessions List */}
                    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
                                <RefreshCw className="w-6 h-6 text-purple-400" />
                                Active Sessions
                            </h2>
                            <button
                                onClick={() => queryClient.invalidateQueries({ queryKey: ['sessions'] })}
                                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <RefreshCw className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        {isLoading ? (
                            <div className="text-center text-gray-400 py-8">Loading...</div>
                        ) : (
                            <div className="space-y-4">
                                {sessionsData?.sessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className="bg-gray-700/50 rounded-lg p-4 border border-gray-600"
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <h3 className="text-lg font-semibold text-white">
                                                    {session.name ? session.name : `Session #${session.id}`}
                                                </h3>
                                                {session.name && (
                                                    <p className="text-xs text-gray-500">ID: {session.id}</p>
                                                )}
                                                <p className="text-sm text-gray-400">{session.model_name}</p>
                                                <p className="text-xs text-gray-500 mt-1 truncate" title={session.source_path}>
                                                    📁 {session.source_path}
                                                </p>
                                            </div>
                                            <span
                                                className={`px-3 py-1 rounded-full text-xs font-semibold ${session.status === 'running'
                                                    ? 'bg-green-500/20 text-green-400'
                                                    : session.status === 'completed'
                                                        ? 'bg-blue-500/20 text-blue-400'
                                                        : 'bg-gray-500/20 text-gray-400'
                                                    }`}
                                            >
                                                {session.status}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                                            <div className="text-gray-400">
                                                Source: <span className="text-white">{session.source_type}</span>
                                            </div>
                                            <div className="text-gray-400">
                                                FPS: <span className="text-white">{session.fps_target}</span>
                                            </div>
                                            <div className="text-gray-400">
                                                Frames: <span className="text-white">{session.total_frames || 0}</span>
                                            </div>
                                            <div className="text-gray-400">
                                                Detections: <span className="text-white">{session.total_detections || 0}</span>
                                            </div>
                                        </div>

                                        <div className="flex gap-2 relative z-10">
                                            {session.status === 'running' && (
                                                <button
                                                    onClick={() => stopSessionMutation.mutate(session.id)}
                                                    disabled={stopSessionMutation.isPending}
                                                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <StopCircle className="w-4 h-4" />
                                                    Stop Session
                                                </button>
                                            )}
                                            {session.status === 'stopped' && (
                                                <button
                                                    onClick={() => resumeSessionMutation.mutate(session.id)}
                                                    disabled={resumeSessionMutation.isPending}
                                                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <PlayCircle className="w-4 h-4" />
                                                    Resume
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    console.log('Edit button clicked for session:', session.id);
                                                    setEditSession(session);
                                                }}
                                                className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center relative z-50 pointer-events-auto"
                                                title="Edit Session"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    console.log('Delete button clicked for session:', session.id);
                                                    setDeleteConfirm({ show: true, sessionId: session.id });
                                                }}
                                                disabled={deleteSessionMutation.isPending}
                                                className="flex-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 relative z-50 pointer-events-auto"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {sessionsData?.sessions.length === 0 && (
                                    <div className="text-center text-gray-400 py-8">
                                        No sessions found. Create one to get started!
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>


            {/* Delete Confirmation Modal */}
            {deleteConfirm.show && (
                <Modal onClose={() => setDeleteConfirm({ show: false, sessionId: null })}>
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-4">Confirm Delete</h3>
                        <p className="text-gray-300 mb-6">
                            Are you sure you want to delete <span className="font-semibold text-red-400">Session #{deleteConfirm.sessionId}</span>?
                            <br />
                            <span className="text-sm text-gray-400 mt-2 block">
                                This will permanently remove all associated data including detections and metrics.
                            </span>
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm({ show: false, sessionId: null })}
                                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (deleteConfirm.sessionId) {
                                        deleteSessionMutation.mutate(deleteConfirm.sessionId);
                                    }
                                    setDeleteConfirm({ show: false, sessionId: null });
                                }}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Edit Session Modal */}
            {editSession && (
                <EditSessionModal
                    session={editSession}
                    onClose={() => setEditSession(null)}
                    onUpdate={() => {
                        setEditSession(null);
                        queryClient.invalidateQueries({ queryKey: ['sessions'] });
                    }}
                />
            )}
        </div>
    );
}
