
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { KanbanBoard } from './components/KanbanBoard';
import { Header } from './components/Header';
import { useTaskManager } from './hooks/useTaskManager';
import { Task, Status, Priority, GamificationData, Settings, Blocker, ConnectionHealth, SettingsTab, Goal } from './types';
import { EditTaskModal } from './components/EditTaskModal';
import { BlockerModal } from './components/BlockerModal';
import { ResolveBlockerModal } from './components/ResolveBlockerModal';
import { AIAssistantModal } from './components/AIAssistantModal';
import { CalendarView } from './components/CalendarView';
import { TimelineGantt } from './components/TimelineGantt';
import { GoalBoard } from './components/GoalBoard';
import { FocusView } from './components/FocusView';
import { breakDownTask, parseTaskFromVoice, TaskDiff, analyzeTaskPsychology } from './services/geminiService';
import { initGoogleClient, signIn, signOut } from './services/googleAuthService';
import { COLUMN_STATUSES, UNASSIGNED_GOAL_ID } from './constants';
import { ShortcutsModal } from './components/ShortcutsModal';
import { IntegrationsModal } from './components/IntegrationsModal';
import { useGoogleSheetSync } from './hooks/useGoogleSheetSync';
import { checkCalendarConnection } from './services/googleCalendarService'; 
import { resumeAudioContext } from './utils/audio';
import { storage } from './utils/storage';
import { useBackgroundAudio } from './hooks/useBackgroundAudio';
import { useSettings } from './hooks/useSettings'; // H-01: New Hook
import { setUserTimeOffset } from './services/timeService';
import { ConfirmModal } from './components/ConfirmModal';
import { getEnvVar } from './utils/env';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { StarField } from './components/StarField';

interface GoogleAuthState {
    gapiLoaded: boolean;
    gisLoaded: boolean;
    isSignedIn: boolean;
    error?: Error;
    disabled?: boolean;
}

const ConnectSheetPlaceholder: React.FC<{ onConnect: () => void }> = ({ onConnect }) => (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-fadeIn">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border-2 border-dashed border-gray-300 dark:border-gray-700 max-w-md w-full">
            <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-6">
                <i className="fas fa-table text-4xl"></i>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Practical Order</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
                Connect a sheet to maintain factual records of necessary actions.
            </p>
            <button 
                onClick={onConnect}
                className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-indigo-500/30 flex items-center justify-center gap-2"
            >
                <i className="fas fa-link"></i> Connect Database
            </button>
        </div>
    </div>
);

const App: React.FC = () => {
    const [theme, setTheme] = useState('light');
    
    const [isCompactMode, setIsCompactMode] = useState(true);
    const [isFitToScreen, setIsFitToScreen] = useState(true);
    const [zoomLevel, setZoomLevel] = useState(0.9);
    const [showTimeline, setShowTimeline] = useState(false);
    
    const [isMenuLocked, setIsMenuLocked] = useState(false);
    const [isMenuHovered, setIsMenuHovered] = useState(false);
    
    const [isRocketFlying, setIsRocketFlying] = useState(false);

    const isSpaceModeActive = useMemo(() => theme === 'space', [theme]);

    // H-01 & H-02: Replaced local useState with robust useSettings hook
    const { settings, updateSettings, loaded: settingsLoaded } = useSettings();

    const isSheetConfigured = useMemo(() => {
        return !!(settings.googleSheetId || settings.googleAppsScriptUrl);
    }, [settings.googleSheetId, settings.googleAppsScriptUrl]);

    const hasApiKey = useMemo(() => {
        return !!settings.geminiApiKey || !!getEnvVar('VITE_GEMINI_API_KEY');
    }, [settings.geminiApiKey]);

    const {
        tasks,
        goals, 
        columns,
        columnLayouts,
        addTask,
        updateTask,
        deleteTask,
        moveTask,
        setAllTasks,
        setAllData, 
        addGoal, 
        updateGoal, 
        deleteGoal, 
        toggleTaskPin,
        reorderPinnedTasks, 
        getTasksByStatus,
        updateColumnLayout,
        resetColumnLayouts,
        isLoading,
        error
    } = useTaskManager(settingsLoaded && isSheetConfigured);

    const audioControls = useBackgroundAudio(settings.audio);

    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [blockingTask, setBlockingTask] = useState<Task | null>(null);
    const [resolvingBlockerTask, setResolvingBlockerTask] = useState<{ task: Task; newStatus: Status; newIndex: number } | null>(null);
    const [isTodayView, setIsTodayView] = useState<boolean>(false);
    const [showAIModal, setShowAIModal] = useState(false);
    
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const [showIntegrationsModal, setShowIntegrationsModal] = useState(false);
    const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('general');
    
    const [viewMode, setViewMode] = useState<'kanban' | 'calendar' | 'goals' | 'focus'>('kanban');
    const [focusMode, setFocusMode] = useState<Status | 'None'>('None');
    const [focusedGoalId, setFocusedGoalId] = useState<string | null>(null);
    
    const [confirmModalState, setConfirmModalState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        isDestructive?: boolean;
        onConfirm: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => {}
    });

    const activeTaskTimer = useMemo(() => {
        const activeTask = tasks.find(t => t.currentSessionStartTime);
        return activeTask ? { taskId: activeTask.id, startTime: activeTask.currentSessionStartTime! } : null;
    }, [tasks]);

    const [gamification, setGamification] = useState<GamificationData>({
        xp: 0,
        level: 1,
        streak: { current: 0, longest: 0, lastCompletionDate: null }
    });
    
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: Task } | null>(null);
    const [showShortcutsModal, setShowShortcutsModal] = useState(false);

    const [googleAuth, setGoogleAuth] = useState<GoogleAuthState>({
        gapiLoaded: false,
        gisLoaded: false,
        isSignedIn: false,
        disabled: false,
    });

    const [connectionHealth, setConnectionHealth] = useState<ConnectionHealth>({
        auth: { status: 'loading', message: 'Initializing...' },
        sheet: { status: 'pending', message: 'Not configured' },
        calendar: { status: 'pending', message: 'Not configured' },
        api: { status: 'missing', message: 'API Keys missing' }
    });
    
    useEffect(() => {
        if (isMenuLocked) {
            setZoomLevel(0.8);
        } else {
            setZoomLevel(0.9);
        }
        storage.set('isMenuLocked', String(isMenuLocked));
    }, [isMenuLocked]);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    useEffect(() => {
        // H-01: Delay init until settings loaded
        if (!settingsLoaded) return; 

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
    }, [settings.googleApiKey, settings.googleClientId, settings.googleAppsScriptUrl, settingsLoaded]);

    useEffect(() => {
        const loadPersistedData = async () => {
            try {
                const savedTheme = await storage.get('theme');
                if (savedTheme && savedTheme !== theme) setTheme(savedTheme);

                const savedFit = await storage.get('isFitToScreen');
                if (savedFit !== null) {
                    const shouldFit = savedFit === 'true';
                    setIsFitToScreen(shouldFit);
                    if (shouldFit) setZoomLevel(0.9);
                    else setZoomLevel(1);
                }
                
                const savedTimeline = await storage.get('showTimeline');
                if (savedTimeline !== null) setShowTimeline(savedTimeline === 'true');
                
                const savedMenuLock = await storage.get('isMenuLocked');
                if (savedMenuLock === 'true') setIsMenuLocked(true);

                const savedFocusedGoalId = await storage.get('focusedGoalId');
                if (savedFocusedGoalId) setFocusedGoalId(savedFocusedGoalId);

                // Load View State
                const savedViewMode = await storage.get('viewMode');
                if (savedViewMode) setViewMode(savedViewMode as any);

                const savedTodayView = await storage.get('isTodayView');
                if (savedTodayView) setIsTodayView(savedTodayView === 'true');

                const savedFocusMode = await storage.get('focusMode');
                if (savedFocusMode) setFocusMode(savedFocusMode as any);

                // H-01: Removed settings loading logic here as it's now in the hook
            
            } catch (e) {
                console.error("Error loading persisted data", e);
            }
        };
        loadPersistedData();
    }, []);

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('dark');
        if (theme === 'dark' || theme === 'space') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        storage.set('theme', theme);
    }, [theme]);

    // Persist UI State
    useEffect(() => {
        if (!settingsLoaded) return;
        
        storage.set('viewMode', viewMode);
        storage.set('isTodayView', String(isTodayView));
        
        if (focusMode !== 'None') {
            storage.set('focusMode', focusMode);
        } else {
            storage.remove('focusMode');
        }
    }, [viewMode, isTodayView, focusMode, settingsLoaded]);

    useEffect(() => {
        storage.set('isFitToScreen', String(isFitToScreen));
        storage.set('showTimeline', String(showTimeline));
    }, [isFitToScreen, showTimeline]);

    useEffect(() => {
        if (settingsLoaded) {
            if (focusedGoalId) {
                storage.set('focusedGoalId', focusedGoalId);
            } else {
                storage.remove('focusedGoalId');
            }
        }
    }, [focusedGoalId, settingsLoaded]);

    useEffect(() => {
        // H-01: Update time offset when settings change
        if (settingsLoaded) {
            setUserTimeOffset(settings.userTimeOffset);
        }
    }, [settings.userTimeOffset, settingsLoaded]);

    const shouldSync = settingsLoaded && !isLoading;
    const { status: syncStatus, errorMsg: syncError, syncMethod, manualPull, manualPush } = useGoogleSheetSync(
        shouldSync ? settings.googleSheetId : undefined,
        tasks,
        setAllData, 
        googleAuth.isSignedIn,
        shouldSync ? settings.googleAppsScriptUrl : undefined,
        gamification,
        settings,
        setGamification,
        (s) => updateSettings(s), // H-01: Use hook's updater
        goals 
    );

    useEffect(() => {
        const isScriptMode = !!settings.googleAppsScriptUrl;

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
            goalId: focusedGoalId && focusedGoalId !== UNASSIGNED_GOAL_ID ? focusedGoalId : undefined,
            isPinned: false
        });
    }, [focusedGoalId]);

    // CENTRALIZED PSYCHOLOGY CHECK
    const runPsychologyCheck = useCallback(async (task: Task) => {
        const apiKey = settings.geminiApiKey || getEnvVar('VITE_GEMINI_API_KEY');
        if (!apiKey) return;

        try {
            // Run silent background check
            const analysis = await analyzeTaskPsychology(task, apiKey);
            
            // Only update if it changes the state (prevents loops, though useTaskManager handles object identity)
            // Or simply if 'isBecoming' is true, update the task to reflect that.
            if (analysis.isBecoming) {
                updateTask({
                    ...task,
                    isBecoming: true,
                    becomingWarning: analysis.warning
                });
            }
        } catch (e) {
            console.error("Psych check failed", e);
        }
    }, [settings.geminiApiKey, updateTask]);

    const handleQuickAddTask = useCallback((title: string, status: Status) => {
        // 1. Create the task explicitly (Optimistic UI)
        const newTaskData = {
            title,
            status,
            priority: 'Medium' as Priority,
            dueDate: new Date().toISOString().split('T')[0],
            description: '',
            goalId: focusedGoalId && focusedGoalId !== UNASSIGNED_GOAL_ID ? focusedGoalId : undefined, 
        };
        
        // 2. Add to board instantly
        const newTask = addTask(newTaskData);
        
        // 3. Trigger Background Analysis
        runPsychologyCheck(newTask);

    }, [addTask, focusedGoalId, runPsychologyCheck]);

    const handleVoiceTaskAdd = useCallback(async (transcript: string, defaultStatus: Status) => {
        const effectiveKey = settings.geminiApiKey || getEnvVar('VITE_GEMINI_API_KEY');
        
        if (!effectiveKey) {
             // Fallback: Add basic task
             const basicTask = addTask({
                title: transcript,
                status: defaultStatus,
                priority: 'Medium',
                dueDate: new Date().toISOString().split('T')[0],
                description: '', 
                goalId: focusedGoalId && focusedGoalId !== UNASSIGNED_GOAL_ID ? focusedGoalId : undefined
             });
             // Even basic fallback should try analysis if key becomes available or just skip
             return;
        }

        try {
            const parsedData = await parseTaskFromVoice(transcript, effectiveKey, goals);
            
            // Note: Voice parser returns a structure, we need to finalize it for the modal or add it directly
            // Current flow opens the modal for "Draft" review
            const draftTask: Task = {
                id: `new-${Date.now()}`,
                title: parsedData.title || transcript, 
                description: parsedData.description || '',
                status: (parsedData.status || defaultStatus) as Status,
                priority: (parsedData.priority || 'Medium') as Priority,
                dueDate: parsedData.dueDate || new Date().toISOString().split('T')[0],
                scheduledStartDateTime: parsedData.scheduledStartDateTime,
                tags: parsedData.tags || [],
                timeEstimate: parsedData.timeEstimate,
                goalId: parsedData.goalId || (focusedGoalId && focusedGoalId !== UNASSIGNED_GOAL_ID ? focusedGoalId : undefined), 
                blockers: parsedData.blockerReason ? [{
                    id: `blocker-${Date.now()}`,
                    reason: parsedData.blockerReason,
                    createdDate: new Date().toISOString(),
                    resolved: false
                }] : [],
                subtasks: parsedData.subtasks?.map((st: any) => ({
                    id: `sub-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
                    title: st.title,
                    isCompleted: false
                })) || [],
                createdDate: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                statusChangeDate: new Date().toISOString(),
                actualTimeSpent: 0,
                isPinned: false
            };

            setEditingTask(draftTask);

        } catch (error) {
            console.error("Voice parse failed:", error);
            // Fallback add
            const fallbackTask = addTask({
                title: transcript.length > 60 ? `${transcript.substring(0, 57)}...` : transcript,
                description: `> 🎙️ **Voice Note**\n> "${transcript}"`,
                status: defaultStatus,
                priority: 'Medium',
                dueDate: new Date().toISOString().split('T')[0],
                goalId: focusedGoalId && focusedGoalId !== UNASSIGNED_GOAL_ID ? focusedGoalId : undefined
            });
            // Try check on fallback too
            runPsychologyCheck(fallbackTask);
        }
    }, [addTask, settings.geminiApiKey, focusedGoalId, goals, runPsychologyCheck]);

    const handleOpenSettings = (tab: SettingsTab = 'general') => {
        setActiveSettingsTab(tab);
        setShowIntegrationsModal(true);
    };

    const handleSubtaskToggle = useCallback((taskId: string, subtaskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task || !task.subtasks) return;
        
        const updatedSubtasks = task.subtasks.map(st => 
            st.id === subtaskId ? { ...st, isCompleted: !st.isCompleted } : st
        );
        
        updateTask({ ...task, subtasks: updatedSubtasks });
    }, [tasks, updateTask]);

    const handleBreakDownTask = useCallback(async (taskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        try {
            const steps = await breakDownTask(task.title, settings.geminiApiKey);
            const currentSubtasks = task.subtasks || [];
            
            const newSubtasks = [...currentSubtasks];
            steps.forEach(step => {
                if (!newSubtasks.some(s => s.title === step.title)) {
                    newSubtasks.push(step);
                }
            });

            updateTask({ ...task, subtasks: newSubtasks });
        } catch (error) {
            console.error("Failed to break down task:", error);
        }
    }, [tasks, updateTask, settings.geminiApiKey]);

    const handleTogglePin = useCallback((taskId: string) => {
        const result = toggleTaskPin(taskId);
        if (!result.success && result.message) {
            setNotification({ message: result.message, type: 'error' });
        }
    }, [toggleTaskPin]);

    useKeyboardShortcuts({
        isSheetConfigured,
        handleOpenAddTaskModal,
        setShowAIModal,
        setIsTodayView,
        setViewMode: (newMode) => {
            // Need a safer cast/check here since Keyboard shortcuts hook expects 2 values but we have 4
            // For now, toggle between kanban and calendar for shortcut 'V'
            if (typeof newMode === 'function') {
                setViewMode(prev => (prev === 'kanban' ? 'calendar' : 'kanban'));
            } else {
                setViewMode(newMode as any);
            }
        },
        setShowShortcutsModal,
        setZoomLevel,
        closeAllModals: () => {
            if (contextMenu) setContextMenu(null);
            else if (editingTask) setEditingTask(null);
            else if (blockingTask) setBlockingTask(null);
            else if (resolvingBlockerTask) setResolvingBlockerTask(null);
            else if (showAIModal) setShowAIModal(false);
            else if (showShortcutsModal) setShowShortcutsModal(false);
            else if (showIntegrationsModal) setShowIntegrationsModal(false);
            else if (confirmModalState.isOpen) setConfirmModalState(prev => ({...prev, isOpen: false}));
        },
        isAnyModalOpen: !!(contextMenu || editingTask || blockingTask || resolvingBlockerTask || showAIModal || showShortcutsModal || showIntegrationsModal || confirmModalState.isOpen)
    });

    const toggleTheme = () => {
        setTheme(prevTheme => {
            if (prevTheme === 'light') return 'dark';
            if (prevTheme === 'dark') return 'space';
            return 'light';
        });
    };

    const handleToggleFitToScreen = () => {
        setIsFitToScreen(prev => {
            const newValue = !prev;
            if (newValue) setZoomLevel(0.9);
            else setZoomLevel(1);
            return newValue;
        });
    };

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
             task.actualTimeSpent = (task.actualTimeSpent || 0) + Math.round(duration / 1000),
             task.currentSessionStartTime = null;
        }

        moveTask(task.id, newStatus, newIndex);
    }, [moveTask]);


    const handleTaskMove = (taskId: string, newStatus: Status, newIndex: number) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        if (task.isBlockedByDependencies && newStatus === 'In Progress') {
            const blockerTasks = task.dependencies?.map(depId => tasks.find(t => t.id === depId)?.title).filter(Boolean).join(', ');
            alert(`This task is blocked by dependencies: ${blockerTasks}`);
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
    
    const handleTaskGoalMove = (taskId: string, newGoalId: string) => {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            updateTask({ ...task, goalId: newGoalId });
        }
    };

    const handleSetBlocker = (task: Task, reason: string) => {
        const newBlocker: Blocker = {
            id: `blocker-${Date.now()}-${Math.random()}`,
            reason: reason,
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

    // TRIGGERS AI PSYCHOLOGY ANALYSIS ON SAVE
    const handleSaveTask = async (taskToSave: Task) => {
        let savedTask = taskToSave;
        
        if (taskToSave.id.startsWith('new-')) {
            const { id, createdDate, lastModified, ...newTaskData } = taskToSave;
            
            // 1. Save immediately (Optimistic)
            const newTask = addTask(newTaskData as any);
            
            // 2. Trigger Background Check
            runPsychologyCheck(newTask);
        } else {
            // Updating existing task
            updateTask(savedTask);
            
            // Trigger AI Analysis in background for edits
            runPsychologyCheck(savedTask);
        }
        setEditingTask(null);
    };
    
    const handleApplyAIChanges = async (changes: TaskDiff) => {
        if (changes.added && changes.added.length > 0) {
            changes.added.forEach(t => {
                addTask(t as any);
                // We could run check here too, but AI usually generates 'safe' tasks or we trust it for now.
                // Or we can invoke runPsychologyCheck on the new tasks if we want to be strict.
            });
        }
        if (changes.updated && changes.updated.length > 0) {
            changes.updated.forEach(partialTask => {
                const existing = tasks.find(t => t.id === partialTask.id);
                if (existing) {
                    updateTask({ ...existing, ...partialTask });
                }
            });
        }
        if (changes.deletedIds && changes.deletedIds.length > 0) {
            changes.deletedIds.forEach(id => {
                deleteTask(id);
            });
        }
        setNotification({ message: "Changes applied.", type: 'success' });
    };

    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            if (focusedGoalId) {
                if (focusedGoalId === UNASSIGNED_GOAL_ID) {
                    if (task.goalId && goals.some(g => g.id === task.goalId)) return false; 
                } else {
                    if (task.goalId !== focusedGoalId) return false;
                }
            }

            if (isTodayView) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const dueDate = new Date(task.dueDate);
                dueDate.setHours(0, 0, 0, 0);
                if (dueDate.getTime() !== today.getTime()) return false;
            }

            if (task.status === 'Done' && task.completionDate) {
                const completedTime = new Date(task.completionDate).getTime();
                const now = new Date().getTime();
                const hoursSinceCompletion = (now - completedTime) / (1000 * 60 * 60);
                if (hoursSinceCompletion > 48) {
                    return false; 
                }
            }

            return true;
        });
    }, [tasks, isTodayView, focusedGoalId, goals]);

    const handleGoalDelete = useCallback((goalId: string) => {
        if (focusedGoalId === goalId) {
            setFocusedGoalId(null);
        }
        deleteGoal(goalId);
    }, [deleteGoal, focusedGoalId]);

    const activeFocusGoal = useMemo(() => {
        if (!focusedGoalId) return null;
        if (focusedGoalId === UNASSIGNED_GOAL_ID) return { id: UNASSIGNED_GOAL_ID, title: 'Unassigned Tasks', color: '#64748b' } as Goal;
        return goals.find(g => g.id === focusedGoalId);
    }, [focusedGoalId, goals]);


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

    const handleEditFromContextMenu = (task: Task) => {
        setEditingTask(task);
        setContextMenu(null);
    };

    const requestDeleteTask = useCallback((taskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        
        setConfirmModalState({
            isOpen: true,
            title: "Delete Task?",
            message: `Are you sure you want to permanently delete "${task.title}"?`,
            isDestructive: true,
            onConfirm: () => {
                deleteTask(taskId);
                setConfirmModalState(prev => ({...prev, isOpen: false}));
                setEditingTask(null); 
            }
        });
    }, [tasks, deleteTask]);

    const handleDeleteFromContextMenu = (task: Task) => {
        requestDeleteTask(task.id);
        setContextMenu(null);
    };

    const activeFocusGoalId = focusedGoalId || null;
    
    // Dynamic Header height for mobile/desktop
    const headerHeight = (isMenuLocked || isMenuHovered) ? '200px' : '50px';

    return (
        <div className={`bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-white h-screen flex flex-col overflow-hidden font-sans ${isSpaceModeActive ? 'bg-transparent' : 'bg-dots'} transition-colors duration-300 relative`}>
            {isSpaceModeActive && <StarField />}
            
            <Header
                tasks={tasks}
                goals={goals} 
                isTodayView={isTodayView}
                setIsTodayView={setIsTodayView}
                onOpenAIAssistant={() => setShowAIModal(true)}
                onToggleTheme={toggleTheme}
                currentTheme={theme}
                onResetLayout={resetColumnLayouts}
                gamification={gamification}
                settings={settings}
                onUpdateSettings={updateSettings} // H-01: Pass hook updater
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
                syncStatus={syncStatus} 
                onManualPull={manualPull}
                onManualPush={manualPush}
                isCompactMode={isCompactMode}
                onToggleCompactMode={() => setIsCompactMode(prev => !prev)}
                isFitToScreen={isFitToScreen}
                onToggleFitToScreen={handleToggleFitToScreen}
                zoomLevel={zoomLevel}
                setZoomLevel={setZoomLevel}
                audioControls={audioControls}
                isTimelineVisible={showTimeline}
                onToggleTimeline={() => setShowTimeline(prev => !prev)}
                isMenuLocked={isMenuLocked} 
                setIsMenuLocked={setIsMenuLocked} 
                isRocketFlying={isRocketFlying}
                onRocketLaunch={setIsRocketFlying}
                isMenuHovered={isMenuHovered} 
                onMenuHoverChange={setIsMenuHovered}
                activeFocusGoal={activeFocusGoal}
                onFocusGoal={setFocusedGoalId} 
                onExitFocus={() => setFocusedGoalId(null)}
            />

            {/* M-02: Audio Suspension Warning Overlay */}
            {audioControls.isSuspended && (
                <div 
                    className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg cursor-pointer animate-bounce flex items-center gap-2"
                    onClick={() => resumeAudioContext()}
                >
                    <i className="fas fa-volume-mute"></i>
                    <span className="text-sm font-bold">Tap to Unmute Audio</span>
                </div>
            )}

            <main 
                className="flex-1 overflow-auto pl-2 sm:pl-6 pr-2 pb-2 relative flex flex-col scroll-smooth transition-all duration-700 z-10"
                style={{ 
                    paddingTop: headerHeight
                }}
            >
                {notification && (
                    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-2 fade-in duration-300">
                        <div className={`px-4 py-2 rounded-lg shadow-xl text-sm font-bold flex items-center gap-2 ${notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
                            <i className={`fas ${notification.type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}`}></i>
                            {notification.message}
                        </div>
                    </div>
                )}

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
                                {/* Only show timeline in Kanban view */}
                                {viewMode === 'kanban' && (
                                    <TimelineGantt 
                                        tasks={filteredTasks} 
                                        onEditTask={handleEditTask}
                                        onUpdateTask={updateTask}
                                        addTask={addTask} 
                                        isVisible={showTimeline}
                                        timezone={settings.timezone}
                                    />
                                )}

                                {viewMode === 'kanban' && (
                                    <div className="flex-grow">
                                        <KanbanBoard
                                            tasks={filteredTasks} 
                                            columns={columns}
                                            columnLayouts={columnLayouts}
                                            getTasksByStatus={(status) => getTasksByStatus(status, filteredTasks)}
                                            onTaskMove={handleTaskMove}
                                            onEditTask={handleEditTask}
                                            onAddTask={(status) => handleOpenAddTaskModal(status)}
                                            onQuickAddTask={handleQuickAddTask}
                                            onSmartAddTask={handleVoiceTaskAdd}
                                            onUpdateTask={updateTask} // Pass updater to board
                                            onUpdateColumnLayout={updateColumnLayout}
                                            activeTaskTimer={activeTaskTimer}
                                            onToggleTimer={handleToggleTimer}
                                            onOpenContextMenu={handleOpenContextMenu}
                                            focusMode={focusMode}
                                            onDeleteTask={requestDeleteTask}
                                            onSubtaskToggle={handleSubtaskToggle}
                                            onBreakDownTask={handleBreakDownTask}
                                            isCompactMode={isCompactMode}
                                            isFitToScreen={isFitToScreen}
                                            zoomLevel={zoomLevel}
                                            isSpaceMode={isSpaceModeActive} 
                                            goals={goals} 
                                            onTogglePin={handleTogglePin} 
                                        />
                                    </div>
                                )}
                                {viewMode === 'calendar' && (
                                    <div className="flex-grow h-full">
                                        <CalendarView
                                            tasks={filteredTasks} 
                                            onUpdateTask={updateTask}
                                            onEditTask={handleEditTask}
                                            onAddTask={handleOpenAddTaskModal}
                                            timezone={settings.timezone}
                                        />
                                    </div>
                                )}
                                {viewMode === 'goals' && (
                                    <div className="flex-grow h-full">
                                        <GoalBoard
                                            tasks={filteredTasks} 
                                            goals={goals}
                                            onTaskMove={handleTaskGoalMove}
                                            onEditTask={handleEditTask}
                                            onDeleteTask={requestDeleteTask}
                                            onAddGoal={addGoal}
                                            onEditGoal={updateGoal}
                                            onUpdateTask={updateTask} // Pass the task updater
                                            onDeleteGoal={handleGoalDelete} 
                                            activeTaskTimer={activeTaskTimer}
                                            onToggleTimer={handleToggleTimer}
                                            onSubtaskToggle={handleSubtaskToggle}
                                            isCompactMode={isCompactMode}
                                            isSpaceMode={isSpaceModeActive}
                                            zoomLevel={zoomLevel}
                                            onFocusGoal={setFocusedGoalId}
                                            currentFocusId={focusedGoalId}
                                        />
                                    </div>
                                )}
                                {viewMode === 'focus' && (
                                    <FocusView
                                        tasks={tasks}
                                        goals={goals}
                                        onEditTask={handleEditTask}
                                        onUpdateTask={updateTask}
                                        onTogglePin={handleTogglePin}
                                        onSubtaskToggle={handleSubtaskToggle}
                                        onDeleteTask={requestDeleteTask}
                                        isSpaceMode={isSpaceModeActive}
                                        activeTaskTimer={activeTaskTimer}
                                        onToggleTimer={handleToggleTimer}
                                        onReorderTasks={reorderPinnedTasks}
                                        headerHeight={headerHeight}
                                    />
                                )}
                            </>
                        )}
                    </>
                )}
            </main>
            
            {editingTask && (
                <EditTaskModal
                    task={editingTask}
                    allTasks={tasks} 
                    onSave={handleSaveTask}
                    onDelete={requestDeleteTask}
                    onClose={() => setEditingTask(null)}
                    onAddGoal={addGoal}
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
                    }}
                    onApplyChanges={handleApplyAIChanges}
                    tasks={tasks}
                    apiKey={hasApiKey ? (settings.geminiApiKey || getEnvVar('VITE_GEMINI_API_KEY')) : undefined}
                    onSaveApiKey={(key) => updateSettings({ geminiApiKey: key })} // H-01: Use hook
                />
            )}
            {showShortcutsModal && (
                <ShortcutsModal onClose={() => setShowShortcutsModal(false)} />
            )}
            {showIntegrationsModal && (
                <IntegrationsModal
                    settings={settings}
                    onUpdateSettings={updateSettings} // H-01: Use hook
                    onClose={() => setShowIntegrationsModal(false)}
                    googleAuthState={googleAuth}
                    onGoogleSignIn={handleGoogleSignIn}
                    onGoogleSignOut={handleGoogleSignOut}
                    initialTab={activeSettingsTab}
                />
            )}
            
            <ConfirmModal 
                isOpen={confirmModalState.isOpen}
                title={confirmModalState.title}
                message={confirmModalState.message}
                isDestructive={confirmModalState.isDestructive}
                onConfirm={confirmModalState.onConfirm}
                onCancel={() => setConfirmModalState(prev => ({...prev, isOpen: false}))}
                confirmLabel="Delete"
            />

             {contextMenu && (
                <div
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg py-1 w-48"
                    onClick={(e) => e.stopPropagation()} 
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <div className="px-3 py-1 text-sm font-bold border-b border-gray-200 dark:border-gray-700 mb-1 truncate">{contextMenu.task.title}</div>
                    
                    <button
                        onClick={() => handleEditFromContextMenu(contextMenu.task)}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                        <i className="fas fa-edit text-blue-500 w-4"></i> Edit Task
                    </button>
                    
                    <button
                        onClick={() => {
                            handleTogglePin(contextMenu.task.id);
                            setContextMenu(null);
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                        <i className={`fas fa-thumbtack w-4 ${contextMenu.task.isPinned ? 'text-indigo-500' : 'text-gray-400'}`}></i> 
                        {contextMenu.task.isPinned ? 'Unpin' : 'Pin'}
                    </button>

                    <button
                        onClick={() => handleDeleteFromContextMenu(contextMenu.task)}
                        className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2 mb-1"
                    >
                        <i className="fas fa-trash-alt w-4"></i> Delete
                    </button>

                    <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                    <p className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase">Move to:</p>
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
