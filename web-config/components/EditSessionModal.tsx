import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, SessionConfig, SessionInfo } from '@/lib/api';
import { Modal } from './Modal';

export function EditSessionModal({ session, onClose, onUpdate }: { session: SessionInfo, onClose: () => void, onUpdate: () => void }) {
    console.log('EditSessionModal: Rendering for session', session.id); // DEBUG LOG

    const [formData, setFormData] = useState<Partial<SessionConfig>>({
        name: session.name,
        fps_target: session.fps_target,
        conf_threshold: session.conf_threshold,
        iou_threshold: session.iou_threshold,
        source_path: session.source_path,
    });

    // Debug mount
    useEffect(() => {
        console.log('EditSessionModal: Mounted');
        return () => console.log('EditSessionModal: Unmounted');
    }, []);

    const updateSessionMutation = useMutation({
        mutationFn: (data: Partial<SessionConfig>) => api.updateSession(session.id, data),
        onSuccess: () => {
            onUpdate();
        },
        onError: (error: any) => {
            alert(`Error updating session: ${error.message}`);
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateSessionMutation.mutate(formData);
    };

    return (
        <Modal onClose={onClose}>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-4">Edit Session #{session.id}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                        <input
                            type="text"
                            value={formData.name || ''}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                        />
                    </div>

                    {/* Source Path */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Source Path / URL</label>
                        <input
                            type="text"
                            value={formData.source_path || ''}
                            onChange={e => setFormData({ ...formData, source_path: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                        />
                    </div>

                    {/* FPS */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">FPS Target: {formData.fps_target}</label>
                        <input
                            type="range"
                            min="1" max="60"
                            value={formData.fps_target || 1}
                            onChange={e => setFormData({ ...formData, fps_target: parseInt(e.target.value) })}
                            className="w-full"
                        />
                    </div>

                    {/* Conf */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Confidence: {formData.conf_threshold}</label>
                        <input
                            type="range"
                            min="0" max="1" step="0.05"
                            value={formData.conf_threshold || 0.25}
                            onChange={e => setFormData({ ...formData, conf_threshold: parseFloat(e.target.value) })}
                            className="w-full"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={updateSessionMutation.isPending}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg flex justify-center"
                        >
                            {updateSessionMutation.isPending ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );
}
