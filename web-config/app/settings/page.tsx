'use client';

import { useSettings, OverlaySettings } from '@/components/SettingsContext';
import { Settings, Sliders, Type, Square, RefreshCcw, Camera, Globe, HardDrive, Bell, Check, Database } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import DatabaseSettings from '@/components/settings/DatabaseSettings';

type SettingsTab = 'general' | 'display' | 'database' | 'storage' | 'notifications';

export default function SettingsPage() {
    const {
        globalSettings,
        setGlobalSettings,
        cameraSettings,
        setCameraSettings,
        scopeSettings,
        setScopeSettings,
        saveSettings,
        resetDefaults,
        systemSettings,
        updateSystemSettings
    } = useSettings();

    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<SettingsTab>('general');

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

    const NavItem = ({ tab, label, icon: Icon }: { tab: SettingsTab; label: string; icon: any }) => (
        <button
            onClick={() => setActiveTab(tab)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeTab === tab
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
        >
            <Icon className={`w-5 h-5 ${activeTab === tab ? 'text-blue-600' : 'text-slate-400'}`} />
            {label}
        </button>
    );

    return (
        <div className="flex h-full bg-gray-50/50 dark:bg-background">
            {/* Sidebar Navigation */}
            <div className="w-64 border-r border-gray-200 dark:border-slate-800 bg-white dark:bg-gray-900 p-6 flex flex-col gap-1 hidden md:flex">
                <div className="mb-6 px-4">
                    <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Settings</h2>
                </div>

                <NavItem tab="general" label="General" icon={Settings} />
                <NavItem tab="display" label="Display" icon={Sliders} />
                <NavItem tab="database" label="Database" icon={Database} />
                <NavItem tab="storage" label="Storage" icon={HardDrive} />
                <NavItem tab="notifications" label="Notifications" icon={Bell} />
            </div>

            {/* Mobile Nav (Horizontal, only visible on small screens) */}
            <div className="md:hidden w-full overflow-x-auto bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-slate-800 p-2 flex gap-2">
                <button onClick={() => setActiveTab('general')} className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${activeTab === 'general' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`}>General</button>
                <button onClick={() => setActiveTab('display')} className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${activeTab === 'display' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`}>Display</button>
                <button onClick={() => setActiveTab('database')} className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${activeTab === 'database' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`}>Database</button>
                <button onClick={() => setActiveTab('storage')} className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${activeTab === 'storage' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`}>Storage</button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-4xl mx-auto p-8 pb-20 space-y-8">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-white capitalize">{activeTab} Settings</h1>
                            <p className="text-slate-500 dark:text-slate-400">Manage your workspace preferences</p>
                        </div>
                        {/* Save Button */}
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`
                                flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-white transition-all shadow-sm
                                ${isSaving ? 'bg-green-600 scale-95' : 'bg-blue-600 hover:bg-blue-500'}
                            `}
                        >
                            {isSaving ? (
                                <>
                                    <Check className="w-4 h-4" /> Saved!
                                </>
                            ) : (
                                <>Save Changes</>
                            )}
                        </button>
                    </div>

                    {/* CONTENT: GENERAL */}
                    {activeTab === 'general' && (
                        <div className="space-y-6">
                            {/* System Settings */}
                            <section className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                                <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">System</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Core system behavior and power options</p>
                                </div>
                                <div className="p-6 space-y-6">
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-1">
                                            <span className="font-medium text-slate-900 dark:text-white block">Auto-Resume Live Sessions</span>
                                            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg">
                                                Automatically resume running sessions when the backend server restarts (e.g., after a crash or maintenance).
                                            </p>
                                        </div>
                                        <div className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={systemSettings?.auto_resume || false}
                                                onChange={(e) => {
                                                    if (updateSystemSettings) {
                                                        updateSystemSettings({ auto_resume: e.target.checked });
                                                    }
                                                }}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        </div>
                                    </div>

                                    <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Language</label>
                                        <select disabled className="w-full max-w-sm p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500 rounded-lg text-sm cursor-not-allowed">
                                            <option>English (United States)</option>
                                        </select>
                                        <p className="text-xs text-slate-400 mt-1">Multi-language support is coming soon.</p>
                                    </div>
                                </div>
                            </section>

                            {/* Reset Button (Moved to General as 'Danger Zone') */}
                            <section className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-red-100 dark:border-red-900/30 overflow-hidden">
                                <div className="p-6">
                                    <h3 className="text-lg font-semibold text-red-600 mb-1">Danger Zone</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Irreversible actions</p>

                                    <button
                                        onClick={() => {
                                            if (confirm("Are you sure you want to reset ALL settings, including camera specifics?")) {
                                                resetDefaults();
                                                setTimeout(() => window.location.reload(), 200);
                                            }
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg transition-colors"
                                    >
                                        <RefreshCcw className="w-4 h-4" />
                                        Reset All Defaults
                                    </button>
                                </div>
                            </section>
                        </div>
                    )}

                    {/* CONTENT: DISPLAY */}
                    {activeTab === 'display' && (
                        <div className="space-y-6">
                            {/* Camera Selector */}
                            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-4">
                                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
                                    {selectedCamera === 'GLOBAL' ? <Globe className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target Camera Context</label>
                                    <select
                                        value={selectedCamera}
                                        onChange={(e) => setSelectedCamera(e.target.value)}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                            <span className="text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">Customized</span>
                                        ) : (
                                            <span className="text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded">Using Defaults</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Inference Overlay Display */}
                            <section className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Inference Overlay</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">Customize bounding boxes and labels</p>
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

                                <div className="p-6 space-y-8">
                                    {/* Sliders */}
                                    <div className="space-y-6">
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                                                    <Type className="w-4 h-4" />
                                                    Text Size Scale
                                                </label>
                                                <span className="text-blue-600 dark:text-blue-400 font-mono font-bold bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                                                    {fontPercent}%
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min="1.0"
                                                max="10.0"
                                                step="0.1"
                                                value={fontPercent}
                                                onChange={(e) => handleOverlayScaleChange(parseFloat(e.target.value) / 100)}
                                                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                            />
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                                                    <Square className="w-4 h-4" />
                                                    Border Thickness Scale
                                                </label>
                                                <span className="text-blue-600 dark:text-blue-400 font-mono font-bold bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                                                    {strokePercent}%
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.05"
                                                max="2.0"
                                                step="0.01"
                                                value={strokePercent}
                                                onChange={(e) => handleStrokeScaleChange(parseFloat(e.target.value) / 100)}
                                                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                            />
                                        </div>
                                    </div>

                                    {/* Preview Box */}
                                    <div className="p-6 bg-slate-900 rounded-lg flex items-center justify-center relative h-64 overflow-hidden group">
                                        <div className="absolute top-3 left-3 text-xs text-slate-500 font-mono uppercase tracking-widest">Preview (1080p)</div>
                                        <div
                                            style={{
                                                border: `${200 * currentSettings.strokeScale}px solid #3b82f6`,
                                                position: 'relative'
                                            }}
                                            className="w-64 h-40 flex items-start justify-start transition-all duration-200"
                                        >
                                            <div
                                                style={{
                                                    backgroundColor: '#3b82f6',
                                                    fontSize: `${200 * currentSettings.overlayScale}px`,
                                                    padding: `${200 * currentSettings.overlayScale * 0.2}px`,
                                                    lineHeight: 1,
                                                }}
                                                className="text-white font-bold transition-all duration-200"
                                            >
                                                Person 98%
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Apply Scope */}
                            <section className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                                <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Apply Scope</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Where should these custom overlay settings be applied?</p>
                                </div>
                                <div className="p-6 space-y-3">
                                    {[
                                        { key: 'nvr', label: 'NVR Page', path: '/nvr' },
                                        { key: 'cameras', label: 'Cameras Page', path: '/cameras' },
                                        { key: 'recordings', label: 'Recordings Page', path: '/recordings' }
                                    ].map((item) => (
                                        <label key={item.key} className="flex items-center gap-4 p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={scopeSettings[item.key as keyof typeof scopeSettings]}
                                                onChange={(e) => setScopeSettings({ [item.key]: e.target.checked })}
                                                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                            />
                                            <div>
                                                <span className="font-medium text-slate-700 dark:text-slate-300 block">{item.label}</span>
                                                <span className="text-xs text-slate-400 font-mono">{item.path}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </section>
                        </div>
                    )}

                    {/* CONTENT: DATABASE */}
                    {activeTab === 'database' && (
                        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                            <DatabaseSettings />
                        </div>
                    )}

                    {/* CONTENT: PLACEHOLDERS */}
                    {(activeTab === 'storage' || activeTab === 'notifications') && (
                        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 border-dashed">
                            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-full mb-4">
                                {activeTab === 'storage' ? <HardDrive className="w-8 h-8 text-slate-400" /> : <Bell className="w-8 h-8 text-slate-400" />}
                            </div>
                            <h3 className="text-lg font-medium text-slate-900 dark:text-white capitalize">{activeTab} Settings</h3>
                            <p className="text-slate-500 dark:text-slate-400 mt-1">This feature is coming soon.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
