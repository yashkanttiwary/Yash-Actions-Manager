
import { useState, useEffect, useRef, useCallback } from 'react';
import { Settings } from '../types';
import { storage } from '../utils/storage';

// H-01: Separating secure keys from general settings
const SETTINGS_KEY = 'taskMasterSettings_v2';
const SECURE_KEY = 'taskMasterSecure_v1';

// Default Settings
const DEFAULT_SETTINGS: Settings = {
    dailyBudget: 16,
    timezone: 'Asia/Kolkata',
    userTimeOffset: 0,
    pomodoroFocus: 25,
    pomodoroShortBreak: 5,
    pomodoroLongBreak: 15,
    showPomodoroTimer: false,
    googleSheetId: '',
    googleAppsScriptUrl: '',
    googleCalendarId: 'primary',
    geminiApiKey: '', 
    googleApiKey: '',
    googleClientId: '',
    audio: {
        enabled: true,
        mode: 'brown_noise',
        volume: 0.1,
        loopMode: 'all',
        playlist: []
    }
};

export const useSettings = () => {
    const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
    const [loaded, setLoaded] = useState(false);
    
    // H-02: Ref to track the latest state for the debounced saver
    const settingsRef = useRef(DEFAULT_SETTINGS);
    const saveTimeoutRef = useRef<number | null>(null);

    // Initial Load
    useEffect(() => {
        const load = async () => {
            try {
                // 1. Load General Settings
                const saved = await storage.get(SETTINGS_KEY);
                const parsedGeneral = saved ? JSON.parse(saved) : {};

                // 2. Load Secure Keys (Isolated & Secured)
                const savedSecure = await storage.getSecure(SECURE_KEY);
                const parsedSecure = savedSecure ? JSON.parse(savedSecure) : {};

                // 3. Merge (Secure keys override general if present to fix migration)
                const merged: Settings = {
                    ...DEFAULT_SETTINGS,
                    ...parsedGeneral,
                    // Secure keys logic
                    geminiApiKey: parsedSecure.geminiApiKey || parsedGeneral.geminiApiKey || '',
                    googleApiKey: parsedSecure.googleApiKey || parsedGeneral.googleApiKey || '',
                    googleClientId: parsedSecure.googleClientId || parsedGeneral.googleClientId || '',
                    googleSheetId: parsedSecure.googleSheetId || parsedGeneral.googleSheetId || '',
                    googleAppsScriptUrl: parsedSecure.googleAppsScriptUrl || parsedGeneral.googleAppsScriptUrl || '',
                    
                    audio: { ...DEFAULT_SETTINGS.audio, ...(parsedGeneral.audio || {}) }
                };

                setSettingsState(merged);
                settingsRef.current = merged;
            } catch (e) {
                console.error("Failed to load settings", e);
            } finally {
                setLoaded(true);
            }
        };
        load();
    }, []);

    // H-02: Debounced Save Implementation
    const updateSettings = useCallback((updates: Partial<Settings>) => {
        setSettingsState(prev => {
            const next = { ...prev, ...updates };
            settingsRef.current = next; // Sync Ref immediately
            
            // Clear pending save
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
            }

            // Schedule new save (500ms debounce)
            saveTimeoutRef.current = window.setTimeout(async () => {
                try {
                    const currentSettings = settingsRef.current;
                    
                    // H-01: Split sensitive vs non-sensitive for storage
                    // Non-Sensitive
                    const { 
                        geminiApiKey, googleApiKey, googleClientId, googleSheetId, googleAppsScriptUrl,
                        ...general 
                    } = currentSettings;

                    // Sensitive
                    const secure = { 
                        geminiApiKey, googleApiKey, googleClientId, googleSheetId, googleAppsScriptUrl
                    };

                    await storage.set(SETTINGS_KEY, JSON.stringify(general));
                    await storage.setSecure(SECURE_KEY, JSON.stringify(secure));
                } catch (e) {
                    console.error("Failed to save settings", e);
                }
            }, 500);

            return next;
        });
    }, []);

    return { settings, updateSettings, loaded };
};
