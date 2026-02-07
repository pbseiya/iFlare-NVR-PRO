import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, SessionConfig, SessionInfo } from '@/lib/api';
import { Modal } from './Modal';
import { Settings2 } from 'lucide-react';

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
    });

    const LANGUAGE_MODELS = {
        "python+pytorch": "~/projects/yolov11_inference_cpu/models/om_flare_yolov11.pt",
        "python+openvino": "~/projects/yolov11_inference_cpu/models/yolov11/om_flare_yolov11.xml",
        "cpp+openvino": "~/projects/yolov11_inference_cpu/models/yolov11/om_flare_yolov11.xml",
        "rust+openvino": "~/projects/yolov11_inference_cpu/models/yolov11/om_flare_yolov11.xml",
    };

    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLanguage = e.target.value as keyof typeof LANGUAGE_MODELS;
        setFormData({
            ...formData,
            language: newLanguage,
            model_name: LANGUAGE_MODELS[newLanguage] || formData.model_name,
        });
    };

    const handleSourceTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newType = e.target.value as any;
        setFormData((prev) => ({
            ...prev,
            source_type: newType,
            save_video: newType === "rtsp" ? true : prev.save_video,
            recording_mode: newType === "rtsp" ? "clean" : prev.recording_mode,
        }));
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Session Name */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Session Name</label>
                            <input
                                type="text"
                                value={formData.name || ""}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="e.g. Main Gate Camera"
                            />
                        </div>

                        {/* Language */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Runtime</label>
                            <select
                                value={formData.language}
                                onChange={handleLanguageChange}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="python+pytorch">Python + PyTorch</option>
                                <option value="cpp+openvino">C++ + OpenVINO</option>
                                <option value="rust+openvino">Rust + OpenVINO</option>
                            </select>
                        </div>

                        {/* Source Type */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Source Type</label>
                            <select
                                value={formData.source_type}
                                onChange={handleSourceTypeChange}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="video">Video File</option>
                                <option value="rtsp">RTSP Stream</option>
                                <option value="webcam">Webcam</option>
                            </select>
                        </div>

                        {/* Model Path */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Model Path</label>
                            <input
                                type="text"
                                value={formData.model_name}
                                onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-600 dark:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                                required
                            />
                        </div>

                        {/* Source Path */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Source Path / URL</label>
                            <input
                                type="text"
                                value={formData.source_path || ''}
                                onChange={e => setFormData({ ...formData, source_path: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-600 dark:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* Sliders */}
                    <div className="space-y-4 pt-2">
                        {/* FPS */}
                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-slate-600 dark:text-slate-400">FPS Target</span>
                                <span className="font-semibold">{formData.fps_target}</span>
                            </div>
                            <input
                                type="range"
                                min="1" max="60"
                                value={formData.fps_target || 1}
                                onChange={e => setFormData({ ...formData, fps_target: parseInt(e.target.value) })}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>

                        {/* Conf */}
                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-slate-600 dark:text-slate-400">Confidence</span>
                                <span className="font-semibold">{formData.conf_threshold?.toFixed(2)}</span>
                            </div>
                            <input
                                type="range"
                                min="0" max="1" step="0.05"
                                value={formData.conf_threshold || 0.25}
                                onChange={e => setFormData({ ...formData, conf_threshold: parseFloat(e.target.value) })}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>

                        {/* IoU */}
                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-slate-600 dark:text-slate-400">IoU Threshold</span>
                                <span className="font-semibold">{formData.iou_threshold?.toFixed(2)}</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={formData.iou_threshold}
                                onChange={(e) => setFormData({ ...formData, iou_threshold: parseFloat(e.target.value) })}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>
                    </div>

                    {/* Recording Mode */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Recording Mode</label>
                        <select
                            value={formData.save_video ? (formData.recording_mode || "clean") : "none"}
                            onChange={(e) => {
                                const mode = e.target.value;
                                setFormData({
                                    ...formData,
                                    save_video: mode !== "none",
                                    recording_mode: mode === "none" ? "none" : (mode as "clean" | "annotated"),
                                });
                            }}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="none">Off (No Recording)</option>
                            <option value="annotated">Annotated (With BBox)</option>
                            <option value="clean">Clean (No BBox)</option>
                        </select>
                    </div>

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
