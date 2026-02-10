'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

// Define the shape of settings for a single entity (global or specific camera)
export interface OverlaySettings {
    overlayScale: number; // Font size as % of video height
    strokeScale: number;  // Stroke width as % of video height
}

export interface ScopeSettings {
    nvr: boolean;
    cameras: boolean;
    recordings: boolean;
}

const DEFAULT_SCOPES: ScopeSettings = {
    nvr: true,
    cameras: true,
    recordings: true,
};

const DEFAULT_SETTINGS: OverlaySettings = {
    overlayScale: 0.035, // 3.5%
    strokeScale: 0.003,  // 0.3%
};

interface SettingsContextType {
    // Global Defaults
    globalSettings: OverlaySettings;
    setGlobalSettings: (settings: Partial<OverlaySettings>) => void;

    // Per-Camera Overrides
    cameraSettings: Record<string, OverlaySettings>; // key = cameraName
    setCameraSettings: (cameraName: string, settings: OverlaySettings | null) => void;

    // Scope Settings
    scopeSettings: ScopeSettings;
    setScopeSettings: (scopes: Partial<ScopeSettings>) => void;

    // Actions
    saveSettings: () => void;
    resetDefaults: () => void;

    // Helper to get effective settings for a camera (merges global + override)
    getSettingsForCamera: (cameraName?: string) => OverlaySettings;

    // System Settings (Backend)
    systemSettings: { auto_resume: boolean };
    updateSystemSettings: (settings: { auto_resume?: boolean }) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [globalSettings, setGlobalSettingsState] = useState<OverlaySettings>(DEFAULT_SETTINGS);
    const [cameraSettings, setCameraSettingsState] = useState<Record<string, OverlaySettings>>({});
    const [scopeSettings, setScopeSettingsState] = useState<ScopeSettings>(DEFAULT_SCOPES);
    const [systemSettings, setSystemSettingsState] = useState<{ auto_resume: boolean }>({ auto_resume: false });
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from LocalStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('appSettingsV3'); // V3 for Scope support
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.globalSettings) setGlobalSettingsState({ ...DEFAULT_SETTINGS, ...parsed.globalSettings });
                if (parsed.cameraSettings) setCameraSettingsState(parsed.cameraSettings);
                if (parsed.scopeSettings) setScopeSettingsState({ ...DEFAULT_SCOPES, ...parsed.scopeSettings });
            } else {
                // Migration V2
                const savedV2 = localStorage.getItem('appSettingsV2');
                if (savedV2) {
                    const parsed = JSON.parse(savedV2);
                    if (parsed.globalSettings) setGlobalSettingsState({ ...DEFAULT_SETTINGS, ...parsed.globalSettings });
                    if (parsed.cameraSettings) setCameraSettingsState(parsed.cameraSettings);
                }
            }
        } catch (e) {
            console.error("Failed to load settings from localStorage", e);
        } finally {
            setIsLoaded(true);
        }
    }, []);

    // Load System Settings from Backend on mount
    useEffect(() => {
        const fetchSystemSettings = async () => {
            // Dynamic import to avoid circular dependency issues if any, or just direct usage
            const { api } = await import('@/lib/api');
            try {
                const settings = await api.getSystemSettings();
                if (settings) {
                    setSystemSettingsState(prev => ({ ...prev, ...settings }));
                }
            } catch (e) {
                console.error("Failed to fetch system settings", e);
            }
        };
        fetchSystemSettings();
    }, []);

    // Manual Save Function
    const saveSettings = () => {
        try {
            localStorage.setItem('appSettingsV3', JSON.stringify({
                globalSettings,
                cameraSettings,
                scopeSettings
            }));
            // Optional: User feedback could be handled by the UI calling this
            console.log("Settings saved successfully.");
        } catch (e) {
            console.error("Failed to save settings to localStorage", e);
        }
    };

    const setGlobalSettings = (updates: Partial<OverlaySettings>) => {
        setGlobalSettingsState(prev => ({ ...prev, ...updates }));
    };

    const setCameraSettings = (cameraName: string, settings: OverlaySettings | null) => {
        setCameraSettingsState(prev => {
            const next = { ...prev };
            if (settings) {
                next[cameraName] = settings;
            } else {
                delete next[cameraName];
            }
            return next;
        });
    };

    const setScopeSettings = (updates: Partial<ScopeSettings>) => {
        setScopeSettingsState(prev => ({ ...prev, ...updates }));
    };

    const updateSystemSettings = async (updates: { auto_resume?: boolean }) => {
        // Optimistic update
        setSystemSettingsState(prev => ({ ...prev, ...updates }));

        try {
            const { api } = await import('@/lib/api');
            await api.updateSystemSettings(updates);
        } catch (e) {
            console.error("Failed to update system settings", e);
            // Revert? For now just log.
        }
    };

    const getSettingsForCamera = (cameraName?: string): OverlaySettings => {
        if (cameraName && cameraSettings[cameraName]) {
            return cameraSettings[cameraName];
        }
        return globalSettings;
    };

    const resetDefaults = () => {
        const defaults = {
            globalSettings: DEFAULT_SETTINGS,
            cameraSettings: {},
            scopeSettings: DEFAULT_SCOPES
        };

        setGlobalSettingsState(defaults.globalSettings);
        setCameraSettingsState(defaults.cameraSettings);
        setScopeSettingsState(defaults.scopeSettings);

        // Save immediately to localStorage to avoid race conditions with state updates
        try {
            localStorage.setItem('appSettingsV3', JSON.stringify(defaults));
            console.log("Settings reset and saved to localStorage.");
        } catch (e) {
            console.error("Failed to save reset settings", e);
        }
    };

    return (
        <SettingsContext.Provider value={{
            globalSettings,
            setGlobalSettings,
            cameraSettings,
            setCameraSettings,
            scopeSettings,
            setScopeSettings,
            saveSettings,
            getSettingsForCamera,
            resetDefaults,
            systemSettings,
            updateSystemSettings
        }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}
