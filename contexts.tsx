
import React, { createContext, useContext, ReactNode, useMemo, useEffect, useState } from 'react';
import { useTaskManager } from './hooks/useTaskManager';
import { useSettings } from './hooks/useSettings';
import { useGoogleSheetSync } from './hooks/useGoogleSheetSync';
import { initGoogleClient, signIn, signOut } from './services/googleAuthService';
import { getEnvVar } from './utils/env';
import { Settings, Task, Goal, ColumnLayout, Status, GamificationData, ConnectionHealth } from './types';

// --- SETTINGS CONTEXT ---
interface SettingsContextType {
    settings: Settings;
    updateSettings: (s: Partial<Settings>) => void;
    loaded: boolean;
}
const SettingsContext = createContext<SettingsContextType | null>(null);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { settings, updateSettings, loaded } = useSettings();
    return (
        <SettingsContext.Provider value={{ settings, updateSettings, loaded }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettingsContext = () => {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new Error("useSettingsContext must be used within SettingsProvider");
    return ctx;
};

// --- AUTH CONTEXT ---
interface AuthContextType {
    googleAuth: {
        gapiLoaded: boolean;
        gisLoaded: boolean;
        isSignedIn: boolean;
        error?: Error;
        disabled?: boolean;
    };
    signIn: () => Promise<void>;
    signOut: () => void;
}
const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { settings, loaded } = useSettingsContext();
    const [googleAuth, setGoogleAuth] = useState({
        gapiLoaded: false,
        gisLoaded: false,
        isSignedIn: false,
        disabled: false,
        error: undefined as Error | undefined
    });

    useEffect(() => {
        if (!loaded) return;
        const init = async () => {
            try {
                const { gapiLoaded, gisLoaded, disabled } = await initGoogleClient(settings.googleApiKey, settings.googleClientId);
                if (disabled) {
                    setGoogleAuth(prev => ({ ...prev, disabled: true }));
                } else {
                    const token = gapi.client.getToken();
                    setGoogleAuth(prev => ({ ...prev, gapiLoaded, gisLoaded, isSignedIn: token !== null }));
                }
            } catch (error: any) {
                setGoogleAuth(prev => ({ ...prev, error: new Error("Could not connect to Google services.") }));
            }
        };
        setTimeout(init, 500);
    }, [settings.googleApiKey, settings.googleClientId, loaded]);

    const handleSignIn = async () => {
        try {
            await signIn();
            setGoogleAuth(prev => ({ ...prev, isSignedIn: true }));
        } catch (error) {
            console.error("Sign in failed", error);
        }
    };

    const handleSignOut = () => {
        signOut();
        setGoogleAuth(prev => ({ ...prev, isSignedIn: false }));
    };

    return (
        <AuthContext.Provider value={{ googleAuth, signIn: handleSignIn, signOut: handleSignOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
    return ctx;
};

// --- TASK CONTEXT ---
// This lifts the return type of useTaskManager + Sync state
interface TaskContextType {
    tasks: Task[];
    deletedTasks: Task[];
    goals: Goal[];
    columns: Status[];
    columnLayouts: ColumnLayout[];
    addTask: (taskData: Partial<Task> & { title: string; status: Status; priority: any; dueDate: string }) => Task;
    updateTask: (updatedTask: Task) => void;
    deleteTask: (taskId: string) => void;
    restoreTask: (taskId: string) => void;
    permanentlyDeleteTask: (taskId: string) => void;
    emptyTrash: () => void;
    moveTask: (taskId: string, newStatus: Status, newIndex: number) => void;
    toggleTaskPin: (taskId: string) => any;
    reorderPinnedTasks: (active: string, over: string) => void;
    getTasksByStatus: (status: Status) => Task[];
    addGoal: (goal: any) => string;
    updateGoal: (goal: Goal) => void;
    deleteGoal: (id: string) => void;
    updateColumnLayout: (id: Status, layout: any) => void;
    resetColumnLayouts: () => void;
    isLoading: boolean;
    activeTaskTimer: { taskId: string; startTime: number } | null;
    toggleTimer: (taskId: string) => void;
    
    // Sync Exposed
    syncStatus: 'idle' | 'syncing' | 'error' | 'success';
    manualPull: () => Promise<void>;
    manualPush: () => Promise<void>;
    connectionHealth: ConnectionHealth;
}

const TaskContext = createContext<TaskContextType | null>(null);

export const TaskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { settings, updateSettings, loaded: settingsLoaded } = useSettingsContext();
    const { googleAuth } = useAuthContext();

    const isSheetConfigured = !!(settings.googleSheetId || settings.googleAppsScriptUrl);
    
    // Core Logic - Always load tasks if settings are loaded, regardless of sheet config
    // This restores "Local First" functionality
    const taskManager = useTaskManager(settingsLoaded);
    
    // Helper for Timer
    const activeTaskTimer = useMemo(() => {
        const activeTask = taskManager.tasks.find(t => t.currentSessionStartTime);
        return activeTask ? { taskId: activeTask.id, startTime: activeTask.currentSessionStartTime! } : null;
    }, [taskManager.tasks]);

    const toggleTimer = (taskId: string) => {
        const now = Date.now();
        const currentlyActive = taskManager.tasks.find(t => t.currentSessionStartTime);
        if (currentlyActive) {
            const dur = now - currentlyActive.currentSessionStartTime!;
            taskManager.updateTask({
                ...currentlyActive,
                actualTimeSpent: (currentlyActive.actualTimeSpent || 0) + Math.round(dur / 1000),
                currentSessionStartTime: null
            });
            if (currentlyActive.id === taskId) return;
        }
        const target = taskManager.tasks.find(t => t.id === taskId);
        if (target) taskManager.updateTask({ ...target, currentSessionStartTime: now });
    };

    // Sync Logic - Only runs if sheet IS configured
    const shouldSync = settingsLoaded && isSheetConfigured && !taskManager.isLoading;
    
    const { status: syncStatus, errorMsg: syncError, syncMethod, manualPull, manualPush } = useGoogleSheetSync(
        shouldSync ? settings.googleSheetId : undefined,
        taskManager.tasks,
        taskManager.setAllData,
        googleAuth.isSignedIn,
        shouldSync ? settings.googleAppsScriptUrl : undefined,
        undefined, // Gamification managed in Header usually, but could be moved. For now, skipping deeply nested state.
        settings,
        undefined,
        updateSettings,
        taskManager.goals
    );

    // Health Logic
    const connectionHealth: ConnectionHealth = useMemo(() => {
        const h: ConnectionHealth = {
            auth: { status: 'loading' },
            sheet: { status: 'pending' },
            calendar: { status: 'pending' },
            api: { status: 'missing' }
        };
        
        const isScript = !!settings.googleAppsScriptUrl;
        
        if (isScript) {
            h.auth = { status: 'optional', message: 'Script Mode' };
            h.api = { status: 'configured', message: 'Script Mode' };
        } else {
            h.auth = googleAuth.disabled ? { status: 'optional' } : 
                     googleAuth.isSignedIn ? { status: 'connected', message: 'Signed In' } : 
                     { status: 'disconnected', message: 'Sign In Required' };
        }

        if (syncStatus === 'error') h.sheet = { status: 'error', message: syncError || 'Failed' };
        else if (!settings.googleSheetId && !settings.googleAppsScriptUrl) h.sheet = { status: 'pending', message: 'Not Configured' };
        else h.sheet = { status: 'connected', message: syncStatus === 'syncing' ? 'Syncing...' : 'Connected' };

        return h;
    }, [googleAuth, settings, syncStatus, syncError]);

    return (
        <TaskContext.Provider value={{
            ...taskManager,
            activeTaskTimer,
            toggleTimer,
            syncStatus,
            manualPull,
            manualPush,
            connectionHealth
        }}>
            {children}
        </TaskContext.Provider>
    );
};

export const useTaskContext = () => {
    const ctx = useContext(TaskContext);
    if (!ctx) throw new Error("useTaskContext must be used within TaskProvider");
    return ctx;
};
        