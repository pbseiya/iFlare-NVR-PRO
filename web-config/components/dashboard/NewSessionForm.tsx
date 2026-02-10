import { useState } from "react";
import { Play, Settings2 } from "lucide-react";
import { SessionConfig, api } from "@/lib/api";
import { SessionFormFields } from "./SessionFormFields";

interface NewSessionFormProps {
    onSubmit: (data: SessionConfig) => void;
    isLoading: boolean;
}

export function NewSessionForm({ onSubmit, isLoading }: NewSessionFormProps) {
    const [formData, setFormData] = useState<SessionConfig>({
        name: "",
        model_name: "~/projects/yolov11_inference_cpu/models/om_flare_yolov11.pt",
        language: "python+pytorch",
        source_type: "video",
        source_path: "/home/pongsak/projects/rtsp_server/demo_clips/tf2dfx.mp4",
        fps_target: 1,
        conf_threshold: 0.25,
        iou_threshold: 0.45,
        save_video: true,
        video_output_path: null,
        recording_mode: "clean",
        render_mode: "pipeline",
        video_height: undefined, // Will use original resolution unless user selects a specific value
    });

    const handleChange = (newData: Partial<SessionConfig>) => {
        setFormData(prev => ({ ...prev, ...newData }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <Settings2 className="text-blue-500" />
                New Session Config
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
                <SessionFormFields formData={formData} onChange={handleChange} />

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                >
                    <Play size={18} />
                    {isLoading ? "Starting..." : "Start Session"}
                </button>
            </form>
        </div>
    );
}
