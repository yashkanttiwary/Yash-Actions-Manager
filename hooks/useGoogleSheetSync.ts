
import { useState, useEffect, useCallback, useRef } from 'react';
import { Task, GamificationData, Settings, Goal } from '../types';
import * as sheetService from '../services/googleSheetService';

const POLL_INTERVAL = 10000; // Relaxed poll interval to reduce quota usage
const DEBOUNCE_DELAY = 500; // Faster debounce (0.5s) to capture edits quickly

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
            // Token is sensitive but saved in script properties on the other end, so it's safer to not send settings back?
            // Actually, settings sync is useful. The token is stored locally.
            // We should strip the token from the metadata sent to the sheet to avoid exposing it in the JSON blob if the sheet is shared.
            delete safeSettings.googleAppsScriptToken;

            const metadata = {
                gamification: gamificationRef.current,
                settings: safeSettings
            };

            if (syncMethod === 'api' && sheetId) {
                await sheetService.syncDataToSheet(sheetId, localTasksRef.current, localGoalsRef.current, metadata);
            } else if (syncMethod === 'script' && appsScriptUrl) {
                // IMP-001: Send token
                const token = settingsRef.current?.googleAppsScriptToken;
                await sheetService.syncDataToAppsScript(appsScriptUrl, localTasksRef.current, localGoalsRef.current, metadata, token);
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
    const executeStrictPull = useCallback(async (method: 'script' | 'api', idOrUrl: string) => {
        console.log(`[Sync] Initializing via ${method}...`);
        let remoteTasks: Task[] = [];
        let remoteGoals: Goal[] = [];
        let remoteMetadata: any = null;
        
        try {
            if (method === 'api') {
                const data = await sheetService.syncDataFromSheet(idOrUrl);
                remoteTasks = data.tasks;
                remoteGoals = data.goals;
                remoteMetadata = data.metadata;
            } else {
                // IMP-001: Send token
                const token = settingsRef.current?.googleAppsScriptToken;
                const data = await sheetService.syncDataFromAppsScript(idOrUrl, token);
                remoteTasks = data.tasks;
                remoteGoals = data.goals;
                remoteMetadata = data.metadata;
            }

            // SMART MERGE: Compare Remote vs Local
            // We use the current refs because they contain what was loaded from localStorage on boot
            const currentLocalTasks = localTasksRef.current;
            const currentLocalGoals = localGoalsRef.current;

            // 1. Merge Tasks (Prefer Newest)
            const { mergedTasks, hasLocalWins } = smartMergeTasks(currentLocalTasks, remoteTasks);
            
            // 2. Merge Goals (Simple ID check + Newest wins)
            const mergedGoals = smartMergeGoals(currentLocalGoals, remoteGoals);

            console.log(`[Sync] Merge Result: ${mergedTasks.length} tasks (Local wins: ${hasLocalWins})`);
            
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
                        geminiApiKey: currentLocalSettings.geminiApiKey || remoteMetadata.settings.geminiApiKey,
                        googleApiKey: currentLocalSettings.googleApiKey || remoteMetadata.settings.googleApiKey,
                        googleClientId: currentLocalSettings.googleClientId || remoteMetadata.settings.googleClientId,
                        googleAppsScriptUrl: currentLocalSettings.googleAppsScriptUrl || remoteMetadata.settings.googleAppsScriptUrl,
                        googleSheetId: currentLocalSettings.googleSheetId || remoteMetadata.settings.googleSheetId,
                        // Preserve local token
                        googleAppsScriptToken: currentLocalSettings.googleAppsScriptToken || remoteMetadata.settings.googleAppsScriptToken,
                        audio: currentLocalSettings.audio || remoteMetadata.settings.audio
                    };
                    setSettings(mergedSettings);
                }
            }
            
            setLastSyncTime(new Date().toISOString());
            initialPullComplete.current = true;
            setStatus('success');

            // CRITICAL FIX: If local data was newer (hasLocalWins), the sheet is now stale.
            // We must schedule a push to update the sheet with our preserved local edits.
            if (hasLocalWins) {
                console.log("[Sync] Local data was newer. Scheduling repair push.");
                isDirtyRef.current = true; // Trigger the debounce effect
            }

        } catch (e: any) {
            console.error("Pull Failed", e);
            setStatus('error');
            setErrorMsg(e.message || "Initialization failed");
        }
    }, [setAllData, setGamification, setSettings]);

    // Manual Pull Wrapper
    const manualPull = useCallback(async () => {
        if (!syncMethod) return;
        setStatus('syncing');
        const target = syncMethod === 'api' ? sheetId! : appsScriptUrl!;
        await executeStrictPull(syncMethod, target);
    }, [syncMethod, sheetId, appsScriptUrl, executeStrictPull]);

    // Initial Load Effect
    useEffect(() => {
        if (!syncMethod) return;
        if (initialPullComplete.current) return; // Only run once per connection session

        const target = syncMethod === 'api' ? sheetId! : appsScriptUrl!;
        
        // Short delay to ensure localStorage has fully loaded into state before we merge
        const timer = setTimeout(() => {
            if (syncMethod === 'api') {
                sheetService.initializeSheetHeaders(target).then(() => executeStrictPull(syncMethod, target));
            } else {
                executeStrictPull(syncMethod, target);
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

            try {
                // Check if sync needed...
                let shouldSync = true; // Simplified check for robustness
                if (syncMethod === 'api' && sheetId) {
                     // Optimization: Check Drive modifiedTime first if using API
                     const sheetModified = await sheetService.checkSheetModifiedTime(sheetId);
                     if (sheetModified && lastSyncTime && new Date(sheetModified) <= new Date(lastSyncTime)) {
                         shouldSync = false;
                     }
                }

                if (shouldSync) {
                    const target = syncMethod === 'api' ? sheetId! : appsScriptUrl!;
                    let data;
                    
                    if (syncMethod === 'api') data = await sheetService.syncDataFromSheet(target);
                    else {
                        const token = settingsRef.current?.googleAppsScriptToken;
                        data = await sheetService.syncDataFromAppsScript(target, token);
                    }

                    // Polling Logic: Only accept remote changes if they are distinctly newer
                    const { mergedTasks, hasRemoteChanges } = smartMergeTasks(localTasksRef.current, data.tasks, true);
                    
                    if (hasRemoteChanges) {
                        console.log("[Sync] Background update applied.");
                        isRemoteUpdate.current = true;
                        setAllData(mergedTasks, data.goals); // Simplified goal sync for polling
                        setLastSyncTime(new Date().toISOString());
                    }
                }
            } catch (e) {
                // Silent fail on poll
            }
        }, POLL_INTERVAL);

        return () => clearInterval(pollInterval);
    }, [syncMethod, sheetId, appsScriptUrl, lastSyncTime, status, setAllData]);

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
            // On Boot: Accept it (restore backup).
            // On Poll: Only accept if it's new/recent? No, usually accept to sync devices.
            taskMap.set(r.id, r);
            hasRemoteChanges = true;
        } else {
            // Task exists in both. Compare Timestamps.
            const localTime = new Date(l.lastModified).getTime();
            const remoteTime = new Date(r.lastModified).getTime();

            // Threshold to prevent jitter (1 second)
            if (remoteTime > localTime + 1000) {
                // Remote is significantly newer. Accept it.
                taskMap.set(r.id, r);
                hasRemoteChanges = true;
            } else if (localTime > remoteTime + 1000) {
                // Local is significantly newer. Keep Local.
                // This means the sheet is stale and needs an update.
                hasLocalWins = true;
            }
            // If timestamps are close, prefer Local (UI stability)
        }
    });

    return { 
        mergedTasks: Array.from(taskMap.values()), 
        hasLocalWins: !isPolling && hasLocalWins, // Only care about local wins during initial hydrate
        hasRemoteChanges 
    };
};

const smartMergeGoals = (local: Goal[], remote: Goal[]) => {
    const map = new Map<string, Goal>();
    local.forEach(g => map.set(g.id, g));
    remote.forEach(r => map.set(r.id, r)); // Simple overwrite for goals for now, usually fewer conflicts
    return Array.from(map.values());
};
