'use client';

import { useSettings, OverlaySettings } from '@/components/SettingsContext';
import { Settings, Sliders, Type, Square, RefreshCcw, Camera, Globe } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function SettingsPage() {
    const {
        globalSettings,
        setGlobalSettings,
        cameraSettings,
        setCameraSettings,
        scopeSettings,
        setScopeSettings,
        saveSettings,
        resetDefaults
    } = useSettings();

    const [isSaving, setIsSaving] = useState(false);

    // Fetch active cameras (from sessions) to populate dropdown
    const { data: sessionsData } = useQuery({
        queryKey: ['sessions'],
        queryFn: () => api.listSessions({ limit: 100 }),
    });

    const cameras = useMemo(() => {
        if (!sessionsData?.sessions) return [];
        const uniqueCameras = new Set<string>();
        sessionsData.sessions.forEach(s => {
            if (s.status === 'running') {
                const name = s.name || `Camera ${s.id}`;
                uniqueCameras.add(name);
            }
        });
        return Array.from(uniqueCameras);
    }, [sessionsData]);

    const [selectedCamera, setSelectedCamera] = useState<string>('GLOBAL');

    // Current settings to display (either global or specific camera)
    const currentSettings = selectedCamera === 'GLOBAL'
        ? globalSettings
        : (cameraSettings[selectedCamera] || globalSettings);

    const isCustomized = selectedCamera !== 'GLOBAL' && !!cameraSettings[selectedCamera];

    const handleOverlayScaleChange = (val: number) => {
        if (selectedCamera === 'GLOBAL') {
            setGlobalSettings({ overlayScale: val });
        } else {
            setCameraSettings(selectedCamera, {
                ...currentSettings,
                overlayScale: val
            });
        }
    };

    const handleStrokeScaleChange = (val: number) => {
        if (selectedCamera === 'GLOBAL') {
            setGlobalSettings({ strokeScale: val });
        } else {
            setCameraSettings(selectedCamera, {
                ...currentSettings,
                strokeScale: val
            });
        }
    };

    const handleResetCamera = () => {
        if (selectedCamera !== 'GLOBAL') {
            setCameraSettings(selectedCamera, null);
        }
    };

    const handleSave = () => {
        setIsSaving(true);
        saveSettings();
        // Simulate fake delay for feedback
        setTimeout(() => setIsSaving(false), 800);
    };

    // Convert decimal to percentage for display/sliders
    const fontPercent = (currentSettings.overlayScale * 100).toFixed(1);
    const strokePercent = (currentSettings.strokeScale * 100).toFixed(2);

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-8 pb-20">
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-slate-100 rounded-xl">
                        <Settings className="w-8 h-8 text-slate-700" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
                        <p className="text-slate-500">Global and per-camera configuration</p>
                    </div>
                </div>
                {/* Save Button */}
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`
                        flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-white transition-all shadow-md
                        ${isSaving ? 'bg-green-600 scale-95' : 'bg-blue-600 hover:bg-blue-500'}
                    `}
                >
                    {isSaving ? (
                        <>Saved!</>
                    ) : (
                        <>Save Settings</>
                    )}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Config Column */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Camera Selector */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-4">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            {selectedCamera === 'GLOBAL' ? <Globe className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Target Camera</label>
                            <select
                                value={selectedCamera}
                                onChange={(e) => setSelectedCamera(e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="GLOBAL">All Cameras (Global Default)</option>
                                {cameras.map(cam => (
                                    <option key={cam} value={cam}>{cam}</option>
                                ))}
                            </select>
                        </div>
                        {selectedCamera !== 'GLOBAL' && (
                            <div className="text-sm">
                                {isCustomized ? (
                                    <span className="text-blue-600 font-medium bg-blue-50 px-2 py-1 rounded">Customized</span>
                                ) : (
                                    <span className="text-slate-400 bg-slate-50 px-2 py-1 rounded">Using Defaults</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Display Settings */}
                    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <Sliders className="w-5 h-5 text-blue-500" />
                                <h2 className="text-lg font-semibold text-slate-900">
                                    Inference Overlay Display
                                    {selectedCamera !== 'GLOBAL' && <span className="text-slate-400 font-normal ml-2">({selectedCamera})</span>}
                                </h2>
                            </div>
                            {selectedCamera !== 'GLOBAL' && isCustomized && (
                                <button
                                    onClick={handleResetCamera}
                                    className="text-sm text-red-500 hover:text-red-700 underline"
                                >
                                    Reset to Global
                                </button>
                            )}
                        </div>

                        <div className="space-y-8">
                            {/* Font Size Slider */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="flex items-center gap-2 font-medium text-slate-700">
                                        <Type className="w-4 h-4" />
                                        Text Size Scale
                                    </label>
                                    <span className="text-blue-600 font-mono font-bold bg-blue-50 px-2 py-1 rounded">
                                        {fontPercent}% of Height
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="1.0"
                                    max="10.0"
                                    step="0.1"
                                    value={fontPercent}
                                    onChange={(e) => handleOverlayScaleChange(parseFloat(e.target.value) / 100)}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                            </div>

                            {/* Stroke Width Slider */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="flex items-center gap-2 font-medium text-slate-700">
                                        <Square className="w-4 h-4" />
                                        Border Thickness Scale
                                    </label>
                                    <span className="text-blue-600 font-mono font-bold bg-blue-50 px-2 py-1 rounded">
                                        {strokePercent}% of Height
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0.05"
                                    max="2.0"
                                    step="0.01"
                                    value={strokePercent}
                                    onChange={(e) => handleStrokeScaleChange(parseFloat(e.target.value) / 100)}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                            </div>

                            {/* Preview Box */}
                            <div className="mt-8 p-6 bg-slate-900 rounded-lg flex items-center justify-center relative h-48 overflow-hidden group">
                                <div className="absolute top-2 left-2 text-xs text-slate-500">Preview (1080p equivalent)</div>
                                <div
                                    style={{
                                        border: `${200 * currentSettings.strokeScale}px solid #3b82f6`,
                                        position: 'relative'
                                    }}
                                    className="w-48 h-32 flex items-start justify-start"
                                >
                                    <div
                                        style={{
                                            backgroundColor: '#3b82f6',
                                            fontSize: `${200 * currentSettings.overlayScale}px`,
                                            padding: `${200 * currentSettings.overlayScale * 0.2}px`,
                                            lineHeight: 1,
                                        }}
                                        className="text-white font-bold"
                                    >
                                        Person 98%
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Sidebar / Scope Column */}
                <div className="space-y-8">
                    {/* Apply Scope */}
                    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-purple-50 rounded-lg">
                                <Globe className="w-5 h-5 text-purple-600" />
                            </div>
                            <h2 className="text-lg font-semibold text-slate-900">Apply To Pages</h2>
                        </div>
                        <p className="text-sm text-slate-500 mb-4">
                            Select which pages should use these custom overlay settings. Unchecked pages will use system defaults.
                        </p>

                        <div className="space-y-3">
                            <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                                <input
                                    type="checkbox"
                                    checked={scopeSettings.nvr}
                                    onChange={(e) => setScopeSettings({ nvr: e.target.checked })}
                                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <span className="font-medium text-slate-700">NVR Page (/nvr)</span>
                            </label>

                            <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                                <input
                                    type="checkbox"
                                    checked={scopeSettings.cameras}
                                    onChange={(e) => setScopeSettings({ cameras: e.target.checked })}
                                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <span className="font-medium text-slate-700">Cameras Page (/cameras)</span>
                            </label>

                            <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                                <input
                                    type="checkbox"
                                    checked={scopeSettings.recordings}
                                    onChange={(e) => setScopeSettings({ recordings: e.target.checked })}
                                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <span className="font-medium text-slate-700">Recordings Page (/recordings)</span>
                            </label>
                        </div>
                    </section>

                    {/* Reset Button */}
                    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-4">Danger Zone</h2>
                        <button
                            onClick={() => {
                                if (confirm("Are you sure you want to reset ALL settings, including camera specifics?")) {
                                    resetDefaults();
                                    // saveSettings(); // Removed: resetDefaults now handles saving internally to avoid stale state
                                    window.location.reload(); // Optional: Reload to ensure clean state visual feedback
                                }
                            }}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
                        >
                            <RefreshCcw className="w-4 h-4" />
                            Reset All Defaults
                        </button>
                    </section>
                </div>
            </div>
        </div>
    );
}
