import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, SessionConfig, SessionInfo } from '@/lib/api';
import { Modal } from './Modal';
import { Settings2 } from 'lucide-react';
import { SessionFormFields } from './dashboard/SessionFormFields';

export function EditSessionModal({ session, onClose, onUpdate }: { session: SessionInfo, onClose: () => void, onUpdate: () => void }) {
    console.log('EditSessionModal: Rendering for session', session.id);

    const [formData, setFormData] = useState<Partial<SessionConfig>>({
        name: session.name,
        model_name: session.model_name,
        language: session.language,
        source_type: session.source_type,
        source_path: session.source_path,
        fps_target: session.fps_target,
        conf_threshold: session.conf_threshold,
        iou_threshold: session.iou_threshold,
        save_video: session.save_video,
        video_output_path: session.video_output_path,
        recording_mode: session.recording_mode,
        render_mode: session.render_mode,
        video_height: session.video_height,
    });

    const handleChange = (newData: Partial<SessionConfig>) => {
        setFormData(prev => ({ ...prev, ...newData }));
    };

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
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl p-6 relative">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                    <Settings2 className="text-blue-500" />
                    Edit Session #{session.id}
                </h3>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <SessionFormFields formData={formData} onChange={handleChange} isEditMode={true} />

                    <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700 mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={updateSessionMutation.isPending}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg flex justify-center shadow-lg shadow-blue-600/20 transition-colors"
                        >
                            {updateSessionMutation.isPending ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );
}
