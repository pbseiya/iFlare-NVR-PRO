import { useState, useEffect } from "react";
import { SessionConfig, api, SourceAnalysisResponse } from "@/lib/api";

interface SessionFormFieldsProps {
    formData: Partial<SessionConfig>;
    onChange: (newData: Partial<SessionConfig>) => void;
    isEditMode?: boolean;
}

export function SessionFormFields({ formData, onChange, isEditMode = false }: SessionFormFieldsProps) {
    const [sourceInfo, setSourceInfo] = useState<SourceAnalysisResponse | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [estimatedSize, setEstimatedSize] = useState<string | null>(null);

    const LANGUAGE_MODELS = {
        "python+pytorch": "~/projects/yolov11_inference_cpu/models/om_flare_yolov11.pt",
        "python+openvino": "~/projects/yolov11_inference_cpu/models/yolov11/om_flare_yolov11.xml",
        "cpp+openvino": "~/projects/yolov11_inference_cpu/models/yolov11/om_flare_yolov11.xml",
        "rust+openvino": "~/projects/yolov11_inference_cpu/models/yolov11/om_flare_yolov11.xml",
    };

    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLanguage = e.target.value as keyof typeof LANGUAGE_MODELS;
        onChange({
            language: newLanguage,
            model_name: LANGUAGE_MODELS[newLanguage] || formData.model_name,
        });
    };

    const handleSourceTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newType = e.target.value as any;
        onChange({
            source_type: newType,
            save_video: newType === "rtsp" ? true : (formData.save_video ?? true),
            recording_mode: newType === "rtsp" ? "clean" : (formData.recording_mode ?? "clean"),
        });
    };

    const handleAnalyzeSource = async () => {
        if (!formData.source_path || !formData.source_type) return;
        setIsAnalyzing(true);
        setSourceInfo(null);
        setEstimatedSize(null);
        try {
            const result = await api.analyzeSource(formData.source_path, formData.source_type);
            setSourceInfo(result);
            onChange({
                source_width: result.width,
                source_height: result.height
            });
        } catch (e) {
            console.error("Analysis failed", e);
        } finally {
            setIsAnalyzing(false);
        }
    };

    useEffect(() => {
        if (!sourceInfo) return;

        const targetFps = formData.fps_target || 1;

        const CALIBRATION_DATA: Record<string, { fps1: number; fps6: number }> = {
            "original": { fps1: 2.72, fps6: 4.71 },
            "1080": { fps1: 1.44, fps6: 4.45 },
            "720": { fps1: 0.75, fps6: 4.51 },
            "480": { fps1: 0.40, fps6: 2.50 }
        };

        const resKey = formData.video_height ? formData.video_height.toString() : "original";
        const data = CALIBRATION_DATA[resKey] || CALIBRATION_DATA["original"];

        let sizeMbMin;
        if (targetFps <= 1) {
            sizeMbMin = data.fps1;
        } else if (targetFps <= 6) {
            const ratio = (targetFps - 1) / (6 - 1);
            sizeMbMin = data.fps1 + (data.fps6 - data.fps1) * ratio;
        } else {
            sizeMbMin = data.fps6 * (targetFps / 6.0);
        }

        setEstimatedSize(sizeMbMin.toFixed(2));
    }, [sourceInfo, formData.fps_target, formData.video_height]);

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Session Name */}
                <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Session Name</label>
                    <input
                        type="text"
                        value={formData.name || ""}
                        onChange={(e) => onChange({ name: e.target.value })}
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
                        onChange={(e) => onChange({ model_name: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-600 dark:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                        required
                    />
                </div>

                {/* Source Path */}
                <div className="col-span-2">
                    <div className="flex justify-between items-center mb-1">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Source Path / URL</label>
                        <button
                            type="button"
                            onClick={handleAnalyzeSource}
                            disabled={isAnalyzing || !formData.source_path}
                            className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 hover:underline"
                        >
                            {isAnalyzing ? "Analyzing..." : "Analyze Source"}
                        </button>
                    </div>
                    <input
                        type="text"
                        value={formData.source_path || ""}
                        onChange={(e) => onChange({ source_path: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-600 dark:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                        required
                    />
                </div>

                {/* Source Analysis Result */}
                {sourceInfo && (
                    <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-sm border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex gap-4">
                            <div>
                                <span className="text-slate-500 block text-xs">Source Resolution</span>
                                <span className="font-mono font-medium">{sourceInfo.width}x{sourceInfo.height}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 block text-xs">Source FPS</span>
                                <span className="font-mono font-medium">{sourceInfo.fps.toFixed(2)}</span>
                            </div>
                            {sourceInfo.estimated_bitrate_bps && (
                                <div>
                                    <span className="text-slate-500 block text-xs">Est. Bitrate</span>
                                    <span className="font-mono font-medium">{(sourceInfo.estimated_bitrate_bps / 1000000).toFixed(2)} Mbps</span>
                                </div>
                            )}
                        </div>
                        {estimatedSize && (
                            <div className="text-right">
                                <span className="text-slate-500 block text-xs">Est. Output Size</span>
                                <span className="font-bold text-blue-600">{estimatedSize} MB / min</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Sliders */}
            <div className="space-y-4 pt-2">
                <div>
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600 dark:text-slate-400">FPS Target</span>
                        <span className="font-semibold">{formData.fps_target}</span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max="60"
                        value={formData.fps_target || 1}
                        onChange={(e) => onChange({ fps_target: parseInt(e.target.value) })}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                </div>
                <div>
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600 dark:text-slate-400">Confidence</span>
                        <span className="font-semibold">{formData.conf_threshold?.toFixed(2)}</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={formData.conf_threshold || 0.25}
                        onChange={(e) => onChange({ conf_threshold: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                </div>
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
                        value={formData.iou_threshold || 0.45}
                        onChange={(e) => onChange({ iou_threshold: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                {/* Recording Mode */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Recording Mode</label>
                    <select
                        value={formData.save_video ? (formData.recording_mode || "clean") : "none"}
                        onChange={(e) => {
                            const mode = e.target.value;
                            onChange({
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

                {/* Storage Resolution */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Storage Resolution</label>
                    <select
                        value={formData.video_height || "original"}
                        onChange={(e) => {
                            const val = e.target.value;
                            onChange({
                                video_height: val === "original" ? undefined : parseInt(val),
                            });
                        }}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        disabled={!formData.save_video}
                    >
                        <option value="original">Original (Full Size)</option>
                        <option value="1080">1080p (Height 1080px)</option>
                        <option value="720">720p (Height 720px)</option>
                        <option value="480">480p (Height 480px)</option>
                    </select>
                </div>
            </div>
        </div>
    );
}
