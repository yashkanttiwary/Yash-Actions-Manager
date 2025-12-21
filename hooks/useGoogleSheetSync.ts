
import { useState, useEffect, useCallback, useRef } from 'react';
import { Task } from '../types';
import * as sheetService from '../services/googleSheetService';

const POLL_INTERVAL = 5000; // Check for remote changes every 5s
const DEBOUNCE_DELAY = 3000; // Auto-save local changes after 3s

export const useGoogleSheetSync = (
    sheetId: string | undefined, 
    localTasks: Task[], 
    setLocalTasks: (tasks: Task[]) => void,
    isSignedIn: boolean,
    appsScriptUrl?: string
) => {
    const [status, setStatus] = useState<'idle' | 'syncing' | 'error' | 'success'>('idle');
    const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [syncMethod, setSyncMethod] = useState<'script' | 'api' | null>(null);
    
    // Refs to track state inside timers
    const localTasksRef = useRef(localTasks);
    const isDirtyRef = useRef(false);
    const debounceTimerRef = useRef<number | null>(null);
    
    // FLAG: Prevents the "Push" logic from firing when we just "Pulled" data
    const isRemoteUpdate = useRef(false);

    // Keep ref updated
    useEffect(() => {
        localTasksRef.current = localTasks;
    }, [localTasks]);

    // Determine active method
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

    // --- HELPER: Perform the Source-of-Truth Overwrite ---
    const executeStrictPull = useCallback(async (method: 'script' | 'api', idOrUrl: string) => {
        console.log(`[Sync] Executing Strict Pull via ${method}...`);
        let remoteTasks: Task[] = [];
        
        if (method === 'api') {
            remoteTasks = await sheetService.syncTasksFromSheet(idOrUrl);
        } else {
            remoteTasks = await sheetService.syncTasksFromAppsScript(idOrUrl);
        }

        console.log(`[Sync] Pulled ${remoteTasks.length} tasks. Overwriting local state.`);
        
        // CRITICAL: Mark this update as remote so we don't immediately push it back
        isRemoteUpdate.current = true;
        
        // Apply data (Source of Truth)
        setLocalTasks(remoteTasks);
        
        setLastSyncTime(new Date().toISOString());
        setStatus('success');
    }, [setLocalTasks]);


    // --- MANUAL ACTIONS ---

    // 1. PULL: Strict "Source of Truth" overwrite from Sheet -> App
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

    // 2. PUSH: Send App -> Sheet (Explicit User Action)
    const manualPush = useCallback(async () => {
        if (!syncMethod) return;
        setStatus('syncing');
        try {
            console.log("[Sync] Manual Push: Sending to Sheet...");
            if (syncMethod === 'api' && sheetId) {
                await sheetService.syncTasksToSheet(sheetId, localTasksRef.current);
            } else if (syncMethod === 'script' && appsScriptUrl) {
                await sheetService.syncTasksToAppsScript(appsScriptUrl, localTasksRef.current);
            }
            setLastSyncTime(new Date().toISOString());
            setStatus('success');
            isDirtyRef.current = false; // Clear dirty flag since we just saved
            console.log("[Sync] Manual Push: Complete.");
        } catch (e: any) {
            console.error("Manual Push Failed", e);
            setStatus('error');
            setErrorMsg(e.message || "Push failed");
        }
    }, [syncMethod, sheetId, appsScriptUrl]);


    // --- AUTOMATIC SYNC LOGIC ---

    // 1. Initial Load (STRICT PULL ONLY)
    useEffect(() => {
        if (!syncMethod) return;

        const init = async () => {
            try {
                setStatus('syncing');
                const target = syncMethod === 'api' ? sheetId! : appsScriptUrl!;
                
                // Initialize Headers (if API mode)
                if (syncMethod === 'api') {
                    await sheetService.initializeSheetHeaders(target);
                }

                // STRICT PULL: Always overwrite local on connect.
                // We do NOT check if remote is empty. If it's empty, we want the app to be empty.
                await executeStrictPull(syncMethod, target);

            } catch (e: any) {
                console.error("Sync Initialization Failed:", e);
                setStatus('error');
                setErrorMsg(e.message || "Failed to initialize sync");
            }
        };

        // Trigger init immediately when connection parameters change
        if ((syncMethod === 'script' && appsScriptUrl) || (syncMethod === 'api' && sheetId)) {
            init();
        }

    }, [syncMethod, sheetId, appsScriptUrl, executeStrictPull]); 

    // 2. Watch for Local Changes (Auto-Push)
    useEffect(() => {
        if (!syncMethod) return;

        // If this change was caused by a Remote Pull, IGNORE IT.
        if (isRemoteUpdate.current) {
            console.log("[Sync] Local change detected, but flagged as Remote Update. Skipping auto-push.");
            isRemoteUpdate.current = false; // Reset flag for next time
            return;
        }

        // Otherwise, it's a user edit. Queue a push.
        isDirtyRef.current = true;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        debounceTimerRef.current = window.setTimeout(async () => {
            if (!isDirtyRef.current) return;
            
            // If status is currently syncing (e.g. initial pull is still finishing), wait/retry?
            // For now, we proceed to ensure user edits are saved.
            
            // Reuse manualPush logic for consistency
            manualPush();
            
        }, DEBOUNCE_DELAY);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [localTasks, syncMethod, manualPush]);

    // 3. Polling for Remote Changes (Background Pull)
    // NOTE: User requested "Manual button to pull data". 
    // However, keeping background polling for *metadata* (detecting changes) is often good UX.
    // Given the strict "Source of Truth" requirement, auto-merging might be risky if it conflicts with local work.
    // DECISION: We will KEEP polling, but we will use the MERGE strategy purely to keep the UI fresh
    // without destroying active work. The Strict Init handles the "Blank Sheet" safety.
    useEffect(() => {
        if (!syncMethod) return;

        const pollInterval = setInterval(async () => {
            if (status === 'syncing' || isDirtyRef.current) return;

            try {
                let remoteTasks: Task[] = [];
                let shouldSync = false;

                if (syncMethod === 'api' && sheetId) {
                    const sheetModified = await sheetService.checkSheetModifiedTime(sheetId);
                    if (sheetModified && lastSyncTime && new Date(sheetModified) > new Date(lastSyncTime)) {
                        shouldSync = true;
                    }
                } else if (syncMethod === 'script' && appsScriptUrl) {
                    shouldSync = true; // Always check script
                }

                if (shouldSync) {
                    if (syncMethod === 'api' && sheetId) {
                         remoteTasks = await sheetService.syncTasksFromSheet(sheetId);
                    } else if (syncMethod === 'script' && appsScriptUrl) {
                         remoteTasks = await sheetService.syncTasksFromAppsScript(appsScriptUrl);
                    }

                    // For polling, we use a smart merge to avoid disrupting the user
                    const merged = mergeTasks(localTasksRef.current, remoteTasks);
                    
                    if (JSON.stringify(merged) !== JSON.stringify(localTasksRef.current)) {
                        console.log("[Sync] Background poll found changes. Merging...");
                        isRemoteUpdate.current = true; // Prevent push-back
                        setLocalTasks(merged);
                        setLastSyncTime(new Date().toISOString());
                        setStatus('success'); 
                    }
                }
            } catch (e) {
                console.error("Poll failed", e);
            }
        }, POLL_INTERVAL);

        return () => clearInterval(pollInterval);
    }, [syncMethod, sheetId, appsScriptUrl, lastSyncTime, status, setLocalTasks]);

    return { status, lastSyncTime, errorMsg, syncMethod, manualPull, manualPush };
};

// --- UTILS ---

const mergeTasks = (local: Task[], remote: Task[]): Task[] => {
    const taskMap = new Map<string, Task>();
    local.forEach(t => taskMap.set(t.id, t));
    remote.forEach(r => {
        const l = taskMap.get(r.id);
        if (!l) {
            taskMap.set(r.id, r);
        } else {
            const localMod = new Date(l.lastModified).getTime();
            const remoteMod = new Date(r.lastModified).getTime();
            // If remote is newer, update. 
            // Note: This matches the "Sheet is Truth" philosophy for external edits.
            if (remoteMod > localMod + 2000) {
                taskMap.set(r.id, r);
            }
        }
    });
    return Array.from(taskMap.values());
};
