
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { KanbanBoard } from './components/KanbanBoard';
import { Header } from './components/Header';
import { useTaskManager } from './hooks/useTaskManager';
import { Task, Status, Priority, GamificationData, Settings, Blocker, ConnectionHealth, SettingsTab } from './types';
import { EditTaskModal } from './components/EditTaskModal';
import { BlockerModal } from './components/BlockerModal';
import { ResolveBlockerModal } from './components/ResolveBlockerModal';
import { AIAssistantModal } from './components/AIAssistantModal';
import { CalendarView } from './components/CalendarView';
import { manageTasksWithAI, generateTaskSummary } from './services/geminiService';
import { PomodoroTimer } from './components/PomodoroTimer';
import { initGoogleClient, signIn, signOut } from './services/googleAuthService';
import { COLUMN_STATUSES } from './constants';
import { ShortcutsModal } from './components/ShortcutsModal';
import { IntegrationsModal } from './components/IntegrationsModal';
import { useGoogleSheetSync } from './hooks/useGoogleSheetSync';
import { checkCalendarConnection } from './services/googleCalendarService'; 
import { playCompletionSound, resumeAudioContext } from './utils/audio'; // Import Audio Utility
import { storage } from './utils/storage'; // Import Centralized Storage
import { useBackgroundAudio } from './hooks/useBackgroundAudio'; // New Audio Hook

// This is a global declaration for the confetti library loaded from CDN
declare const confetti: any;

// --- COOKIE HELPERS ---
const setCookie = (name: string, value: string, days: number) => {
    try {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Strict';
    } catch (e) {
        console.error("Failed to set cookie", e);
    }
}

const getCookie = (name: string) => {
    try {
        return document.cookie.split('; ').reduce((r, v) => {
            const parts = v.split('=');
            return parts[0].trim() === name ? decodeURIComponent(parts[1]) : r
        }, '');
    } catch (e) {
        return '';
    }
}


interface GoogleAuthState {
    gapiLoaded: boolean;
    gisLoaded: boolean;
    isSignedIn: boolean;
    error?: Error;
    disabled?: boolean;
}

// --- NEW COMPONENT: Connect Placeholder ---
const ConnectSheetPlaceholder: React.FC<{ onConnect: () => void }> = ({ onConnect }) => (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-fadeIn">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border-2 border-dashed border-gray-300 dark:border-gray-700 max-w-md w-full">
            <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-6">
                <i className="fas fa-table text-4xl"></i>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Connect Your Sheet</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
                To enable the Task Manager, you must connect a Google Sheet. This acts as your secure, permanent database.
            </p>
            <button 
                onClick={onConnect}
                className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-indigo-500/30 flex items-center justify-center gap-2"
            >
                <i className="fas fa-link"></i> Connect Now
            </button>
        </div>
    </div>
);

const App: React.FC = () => {
    // 1. Load Settings & Theme FIRST
    const [theme, setTheme] = useState('light'); 
    const [isCompactMode, setIsCompactMode] = useState(false); // Default to FALSE (Full View)
    const [zoomLevel, setZoomLevel] = useState(1); // Default Zoom Level (1 = 100%)

    const [settings, setSettings] = useState<Settings>({
        dailyBudget: 16,
        timezone: 'Asia/Kolkata',
        pomodoroFocus: 25,
        pomodoroShortBreak: 5,
        pomodoroLongBreak: 15,
        showPomodoroTimer: false,
        googleSheetId: '',
        googleAppsScriptUrl: '',
        googleCalendarId: 'primary',
        // Default Audio Settings
        audio: {
            enabled: true, // Default ON
            mode: 'brown_noise',
            volume: 0.5,
            loopMode: 'all',
            playlist: []
        }
    });
    const [settingsLoaded, setSettingsLoaded] = useState(false);

    // 2. Determine if we are configured. 
    // This gate controls whether useTaskManager even ATTEMPTS to load data.
    const isSheetConfigured = useMemo(() => {
        return !!(settings.googleSheetId || settings.googleAppsScriptUrl);
    }, [settings.googleSheetId, settings.googleAppsScriptUrl]);

    // 3. Initialize Task Manager (With Loading Gate)
    const {
        tasks,
        columns,
        columnLayouts,
        addTask,
        updateTask,
        deleteTask,
        moveTask,
        setAllTasks,
        getTasksByStatus,
        updateColumnLayout,
        resetColumnLayouts,
        isLoading,
        error
    } = useTaskManager(settingsLoaded && isSheetConfigured);

    // --- BACKGROUND AUDIO HOOK ---
    // Manages the actual playback logic based on settings
    const audioControls = useBackgroundAudio(settings.audio);

    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [blockingTask, setBlockingTask] = useState<Task | null>(null);
    const [resolvingBlockerTask, setResolvingBlockerTask] = useState<{ task: Task; newStatus: Status; newIndex: number } | null>(null);
    const [isTodayView, setIsTodayView] = useState<boolean>(false);
    const [showBreakReminder, setShowBreakReminder] = useState<boolean>(false);
    const [showAIModal, setShowAIModal] = useState(false);
    const [isAIProcessing, setIsAIProcessing] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    
    // Integrations Modal State
    const [showIntegrationsModal, setShowIntegrationsModal] = useState(false);
    const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('general');
    
    const [viewMode, setViewMode] = useState<'kanban' | 'calendar'>('kanban');
    const [focusMode, setFocusMode] = useState<Status | 'None'>('None');
    
    // Derived active timer from tasks to ensure persistence (HIGH-002)
    const activeTaskTimer = useMemo(() => {
        const activeTask = tasks.find(t => t.currentSessionStartTime);
        return activeTask ? { taskId: activeTask.id, startTime: activeTask.currentSessionStartTime! } : null;
    }, [tasks]);

    const [gamification, setGamification] = useState<GamificationData>({
        xp: 0,
        level: 1,
        streak: { current: 0, longest: 0, lastCompletionDate: null }
    });
    
    const [showLevelUp, setShowLevelUp] = useState(false);
    const [leveledUpTo, setLeveledUpTo] = useState(0);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: Task } | null>(null);
    const [showShortcutsModal, setShowShortcutsModal] = useState(false);


    const [googleAuth, setGoogleAuth] = useState<GoogleAuthState>({
        gapiLoaded: false,
        gisLoaded: false,
        isSignedIn: false,
        disabled: false,
    });

    // --- SYSTEM HEALTH MONITORING STATE ---
    const [connectionHealth, setConnectionHealth] = useState<ConnectionHealth>({
        auth: { status: 'loading', message: 'Initializing...' },
        sheet: { status: 'pending', message: 'Not configured' },
        calendar: { status: 'pending', message: 'Not configured' },
        api: { status: 'missing', message: 'API Keys missing' }
    });
    
    // Initialize Google Clients
    useEffect(() => {
        const initialize = async () => {
            try {
                const { gapiLoaded, gisLoaded, disabled } = await initGoogleClient(settings.googleApiKey, settings.googleClientId);
                
                if (disabled) {
                    setGoogleAuth(prev => ({ ...prev, disabled: true }));
                    if (!settings.googleAppsScriptUrl) {
                        setConnectionHealth(prev => ({...prev, api: { status: 'missing', message: 'Keys missing' }}));
                    } else {
                         setConnectionHealth(prev => ({...prev, api: { status: 'configured', message: 'Not needed for Script Mode' }}));
                    }
                } else {
                    const token = gapi.client.getToken();
                    const isSignedIn = token !== null;
                    setGoogleAuth(prev => ({ 
                        ...prev, 
                        gapiLoaded, 
                        gisLoaded,
                        isSignedIn 
                    }));
                    setConnectionHealth(prev => ({...prev, api: { status: 'configured', message: 'Keys valid' }}));
                }
            } catch (error: any) {
                console.error("Error initializing Google clients:", error);
                setGoogleAuth(prev => ({...prev, error: new Error("Could not connect to Google services.") }));
                setConnectionHealth(prev => ({...prev, api: { status: 'missing', message: 'Initialization failed' }}));
            }
        };
        setTimeout(initialize, 500); 
    }, [settings.googleApiKey, settings.googleClientId, settings.googleAppsScriptUrl]);

    // FIX CRIT-001: Load/Save theme, settings, and gamification data from/to window.storage
    useEffect(() => {
        const loadPersistedData = async () => {
            try {
                const savedTheme = await storage.get('theme');
                if (savedTheme) setTheme(savedTheme);
                else setTheme('light');

                // Note: We deliberately do NOT load isCompactMode here to ensure it defaults to false (Full View)
                // per user request.

                // Try to load settings from storage
                const savedSettings = await storage.get('taskMasterSettings_v2'); // Use v2 key to reset any corrupted state
                
                // Try to load backup URL from cookie
                const cookieUrl = getCookie('tm_script_url');

                if (savedSettings) {
                     const parsedSettings = JSON.parse(savedSettings);
                     // Helper to merge nested audio settings safely
                     const mergedAudio = { ...settings.audio, ...(parsedSettings.audio || {}) };
                     
                     setSettings(prev => ({
                         ...prev, 
                         ...parsedSettings,
                         audio: mergedAudio,
                         // If storage URL is empty but cookie has one, prefer cookie (restore logic)
                         googleAppsScriptUrl: parsedSettings.googleAppsScriptUrl || cookieUrl || prev.googleAppsScriptUrl
                     }));
                } else if (cookieUrl) {
                    // Fallback: If no storage settings but we have a cookie, restore connection
                    console.log("Restoring connection from Cookie...");
                    setSettings(prev => ({ ...prev, googleAppsScriptUrl: cookieUrl }));
                }

                const savedGamification = await storage.get('taskMasterGamification');
                if (savedGamification) setGamification(JSON.parse(savedGamification));
            
            } catch (e) {
                console.error("Error loading persisted data", e);
            } finally {
                setSettingsLoaded(true);
            }
        };
        loadPersistedData();
    }, []);

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'light') {
            root.classList.remove('dark');
        } else {
            root.classList.add('dark');
        }
        storage.set('theme', theme);
    }, [theme]);

    useEffect(() => {
        if (settingsLoaded) {
            const saveSettings = async () => {
                try {
                    await storage.set('taskMasterSettings_v2', JSON.stringify(settings));
                    
                    // Logic for Cookie Management
                    if (settings.googleAppsScriptUrl) {
                         // Redundantly save the Script URL to a cookie for safety
                        setCookie('tm_script_url', settings.googleAppsScriptUrl, 365);
                    } else {
                        // EXPLICITLY REMOVE COOKIE IF URL IS CLEARED (Disconnect)
                        setCookie('tm_script_url', '', -1);
                    }

                } catch (e) {
                    console.error("Failed to save settings", e);
                }
            };
            saveSettings();
        }
    }, [settings, settingsLoaded]);

    useEffect(() => {
        storage.set('taskMasterGamification', JSON.stringify(gamification));
    }, [gamification]);
    
    // Integrate Google Sheets Sync Hook
    const shouldSync = settingsLoaded && !isLoading;
    
    const { status: syncStatus, errorMsg: syncError, syncMethod, manualPull, manualPush } = useGoogleSheetSync(
        shouldSync ? settings.googleSheetId : undefined,
        tasks,
        setAllTasks,
        googleAuth.isSignedIn,
        shouldSync ? settings.googleAppsScriptUrl : undefined
    );

    // --- HEALTH CHECK LOGIC ---
    useEffect(() => {
        const isScriptMode = !!settings.googleAppsScriptUrl;

        // 1. Auth Health & API Health Logic Update
        if (isScriptMode) {
             setConnectionHealth(prev => ({
                 ...prev, 
                 auth: { status: 'optional', message: 'Not required for Script' },
                 api: { status: 'configured', message: 'Not required for Script' }
            }));
        } else {
             if (googleAuth.disabled) {
                  setConnectionHealth(prev => ({...prev, auth: { status: 'optional', message: 'Keys Missing' }}));
             } else if (!googleAuth.isSignedIn) {
                  setConnectionHealth(prev => ({...prev, auth: { status: 'disconnected', message: 'Sign In Required for API' }}));
             } else {
                  setConnectionHealth(prev => ({...prev, auth: { status: 'connected', message: 'Signed In' }}));
             }
        }

        // 2. Sheet Health
        if (!settings.googleSheetId && !settings.googleAppsScriptUrl) {
             setConnectionHealth(prev => ({...prev, sheet: { status: 'pending', message: 'Not configured' }}));
        } else if (syncStatus === 'error') {
             setConnectionHealth(prev => ({...prev, sheet: { status: 'error', message: syncError || 'Sync Failed' }}));
        } else if (syncStatus === 'idle' && !settings.googleAppsScriptUrl && !googleAuth.isSignedIn) {
             setConnectionHealth(prev => ({...prev, sheet: { status: 'pending', message: 'Waiting for Auth' }}));
        } else {
             const methodMsg = syncMethod === 'script' ? 'via Script' : 'via API';
             const statusMsg = syncStatus === 'syncing' ? 'Syncing...' : `Connected ${methodMsg}`;
             setConnectionHealth(prev => ({...prev, sheet: { status: 'connected', message: statusMsg }}));
        }
    }, [googleAuth.isSignedIn, googleAuth.disabled, settings.googleSheetId, settings.googleAppsScriptUrl, syncStatus, syncError, syncMethod]);

    // 3. Calendar Health
    useEffect(() => {
        if (!googleAuth.isSignedIn || !settings.googleCalendarId) {
             setConnectionHealth(prev => ({...prev, calendar: { status: 'pending', message: 'Not Connected' }}));
             return;
        }
        const checkCalendar = async () => {
            try {
                await checkCalendarConnection(settings.googleCalendarId || 'primary');
                setConnectionHealth(prev => ({...prev, calendar: { status: 'connected', message: 'Connected' }}));
            } catch (e: any) {
                let msg = 'Connection Failed';
                if (e.result?.error?.code === 404) msg = 'Calendar Not Found';
                if (e.result?.error?.code === 403) msg = 'Permission Denied';
                setConnectionHealth(prev => ({...prev, calendar: { status: 'error', message: msg }}));
            }
        };
        checkCalendar();
        const interval = setInterval(checkCalendar, 60000);
        return () => clearInterval(interval);
    }, [googleAuth.isSignedIn, settings.googleCalendarId]);


    useEffect(() => {
        // Global listener to unlock audio context on first user interaction
        const unlockAudio = () => {
            resumeAudioContext();
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
        window.addEventListener('click', unlockAudio);
        window.addEventListener('keydown', unlockAudio);
        
        const handleClick = () => setContextMenu(null);
        window.addEventListener("click", handleClick);
        return () => {
            window.removeEventListener("click", handleClick);
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
    }, []);

    const handleOpenAddTaskModal = useCallback((status: Status, scheduledDateTime?: string) => {
        const baseDate = scheduledDateTime ? new Date(scheduledDateTime) : new Date();
        setEditingTask({
            id: `new-${Date.now()}`,
            title: '',
            status,
            priority: 'Medium',
            dueDate: baseDate.toISOString().split('T')[0],
            createdDate: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            tags: [],
            subtasks: [],
            statusChangeDate: new Date().toISOString(),
            actualTimeSpent: 0,
            scheduledStartDateTime: scheduledDateTime,
            dependencies: [],
            blockers: [],
            currentSessionStartTime: null,
        });
    }, []);

    const handleOpenSettings = (tab: SettingsTab = 'general') => {
        setActiveSettingsTab(tab);
        setShowIntegrationsModal(true);
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isEditing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
    
            if (e.key === 'Escape') {
                if (contextMenu) setContextMenu(null);
                else if (editingTask) setEditingTask(null);
                else if (blockingTask) setBlockingTask(null);
                else if (resolvingBlockerTask) setResolvingBlockerTask(null);
                else if (showAIModal) setShowAIModal(false);
                else if (showShortcutsModal) setShowShortcutsModal(false);
                else if (showIntegrationsModal) setShowIntegrationsModal(false);
                return;
            }
    
            if (isEditing) return;
            if (!isSheetConfigured) return; // Disable shortcuts if locked out

            switch (e.key.toLowerCase()) {
                case 'n':
                case 'a':
                    e.preventDefault();
                    handleOpenAddTaskModal('To Do');
                    break;
                case 'i':
                case 'm':
                    e.preventDefault();
                    setShowAIModal(true);
                    break;
                case 't':
                    e.preventDefault();
                    setIsTodayView(prev => !prev);
                    break;
                case 'v':
                    e.preventDefault();
                    setViewMode(prev => (prev === 'kanban' ? 'calendar' : 'kanban'));
                    break;
                case '?':
                    e.preventDefault();
                    setShowShortcutsModal(true);
                    break;
                case '-':
                    if (e.ctrlKey || e.metaKey) return; // Allow browser zoom
                    e.preventDefault();
                    setZoomLevel(prev => Math.max(0.1, prev - 0.1));
                    break;
                case '=':
                case '+':
                    if (e.ctrlKey || e.metaKey) return; // Allow browser zoom
                    e.preventDefault();
                    setZoomLevel(prev => Math.min(1.5, prev + 0.1));
                    break;
                case '0':
                     if (e.ctrlKey || e.metaKey) return;
                     setZoomLevel(1);
                     break;
                default:
                    break;
            }
        };
    
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [
        editingTask, blockingTask, resolvingBlockerTask, showAIModal, showShortcutsModal, 
        showIntegrationsModal, contextMenu, isTodayView, viewMode, handleOpenAddTaskModal,
        isSheetConfigured
    ]);


    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
    };

    const xpForPriority: Record<Priority, number> = { 'Critical': 50, 'High': 30, 'Medium': 20, 'Low': 10 };

    const handleTaskCompletion = useCallback((task: Task) => {
        setGamification(prev => {
            let earnedXp = xpForPriority[task.priority] || 10;
            if (task.timeEstimate) earnedXp += Math.round(task.timeEstimate * 5);

            const newXp = prev.xp + earnedXp;
            let newLevel = prev.level;
            let xpForNextLevel = newLevel * 100;
            
            if (newXp >= xpForNextLevel) {
                newLevel++;
                setLeveledUpTo(newLevel);
                setShowLevelUp(true);
                setTimeout(() => setShowLevelUp(false), 4000);
                 confetti({
                    particleCount: 300,
                    spread: 120,
                    origin: { y: 0.6 },
                    colors: ['#818cf8', '#c084fc', '#4ade80', '#facc15']
                });
            }

            let newStreak = { ...prev.streak };
            const today = new Date().toISOString().split('T')[0];
            if (prev.streak.lastCompletionDate !== today) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                if (prev.streak.lastCompletionDate === yesterday.toISOString().split('T')[0]) {
                    newStreak.current++;
                } else {
                    newStreak.current = 1;
                }
                newStreak.lastCompletionDate = today;
                if (newStreak.current > newStreak.longest) {
                    newStreak.longest = newStreak.current;
                }
            }
            return { xp: newXp, level: newLevel, streak: newStreak };
        });
    }, [xpForPriority]);

    const handleToggleTimer = (taskId: string) => {
        const now = Date.now();
        const currentlyActiveTask = tasks.find(t => t.currentSessionStartTime);
        
        if (currentlyActiveTask) {
            const startTime = currentlyActiveTask.currentSessionStartTime!;
            const duration = now - startTime;
            const updatedTask = {
                ...currentlyActiveTask,
                actualTimeSpent: (currentlyActiveTask.actualTimeSpent || 0) + Math.round(duration / 1000),
                currentSessionStartTime: null 
            };
            updateTask(updatedTask);
            if (currentlyActiveTask.id === taskId) return;
        }

        const taskToStart = tasks.find(t => t.id === taskId);
        if (taskToStart) {
            updateTask({
                ...taskToStart,
                currentSessionStartTime: now
            });
        }
    };
    
    const performActualTaskMove = useCallback((task: Task, newStatus: Status, newIndex: number) => {
        if (task.status === 'In Progress' && newStatus !== 'In Progress' && task.currentSessionStartTime) {
             const duration = Date.now() - task.currentSessionStartTime;
             task.actualTimeSpent = (task.actualTimeSpent || 0) + Math.round(duration / 1000);
             task.currentSessionStartTime = null;
        }

        if (newStatus === 'Done' && !task.xpAwarded) {
            confetti({
                particleCount: 200,
                spread: 90,
                origin: { y: 0.6 }
            });
            // Use safe Audio utility instead of direct instantiation
            playCompletionSound();
            
            handleTaskCompletion(task);
        }
        moveTask(task.id, newStatus, newIndex);
    }, [handleTaskCompletion, moveTask]);


    const handleTaskMove = (taskId: string, newStatus: Status, newIndex: number) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        if (task.isBlockedByDependencies && newStatus === 'In Progress') {
            const blockerTasks = task.dependencies?.map(depId => tasks.find(t => t.id === depId)?.title).filter(Boolean).join(', ');
            alert(`This task is blocked by dependencies. Please complete the following tasks first: ${blockerTasks}`);
            return;
        }

        const activeBlocker = task.blockers?.find(b => !b.resolved);
        if (task.status === 'Blocker' && newStatus !== 'Blocker' && activeBlocker) {
            setResolvingBlockerTask({ task, newStatus, newIndex });
            return;
        }
        if (newStatus === 'Blocker' && !activeBlocker) {
            setBlockingTask(task);
            return; 
        }

        performActualTaskMove(task, newStatus, newIndex);
    };
    
    const handleSetBlocker = (task: Task, reason: string) => {
        const newBlocker: Blocker = {
            id: `blocker-${Date.now()}-${Math.random()}`,
            reason,
            createdDate: new Date().toISOString(),
            resolved: false,
        };
        const updatedTask = {
            ...task,
            blockers: [...(task.blockers || []), newBlocker],
        };
        updateTask(updatedTask);
        moveTask(task.id, 'Blocker', 0);
        setBlockingTask(null);
    };

    const handleResolveBlocker = (task: Task) => {
        if (!resolvingBlockerTask) return;
        const { newStatus, newIndex } = resolvingBlockerTask;
        const now = new Date().toISOString();

        const updatedBlockers = task.blockers?.map(b => 
            !b.resolved ? { ...b, resolved: true, resolvedDate: now } : b
        );

        const updatedTask = { ...task, blockers: updatedBlockers };
        updateTask(updatedTask);
        performActualTaskMove(updatedTask, newStatus, newIndex);
        setResolvingBlockerTask(null);
    };

    const handleEditTask = (task: Task) => {
        setEditingTask(task);
    };

    const handleSaveTask = (taskToSave: Task) => {
        if (taskToSave.id.startsWith('new-')) {
            const { id, createdDate, lastModified, ...newTaskData } = taskToSave;
            addTask(newTaskData as Omit<Task, 'id' | 'createdDate' | 'lastModified'>);
        } else {
            updateTask(taskToSave);
        }
        setEditingTask(null);
    };
    
    const handleAICommand = async (command: string) => {
        setIsAIProcessing(true);
        setAiError(null);
        setAiSummary(null);
        try {
            const updatedTasks = await manageTasksWithAI(command, tasks);
            setAllTasks(updatedTasks);
            setShowAIModal(false);
        } catch (error: any) {
            setAiError(error.message || 'An unknown error occurred.');
        } finally {
            setIsAIProcessing(false);
        }
    };

    const handleGenerateSummary = async () => {
        setIsAIProcessing(true);
        setAiError(null);
        setAiSummary(null);
        try {
            const summary = await generateTaskSummary(tasks);
            setAiSummary(summary);
        } catch (error: any) {
            setAiError(error.message || 'An unknown error occurred while generating summary.');
        } finally {
            setIsAIProcessing(false);
        }
    };
    
    const filteredTasks = isTodayView
        ? tasks.filter(task => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const dueDate = new Date(task.dueDate);
              dueDate.setHours(0, 0, 0, 0);
              return dueDate.getTime() === today.getTime();
          })
        : tasks;

    const handleGoogleSignIn = async () => {
        try {
            await signIn();
            setGoogleAuth(prev => ({ ...prev, isSignedIn: true }));
        } catch (error) {
            console.error("Sign in failed", error);
        }
    };
    
    const handleGoogleSignOut = () => {
        signOut();
        setGoogleAuth(prev => ({ ...prev, isSignedIn: false }));
    };
    
    const handleOpenContextMenu = (e: React.MouseEvent, task: Task) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, task });
    };

    const handleChangeStatusFromContextMenu = (task: Task, newStatus: Status) => {
        handleTaskMove(task.id, newStatus, 0);
        setContextMenu(null);
    };


    return (
        <div className="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-white min-h-screen font-sans bg-dots transition-colors duration-300">
            <Header
                tasks={tasks}
                isTodayView={isTodayView}
                setIsTodayView={setIsTodayView}
                onOpenAIAssistant={() => setShowAIModal(true)}
                onToggleTheme={toggleTheme}
                currentTheme={theme}
                onResetLayout={resetColumnLayouts}
                gamification={gamification}
                settings={settings}
                onUpdateSettings={(newSettings) => setSettings(prev => ({...prev, ...newSettings}))}
                currentViewMode={viewMode}
                onViewModeChange={setViewMode}
                googleAuthState={googleAuth}
                onGoogleSignIn={handleGoogleSignIn}
                onGoogleSignOut={handleGoogleSignOut}
                onOpenShortcutsModal={() => setShowShortcutsModal(true)}
                focusMode={focusMode}
                setFocusMode={setFocusMode}
                onOpenSettings={handleOpenSettings}
                connectionHealth={connectionHealth}
                onManualPull={manualPull}
                onManualPush={manualPush}
                isCompactMode={isCompactMode}
                onToggleCompactMode={() => setIsCompactMode(prev => !prev)}
                zoomLevel={zoomLevel}
                setZoomLevel={setZoomLevel}
                // Pass Audio Data
                audioControls={audioControls}
            />

            <main className="pl-6 pt-6 pr-2 pb-2 h-[calc(100vh-200px)] overflow-auto relative">
                {/* CONDITIONAL RENDERING: Strict Sheet Connection Gate */}
                {!isSheetConfigured ? (
                    <ConnectSheetPlaceholder onConnect={() => handleOpenSettings('sheets')} />
                ) : (
                    <>
                        {isLoading && (
                            <div className="flex justify-center items-center h-full">
                                <i className="fas fa-spinner fa-spin text-4xl text-indigo-500 dark:text-indigo-400"></i>
                                <span className="ml-4 text-xl">Loading tasks...</span>
                            </div>
                        )}
                        {error && <div className="text-center text-red-500 dark:text-red-400 text-lg">{error}</div>}
                        {!isLoading && !error && (
                            <>
                            {viewMode === 'kanban' && (
                                <KanbanBoard
                                    tasks={tasks}
                                    columns={columns}
                                    columnLayouts={columnLayouts}
                                    getTasksByStatus={(status) => getTasksByStatus(status, filteredTasks)}
                                    onTaskMove={handleTaskMove}
                                    onEditTask={handleEditTask}
                                    onAddTask={(status) => handleOpenAddTaskModal(status)}
                                    onUpdateColumnLayout={updateColumnLayout}
                                    activeTaskTimer={activeTaskTimer}
                                    onToggleTimer={handleToggleTimer}
                                    onOpenContextMenu={handleOpenContextMenu}
                                    focusMode={focusMode}
                                    onDeleteTask={deleteTask}
                                    isCompactMode={isCompactMode}
                                    zoomLevel={zoomLevel}
                                />
                            )}
                            {viewMode === 'calendar' && (
                                <CalendarView
                                    tasks={tasks}
                                    onUpdateTask={updateTask}
                                    onEditTask={handleEditTask}
                                    onAddTask={handleOpenAddTaskModal}
                                    timezone={settings.timezone}
                                />
                            )}
                            </>
                        )}
                    </>
                )}
            </main>
            
            {/* Sync Status Indicator (Compact) - Only show if configured */}
            {isSheetConfigured && syncStatus !== 'idle' && (
                <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2 px-3 py-1.5 bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-full text-xs font-medium shadow-sm border border-gray-200 dark:border-gray-700">
                    {syncStatus === 'syncing' && <i className="fas fa-sync fa-spin text-blue-500"></i>}
                    {syncStatus === 'success' && <i className="fas fa-check text-green-500"></i>}
                    {syncStatus === 'error' && <i className="fas fa-exclamation-circle text-red-500"></i>}
                    
                    <span className="text-gray-600 dark:text-gray-300">
                        {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'error' ? 'Sync Failed' : 'Synced'}
                    </span>
                    {syncError && syncStatus === 'error' && (
                        <span className="text-red-400 max-w-[150px] truncate ml-1" title={syncError}>{syncError}</span>
                    )}
                </div>
            )}

            {editingTask && (
                <EditTaskModal
                    task={editingTask}
                    allTasks={tasks}
                    onSave={handleSaveTask}
                    onDelete={deleteTask}
                    onClose={() => setEditingTask(null)}
                />
            )}
            {blockingTask && (
                 <BlockerModal
                    task={blockingTask}
                    onSetBlocker={handleSetBlocker}
                    onClose={() => setBlockingTask(null)}
                />
            )}
            {resolvingBlockerTask && (
                <ResolveBlockerModal
                    task={resolvingBlockerTask.task}
                    onResolve={handleResolveBlocker}
                    onClose={() => setResolvingBlockerTask(null)}
                />
            )}
             {showAIModal && (
                <AIAssistantModal
                    onClose={() => {
                        setShowAIModal(false);
                        setAiError(null);
                        setAiSummary(null);
                    }}
                    onProcessCommand={handleAICommand}
                    isLoading={isAIProcessing}
                    error={aiError}
                    onGenerateSummary={handleGenerateSummary}
                    summary={aiSummary}
                />
            )}
            {showShortcutsModal && (
                <ShortcutsModal onClose={() => setShowShortcutsModal(false)} />
            )}
            {showIntegrationsModal && (
                <IntegrationsModal
                    settings={settings}
                    onUpdateSettings={(newSettings) => setSettings(prev => ({...prev, ...newSettings}))}
                    onClose={() => setShowIntegrationsModal(false)}
                    googleAuthState={googleAuth}
                    onGoogleSignIn={handleGoogleSignIn}
                    onGoogleSignOut={handleGoogleSignOut}
                    initialTab={activeSettingsTab}
                />
            )}
            {showLevelUp && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 pointer-events-none">
                    <div className="bg-gray-800 rounded-lg shadow-2xl p-8 text-center border-2 border-yellow-400">
                        <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-500 mb-4 animate-pulse">LEVEL UP!</h2>
                        <p className="text-gray-200 text-2xl">You've reached Level {leveledUpTo}!</p>
                    </div>
                </div>
            )}
             {settings.showPomodoroTimer && <PomodoroTimer settings={settings} />}
             {contextMenu && (
                <div
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg py-1"
                    onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                    onContextMenu={(e) => e.preventDefault()} // Prevent another context menu on top
                >
                    <div className="px-3 py-1 text-sm font-bold border-b border-gray-200 dark:border-gray-700 mb-1 truncate max-w-xs">{contextMenu.task.title}</div>
                    <p className="px-3 pb-2 text-xs text-gray-500 dark:text-gray-400">Move to:</p>
                    {COLUMN_STATUSES.map(status => (
                        <button
                            key={status}
                            onClick={() => handleChangeStatusFromContextMenu(contextMenu.task, status)}
                            className="block w-full text-left px-3 py-1 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                            disabled={contextMenu.task.status === status}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default App;
