
import { useState, useEffect, useCallback, useRef } from 'react';
import { Task, GamificationData, Settings, Goal } from '../types';
import * as sheetService from '../services/googleSheetService';

const POLL_INTERVAL = 5000; // 5s poll
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

            const metadata = {
                gamification: gamificationRef.current,
                settings: safeSettings
            };

            if (syncMethod === 'api' && sheetId) {
                await sheetService.syncDataToSheet(sheetId, localTasksRef.current, localGoalsRef.current, metadata);
            } else if (syncMethod === 'script' && appsScriptUrl) {
                await sheetService.syncDataToAppsScript(appsScriptUrl, localTasksRef.current, localGoalsRef.current, metadata);
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
                const data = await sheetService.syncDataFromAppsScript(idOrUrl);
                remoteTasks = data.tasks;
                remoteGoals = data.goals;
                remoteMetadata = data.metadata;
            }

            // SMART MERGE: Compare Remote vs Local
            // We use the current refs because they contain what was loaded from localStorage on boot
            const currentLocalTasks = localTasksRef.current;
            const currentLocalGoals = localGoalsRef.current;

            // 1. Merge Tasks (High Water Mark logic for deletions)
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
                        data = await sheetService.syncDataFromAppsScript(target);
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

    // Use manualPull for forcePull as a simple alias since strict replacement is not implemented in this version of executeStrictPull
    return { status, lastSyncTime, errorMsg, syncMethod, manualPull, manualPush, forcePull: manualPull };
};

// --- HELPER: Smart Merge with High Water Mark ---
// Returns merged list AND boolean if local data "won" (implies sheet is stale)
const smartMergeTasks = (local: Task[], remote: Task[], isPolling = false): { mergedTasks: Task[], hasLocalWins: boolean, hasRemoteChanges: boolean } => {
    const taskMap = new Map<string, Task>();
    let hasLocalWins = false;
    let hasRemoteChanges = false;

    // Calculate Remote High Water Mark (Timestamp of the latest activity on the server)
    let remoteHighWaterMark = 0;
    if (remote.length > 0) {
        remoteHighWaterMark = Math.max(...remote.map(t => new Date(t.lastModified).getTime()));
    }

    // 1. Process Remote Tasks First (Server Authority base)
    remote.forEach(r => {
        taskMap.set(r.id, r);
        
        // Polling check: Is this remote task effectively new to us?
        const l = local.find(t => t.id === r.id);
        if (!l) {
            hasRemoteChanges = true;
        } else {
            const remoteTime = new Date(r.lastModified).getTime();
            const localTime = new Date(l.lastModified).getTime();
            if (remoteTime > localTime + 1000) {
                hasRemoteChanges = true;
            }
        }
    });

    // 2. Process Local Tasks (Merge or Discard Stale)
    local.forEach(l => {
        const r = taskMap.get(l.id);
        
        if (r) {
            // Task exists in both: Conflict Resolution by Timestamp
            const localTime = new Date(l.lastModified).getTime();
            const remoteTime = new Date(r.lastModified).getTime();

            // Threshold to prevent jitter (1 second)
            if (localTime > remoteTime + 1000) {
                // Local is significantly newer. Keep Local.
                taskMap.set(l.id, l);
                hasLocalWins = true; 
            }
            // Else: Remote is newer or equal. Keep Remote (already in map).
        } else {
            // ORPHAN: Task is in Local but NOT in Remote.
            // This is where "Ghost Task" logic applies.
            
            const localTime = new Date(l.lastModified).getTime();

            // HEURISTIC:
            // If polling (background), be conservative and keep everything to avoid deleting active work during race conditions.
            // If NOT polling (Boot/Manual Pull), filter out "Stale" tasks.
            
            // "Stale" definition: If the local task is OLDER than the latest activity on the server, 
            // it implies the server state has moved past this task (i.e., it was deleted).
            // If the local task is NEWER than the server's latest activity, it's likely a new task created offline.
            
            if (isPolling || localTime >= remoteHighWaterMark) {
                taskMap.set(l.id, l);
                // If we are keeping a local orphan during manual pull, it's a "Win" that needs pushing.
                if (!isPolling) hasLocalWins = true;
            } else {
                // DROP IT. It's an old task that doesn't exist on server. 
                // This cleans up "Old deleted tasks" that persist in local storage.
            }
        }
    });

    return { 
        mergedTasks: Array.from(taskMap.values()), 
        hasLocalWins: !isPolling && hasLocalWins, // Only care about local wins during initial hydrate to trigger repair push
        hasRemoteChanges 
    };
};

const smartMergeGoals = (local: Goal[], remote: Goal[]) => {
    const map = new Map<string, Goal>();
    local.forEach(g => map.set(g.id, g));
    remote.forEach(r => map.set(r.id, r)); // Simple overwrite for goals for now, usually fewer conflicts
    return Array.from(map.values());
};
