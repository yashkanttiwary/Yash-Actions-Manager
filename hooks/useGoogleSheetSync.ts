
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
    
    const isRemoteUpdate = useRef(false);

    useEffect(() => {
        localTasksRef.current = localTasks;
        gamificationRef.current = gamification;
        settingsRef.current = settings;
    }, [localTasks, gamification, settings]);

    useEffect(() => {
        if (appsScriptUrl) {
            setSyncMethod('script');
        } else if (sheetId && isSignedIn) {
            setSyncMethod('api');
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
                // Merge settings to preserve local-only keys if any (like audio volume maybe? no, sync that too)
                setSettings(remoteMetadata.settings);
            }
        }
        
        setLastSyncTime(new Date().toISOString());
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
        setStatus('syncing');
        try {
            console.log("[Sync] Manual Push: Sending data...");
            
            // Prepare Metadata
            const metadata = {
                gamification: gamificationRef.current,
                settings: settingsRef.current
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
        // Run init if configured
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

        isDirtyRef.current = true;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        debounceTimerRef.current = window.setTimeout(async () => {
            if (!isDirtyRef.current) return;
            manualPush();
        }, DEBOUNCE_DELAY);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [localTasks, gamification, settings, syncMethod, manualPush]);

    // Polling
    useEffect(() => {
        if (!syncMethod) return;

        const pollInterval = setInterval(async () => {
            if (status === 'syncing' || isDirtyRef.current) return;

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
                    
                    // Simple check for metadata diff (can be improved)
                    const metadataChanged = JSON.stringify(remoteMetadata) !== JSON.stringify({gamification: gamificationRef.current, settings: settingsRef.current});
                    const tasksChanged = JSON.stringify(mergedTasks) !== JSON.stringify(localTasksRef.current);

                    if (tasksChanged || (metadataChanged && remoteMetadata)) {
                        console.log("[Sync] Background update found.");
                        isRemoteUpdate.current = true;
                        if(tasksChanged) setLocalTasks(mergedTasks);
                        
                        // Update metadata if it exists remotely
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
            if (remoteMod > lastSyncMs - 5000) {
                taskMap.set(r.id, r);
            }
        } else {
            const localMod = new Date(l.lastModified).getTime();
            if (remoteMod > localMod + 2000) {
                taskMap.set(r.id, r);
            }
        }
    });
    return Array.from(taskMap.values());
};
