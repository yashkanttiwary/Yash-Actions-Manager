
import { useState, useEffect, useCallback, useRef } from 'react';
import { Task, GamificationData, Settings } from '../types';
import * as sheetService from '../services/googleSheetService';

const POLL_INTERVAL = 5000;
const DEBOUNCE_DELAY = 1500;

export const useGoogleSheetSync = (
    sheetId: string | undefined, 
    localTasks: Task[], 
    setLocalTasks: (tasks: Task[]) => void,
    isSignedIn: boolean,
    appsScriptUrl?: string,
    gamification?: GamificationData,
    settings?: Settings,
    setGamification?: (data: GamificationData) => void,
    setSettings?: (settings: Settings) => void
) => {
    const [status, setStatus] = useState<'idle' | 'syncing' | 'error' | 'success'>('idle');
    const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [syncMethod, setSyncMethod] = useState<'script' | 'api' | null>(null);
    
    // Refs to track state inside timers
    const localTasksRef = useRef(localTasks);
    const gamificationRef = useRef(gamification);
    const settingsRef = useRef(settings);
    const isDirtyRef = useRef(false);
    const debounceTimerRef = useRef<number | null>(null);
    
    // SAFETY: This flag ensures we NEVER push to the sheet until we have successfully
    // pulled from it at least once in this session. This prevents wiping the sheet
    // if the local app initializes with empty data (e.g. after clearing cookies).
    const initialPullComplete = useRef(false);
    
    const isRemoteUpdate = useRef(false);

    useEffect(() => {
        localTasksRef.current = localTasks;
        gamificationRef.current = gamification;
        settingsRef.current = settings;
    }, [localTasks, gamification, settings]);

    // Reset safety lock when connection details change
    useEffect(() => {
        if (appsScriptUrl) {
            setSyncMethod('script');
            // New connection? Reset lock. Pull must happen first.
            initialPullComplete.current = false;
        } else if (sheetId && isSignedIn) {
            setSyncMethod('api');
            // New connection? Reset lock. Pull must happen first.
            initialPullComplete.current = false;
        } else {
            setSyncMethod(null);
            setStatus('idle');
        }
    }, [appsScriptUrl, sheetId, isSignedIn]);

    const executeStrictPull = useCallback(async (method: 'script' | 'api', idOrUrl: string) => {
        console.log(`[Sync] Executing Strict Pull via ${method}...`);
        let remoteTasks: Task[] = [];
        let remoteMetadata: any = null;
        
        if (method === 'api') {
            const data = await sheetService.syncDataFromSheet(idOrUrl);
            remoteTasks = data.tasks;
            remoteMetadata = data.metadata;
        } else {
            const data = await sheetService.syncDataFromAppsScript(idOrUrl);
            remoteTasks = data.tasks;
            remoteMetadata = data.metadata;
        }

        console.log(`[Sync] Pulled ${remoteTasks.length} tasks. Metadata present: ${!!remoteMetadata}`);
        
        isRemoteUpdate.current = true;
        
        setLocalTasks(remoteTasks);
        
        // Restore Metadata if present
        if (remoteMetadata) {
            if (remoteMetadata.gamification && setGamification) {
                setGamification(remoteMetadata.gamification);
            }
            if (remoteMetadata.settings && setSettings) {
                setSettings(remoteMetadata.settings);
            }
        }
        
        setLastSyncTime(new Date().toISOString());
        
        // SAFETY: Only NOW do we allow pushes. We know the current state of the sheet.
        initialPullComplete.current = true;
        
        setStatus('success');
    }, [setLocalTasks, setGamification, setSettings]);

    const manualPull = useCallback(async () => {
        if (!syncMethod) return;
        setStatus('syncing');
        try {
            const target = syncMethod === 'api' ? sheetId! : appsScriptUrl!;
            await executeStrictPull(syncMethod, target);
        } catch (e: any) {
            console.error("Manual Pull Failed", e);
            setStatus('error');
            setErrorMsg(e.message || "Pull failed");
        }
    }, [syncMethod, sheetId, appsScriptUrl, executeStrictPull]);

    const manualPush = useCallback(async () => {
        if (!syncMethod) return;
        
        // SAFETY GUARD: Block push if we haven't pulled yet
        if (!initialPullComplete.current) {
            console.warn("[Sync] Safety Guard: Push blocked because initial pull is not complete.");
            return;
        }

        setStatus('syncing');
        try {
            console.log("[Sync] Manual Push: Sending data...");
            
            // Prepare Metadata - FIX SEC-001: Sanitize sensitive keys
            const safeSettings = { ...(settingsRef.current || {}) };
            delete safeSettings.geminiApiKey;
            delete safeSettings.googleApiKey;
            delete safeSettings.googleClientId;

            const metadata = {
                gamification: gamificationRef.current,
                settings: safeSettings
            };

            if (syncMethod === 'api' && sheetId) {
                await sheetService.syncDataToSheet(sheetId, localTasksRef.current, metadata);
            } else if (syncMethod === 'script' && appsScriptUrl) {
                await sheetService.syncDataToAppsScript(appsScriptUrl, localTasksRef.current, metadata);
            }
            setLastSyncTime(new Date().toISOString());
            setStatus('success');
            isDirtyRef.current = false;
            console.log("[Sync] Push Complete.");
        } catch (e: any) {
            console.error("Manual Push Failed", e);
            setStatus('error');
            setErrorMsg(e.message || "Push failed");
        }
    }, [syncMethod, sheetId, appsScriptUrl]);

    // Initial Load
    useEffect(() => {
        if (!syncMethod) return;
        const init = async () => {
            try {
                setStatus('syncing');
                const target = syncMethod === 'api' ? sheetId! : appsScriptUrl!;
                if (syncMethod === 'api') await sheetService.initializeSheetHeaders(target);
                await executeStrictPull(syncMethod, target);
            } catch (e: any) {
                console.error("Sync Initialization Failed:", e);
                setStatus('error');
                setErrorMsg(e.message || "Failed to initialize sync");
            }
        };
        // Run init if configured.
        // This will run executeStrictPull, which eventually sets initialPullComplete.current = true
        if ((syncMethod === 'script' && appsScriptUrl) || (syncMethod === 'api' && sheetId)) {
            init();
        }
    }, [syncMethod, sheetId, appsScriptUrl, executeStrictPull]); 

    // Auto-Push Watcher (Tasks, Gamification, Settings)
    useEffect(() => {
        if (!syncMethod) return;

        if (isRemoteUpdate.current) {
            isRemoteUpdate.current = false;
            return;
        }
        
        // SAFETY GUARD: If we haven't pulled yet, do NOT even queue a push.
        if (!initialPullComplete.current) {
            return;
        }

        // RACE CONDITION FIX: Do not queue updates if already syncing
        if (status === 'syncing') {
            return;
        }

        isDirtyRef.current = true;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        debounceTimerRef.current = window.setTimeout(async () => {
            if (!isDirtyRef.current) return;
            manualPush();
        }, DEBOUNCE_DELAY);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [localTasks, gamification, settings, syncMethod, manualPush, status]);

    // Polling
    useEffect(() => {
        if (!syncMethod) return;

        const pollInterval = setInterval(async () => {
            // Block polling if syncing, dirty, OR if we haven't even finished the first pull yet
            if (status === 'syncing' || isDirtyRef.current || !initialPullComplete.current) return;

            try {
                let shouldSync = false;
                if (syncMethod === 'api' && sheetId) {
                    const sheetModified = await sheetService.checkSheetModifiedTime(sheetId);
                    if (sheetModified && lastSyncTime && new Date(sheetModified) > new Date(lastSyncTime)) {
                        shouldSync = true;
                    }
                } else if (syncMethod === 'script' && appsScriptUrl) {
                    shouldSync = true;
                }

                if (shouldSync) {
                    let remoteTasks: Task[] = [];
                    let remoteMetadata: any = null;

                    if (syncMethod === 'api' && sheetId) {
                         const data = await sheetService.syncDataFromSheet(sheetId);
                         remoteTasks = data.tasks;
                         remoteMetadata = data.metadata;
                    } else if (syncMethod === 'script' && appsScriptUrl) {
                         const data = await sheetService.syncDataFromAppsScript(appsScriptUrl);
                         remoteTasks = data.tasks;
                         remoteMetadata = data.metadata;
                    }

                    const mergedTasks = mergeTasks(localTasksRef.current, remoteTasks, lastSyncTime);
                    
                    const metadataChanged = JSON.stringify(remoteMetadata) !== JSON.stringify({gamification: gamificationRef.current, settings: settingsRef.current});
                    const tasksChanged = JSON.stringify(mergedTasks) !== JSON.stringify(localTasksRef.current);

                    if (tasksChanged || (metadataChanged && remoteMetadata)) {
                        console.log("[Sync] Background update found.");
                        isRemoteUpdate.current = true;
                        if(tasksChanged) setLocalTasks(mergedTasks);
                        
                        if (remoteMetadata) {
                            if(setGamification) setGamification(remoteMetadata.gamification);
                            if(setSettings) setSettings(remoteMetadata.settings);
                        }

                        setLastSyncTime(new Date().toISOString());
                        setStatus('success'); 
                    }
                }
            } catch (e) {
                console.error("Poll failed", e);
            }
        }, POLL_INTERVAL);

        return () => clearInterval(pollInterval);
    }, [syncMethod, sheetId, appsScriptUrl, lastSyncTime, status, setLocalTasks, setGamification, setSettings]);

    return { status, lastSyncTime, errorMsg, syncMethod, manualPull, manualPush };
};

const mergeTasks = (local: Task[], remote: Task[], lastSyncTime: string | null): Task[] => {
    const taskMap = new Map<string, Task>();
    local.forEach(t => taskMap.set(t.id, t));
    const lastSyncMs = lastSyncTime ? new Date(lastSyncTime).getTime() : 0;

    remote.forEach(r => {
        const l = taskMap.get(r.id);
        const remoteMod = new Date(r.lastModified).getTime();

        if (!l) {
            // If remote task is newer than last sync, add it
            if (remoteMod > lastSyncMs - 5000) {
                taskMap.set(r.id, r);
            }
        } else {
            // Conflict resolution: Remote wins if significantly newer
            const localMod = new Date(l.lastModified).getTime();
            if (remoteMod > localMod + 2000) {
                taskMap.set(r.id, r);
            }
        }
    });
    return Array.from(taskMap.values());
};
