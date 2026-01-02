
import { useState, useEffect, useCallback, useRef } from 'react';
import { Task, GamificationData, Settings, Goal } from '../types';
import * as sheetService from '../services/googleSheetService';

const POLL_INTERVAL = 15000; // 15s poll
const DEBOUNCE_DELAY = 1000; // 1s debounce to batch rapid edits

export const useGoogleSheetSync = (
    sheetId: string | undefined, 
    localTasks: Task[], 
    setAllData: (tasks: Task[], goals: Goal[]) => void,
    isSignedIn: boolean,
    appsScriptUrl?: string,
    gamification?: GamificationData,
    settings?: Settings,
    setGamification?: (data: GamificationData) => void,
    setSettings?: (settings: Settings) => void,
    localGoals: Goal[] = []
) => {
    const [status, setStatus] = useState<'idle' | 'syncing' | 'error' | 'success'>('idle');
    const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [syncMethod, setSyncMethod] = useState<'script' | 'api' | null>(null);
    
    const localTasksRef = useRef(localTasks);
    const localGoalsRef = useRef(localGoals);
    const gamificationRef = useRef(gamification);
    const settingsRef = useRef(settings);
    const isDirtyRef = useRef(false);
    const debounceTimerRef = useRef<number | null>(null);
    
    // Lock to prevent pushing before we have confirmed state
    const initialPullComplete = useRef(false);
    
    // Flag to prevent echoes (remote update triggering local update triggering push)
    const isRemoteUpdate = useRef(false);

    useEffect(() => {
        localTasksRef.current = localTasks;
        localGoalsRef.current = localGoals;
        gamificationRef.current = gamification;
        settingsRef.current = settings;
    }, [localTasks, localGoals, gamification, settings]);

    useEffect(() => {
        if (appsScriptUrl) {
            setSyncMethod('script');
            // Do not reset initialPullComplete if switching methods gracefully, 
            // but usually we want a fresh pull on method change.
            initialPullComplete.current = false;
        } else if (sheetId && isSignedIn) {
            setSyncMethod('api');
            initialPullComplete.current = false;
        } else {
            setSyncMethod(null);
            setStatus('idle');
        }
    }, [appsScriptUrl, sheetId, isSignedIn]);

    // --- MAIN PUSH FUNCTION ---
    const manualPush = useCallback(async () => {
        if (!syncMethod) return;
        
        if (!initialPullComplete.current) {
            console.warn("[Sync] Push blocked: Initial pull pending.");
            return;
        }

        setStatus('syncing');
        try {
            console.log("[Sync] Pushing data...");
            
            // Sanitize settings
            const safeSettings = { ...(settingsRef.current || {}) };
            delete safeSettings.geminiApiKey;
            delete safeSettings.googleApiKey;
            delete safeSettings.googleClientId;

            const metadata = {
                gamification: gamificationRef.current,
                settings: safeSettings
            };

            const target = syncMethod === 'api' ? sheetId! : appsScriptUrl!;

            if (syncMethod === 'api') {
                await sheetService.syncDataToSheet(target, localTasksRef.current, localGoalsRef.current, metadata);
            } else {
                await sheetService.syncDataToAppsScript(target, localTasksRef.current, localGoalsRef.current, metadata);
            }
            setLastSyncTime(new Date().toISOString());
            setStatus('success');
            isDirtyRef.current = false;
        } catch (e: any) {
            console.error("Push Failed", e);
            setStatus('error');
            setErrorMsg(e.message || "Push failed");
        }
    }, [syncMethod, sheetId, appsScriptUrl]);

    // --- MAIN PULL FUNCTION (SMART HYDRATION) ---
    const executeStrictPull = useCallback(async (method: 'script' | 'api', idOrUrl: string, isPolling = false) => {
        if (!isPolling) console.log(`[Sync] Pulling via ${method}...`);
        
        try {
            let remoteTasks: Task[] = [];
            let remoteGoals: Goal[] = [];
            let remoteMetadata: any = null;

            if (method === 'api') {
                const data = await sheetService.syncDataFromSheet(idOrUrl);
                remoteTasks = data.tasks;
                remoteGoals = data.goals;
                remoteMetadata = data.metadata;
            } else {
                const data = await sheetService.syncDataFromAppsScript(idOrUrl);
                remoteTasks = data.tasks;
                remoteGoals = data.goals;
                remoteMetadata = data.metadata;
            }

            // SMART MERGE: Compare Remote vs Local
            // We use the current refs because they contain what was loaded from localStorage
            const currentLocalTasks = localTasksRef.current;
            const currentLocalGoals = localGoalsRef.current;

            // 1. Merge Tasks (Prefer Newest)
            const { mergedTasks, hasLocalWins, hasRemoteChanges } = smartMergeTasks(currentLocalTasks, remoteTasks, isPolling);
            
            // 2. Merge Goals (Simple ID check + Newest wins)
            const mergedGoals = smartMergeGoals(currentLocalGoals, remoteGoals);

            if (!isPolling || hasRemoteChanges) {
                console.log(`[Sync] Merge Result: ${mergedTasks.length} tasks. Remote changes detected: ${hasRemoteChanges}`);
                
                // Apply Update
                isRemoteUpdate.current = true;
                setAllData(mergedTasks, mergedGoals);
                
                // Handle Metadata
                if (remoteMetadata) {
                    if (remoteMetadata.gamification && setGamification) {
                        setGamification(remoteMetadata.gamification);
                    }
                    if (remoteMetadata.settings && setSettings) {
                        const currentLocalSettings = settingsRef.current || {} as Settings;
                        const mergedSettings = {
                            ...remoteMetadata.settings,
                            // Preserve local keys unless missing
                            geminiApiKey: currentLocalSettings.geminiApiKey || remoteMetadata.settings.geminiApiKey,
                            googleApiKey: currentLocalSettings.googleApiKey || remoteMetadata.settings.googleApiKey,
                            googleClientId: currentLocalSettings.googleClientId || remoteMetadata.settings.googleClientId,
                            // Preserve connection settings to avoid loops
                            googleAppsScriptUrl: currentLocalSettings.googleAppsScriptUrl || remoteMetadata.settings.googleAppsScriptUrl,
                            googleSheetId: currentLocalSettings.googleSheetId || remoteMetadata.settings.googleSheetId,
                            // Merge audio settings
                            audio: { ...currentLocalSettings.audio, ...(remoteMetadata.settings.audio || {}) }
                        };
                        setSettings(mergedSettings);
                    }
                }
            }
            
            setLastSyncTime(new Date().toISOString());
            initialPullComplete.current = true;
            setStatus('success');

            // CRITICAL: If local data was newer during an initial pull, the sheet is stale.
            // Schedule a repair push.
            if (hasLocalWins && !isPolling) {
                console.log("[Sync] Local data was newer. Scheduling repair push.");
                isDirtyRef.current = true; 
            }

        } catch (e: any) {
            console.error("Pull Failed", e);
            // Don't set error status on polling failures to avoid UI flickering
            if (!isPolling) {
                setStatus('error');
                setErrorMsg(e.message || "Sync failed");
            }
        }
    }, [setAllData, setGamification, setSettings]);

    // Manual Pull Wrapper
    const manualPull = useCallback(async () => {
        if (!syncMethod) return;
        setStatus('syncing');
        const target = syncMethod === 'api' ? sheetId! : appsScriptUrl!;
        await executeStrictPull(syncMethod, target, false);
    }, [syncMethod, sheetId, appsScriptUrl, executeStrictPull]);

    // Initial Load Effect
    useEffect(() => {
        if (!syncMethod) return;
        if (initialPullComplete.current) return;

        const target = syncMethod === 'api' ? sheetId! : appsScriptUrl!;
        
        // Short delay to ensure localStorage has fully loaded into state before we merge
        const timer = setTimeout(() => {
            if (syncMethod === 'api') {
                sheetService.initializeSheetHeaders(target).then(() => executeStrictPull(syncMethod, target, false));
            } else {
                executeStrictPull(syncMethod, target, false);
            }
        }, 100);

        return () => clearTimeout(timer);
    }, [syncMethod, sheetId, appsScriptUrl, executeStrictPull]);

    // Auto-Push Watcher
    useEffect(() => {
        if (!syncMethod) return;

        if (isRemoteUpdate.current) {
            isRemoteUpdate.current = false;
            return;
        }
        
        if (!initialPullComplete.current) return;
        if (status === 'syncing') return;

        isDirtyRef.current = true;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        debounceTimerRef.current = window.setTimeout(async () => {
            if (!isDirtyRef.current) return;
            manualPush();
        }, DEBOUNCE_DELAY);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [localTasks, localGoals, gamification, settings, syncMethod, manualPush, status]);

    // Background Polling
    useEffect(() => {
        if (!syncMethod) return;

        const pollInterval = setInterval(async () => {
            if (status === 'syncing' || isDirtyRef.current || !initialPullComplete.current) return;

            const target = syncMethod === 'api' ? sheetId! : appsScriptUrl!;
            // Removed modifiedTime check - it is unreliable for instant collaboration.
            await executeStrictPull(syncMethod, target, true);

        }, POLL_INTERVAL);

        return () => clearInterval(pollInterval);
    }, [syncMethod, sheetId, appsScriptUrl, status, executeStrictPull]);

    // VISIBILITY LISTENER: Force pull when user returns to tab
    useEffect(() => {
        if (!syncMethod) return;

        const handleFocus = () => {
            // Only pull if we aren't currently editing (dirty)
            if (!isDirtyRef.current && status !== 'syncing' && initialPullComplete.current) {
                console.log("[Sync] Tab focused. Refreshing data...");
                const target = syncMethod === 'api' ? sheetId! : appsScriptUrl!;
                executeStrictPull(syncMethod, target, true);
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleFocus);

        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleFocus);
        };
    }, [syncMethod, sheetId, appsScriptUrl, status, executeStrictPull]);

    return { status, lastSyncTime, errorMsg, syncMethod, manualPull, manualPush };
};

// --- HELPER: Smart Merge ---
// Returns merged list AND boolean if local data "won" (implies sheet is stale)
const smartMergeTasks = (local: Task[], remote: Task[], isPolling = false): { mergedTasks: Task[], hasLocalWins: boolean, hasRemoteChanges: boolean } => {
    const taskMap = new Map<string, Task>();
    let hasLocalWins = false;
    let hasRemoteChanges = false;

    // 1. Start with all Local tasks (Source of Truth for unsynced edits)
    local.forEach(t => taskMap.set(t.id, t));

    // 2. Overlay Remote tasks conditionally
    remote.forEach(r => {
        const l = taskMap.get(r.id);
        
        if (!l) {
            // Task exists in Remote but not Local.
            taskMap.set(r.id, r);
            hasRemoteChanges = true;
        } else {
            // Task exists in both. Compare Timestamps.
            const localTime = new Date(l.lastModified).getTime();
            const remoteTime = new Date(r.lastModified).getTime();

            // Threshold to prevent jitter (1 second)
            if (remoteTime > localTime + 1000) {
                // Remote is significantly newer. Accept it.
                // NOTE: We trust server more if it's newer.
                // Check equality to avoid unnecessary re-renders
                if (JSON.stringify(l) !== JSON.stringify(r)) {
                    taskMap.set(r.id, r);
                    hasRemoteChanges = true;
                }
            } else if (localTime > remoteTime + 1000) {
                // Local is significantly newer. Keep Local.
                hasLocalWins = true;
            }
            // If timestamps are close, prefer Local (UI stability)
        }
    });

    return { 
        mergedTasks: Array.from(taskMap.values()), 
        hasLocalWins: !isPolling && hasLocalWins, // Only care about local wins during initial hydrate to trigger repair
        hasRemoteChanges 
    };
};

const smartMergeGoals = (local: Goal[], remote: Goal[]) => {
    const map = new Map<string, Goal>();
    local.forEach(g => map.set(g.id, g));
    remote.forEach(r => map.set(r.id, r)); // Simple overwrite for goals for now, usually fewer conflicts
    return Array.from(map.values());
};
