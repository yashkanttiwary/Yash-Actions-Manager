
import React, { useState, useCallback, useMemo } from 'react';
import { SettingsProvider, AuthProvider, TaskProvider, useTaskContext, useSettingsContext, useAuthContext } from './contexts';
import { KanbanBoard } from './components/KanbanBoard';
import { Header } from './components/Header';
import { Task, Status, Priority, SettingsTab, Goal, TaskDiff } from './types';
import { EditTaskModal } from './components/EditTaskModal';
import { BlockerModal } from './components/BlockerModal';
import { ResolveBlockerModal } from './components/ResolveBlockerModal';
import { AIAssistantModal } from './components/AIAssistantModal';
import { CalendarView } from './components/CalendarView';
import { TimelineGantt } from './components/TimelineGantt';
import { GoalBoard } from './components/GoalBoard';
import { FocusView } from './components/FocusView';
import { breakDownTask, parseTaskFromVoice, analyzeTaskPsychology } from './services/geminiService';
import { COLUMN_STATUSES, UNASSIGNED_GOAL_ID } from './constants';
import { ShortcutsModal } from './components/ShortcutsModal';
import { IntegrationsModal } from './components/IntegrationsModal';
import { useBackgroundAudio } from './hooks/useBackgroundAudio';
import { ConfirmModal } from './components/ConfirmModal';
import { getEnvVar } from './utils/env';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { StarField } from './components/StarField';
import { TrashModal } from './components/TrashModal';
import { WelcomeModal } from './components/WelcomeModal'; // Import

// --- MAIN APP CONTENT COMPONENT ---
// Separated to use Context Hooks
const AppContent: React.FC = () => {
    // Context Consumption
    const { 
        tasks, goals, columns, columnLayouts, deletedTasks,
        addTask, updateTask, deleteTask, restoreTask, permanentlyDeleteTask, emptyTrash,
        moveTask, setAllTasks, addGoal, updateGoal, deleteGoal,
        toggleTaskPin, reorderPinnedTasks, getTasksByStatus, updateColumnLayout, resetColumnLayouts,
        isLoading, activeTaskTimer, toggleTimer, 
        syncStatus, manualPull, manualPush, connectionHealth
    } = useTaskContext();

    const { settings, updateSettings } = useSettingsContext();
    const { googleAuth, signIn, signOut } = useAuthContext();

    // Local UI State
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
    const [isCompactMode, setIsCompactMode] = useState(true);
    const [isFitToScreen, setIsFitToScreen] = useState(true);
    const [zoomLevel, setZoomLevel] = useState(0.9);
    const [showTimeline, setShowTimeline] = useState(false);
    const [isMenuLocked, setIsMenuLocked] = useState(localStorage.getItem('isMenuLocked') === 'true');
    const [isMenuHovered, setIsMenuHovered] = useState(false);
    const [isRocketFlying, setIsRocketFlying] = useState(false);
    
    // View State
    const [viewMode, setViewMode] = useState<'kanban' | 'calendar' | 'goals' | 'focus'>((localStorage.getItem('viewMode') as any) || 'kanban');
    const [focusMode, setFocusMode] = useState<Status | 'None'>((localStorage.getItem('focusMode') as any) || 'None');
    const [focusedGoalId, setFocusedGoalId] = useState<string | null>(localStorage.getItem('focusedGoalId'));
    const [isTodayView, setIsTodayView] = useState<boolean>(localStorage.getItem('isTodayView') === 'true');

    // Modals
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [blockingTask, setBlockingTask] = useState<Task | null>(null);
    const [resolvingBlockerTask, setResolvingBlockerTask] = useState<{ task: Task; newStatus: Status; newIndex: number } | null>(null);
    const [showAIModal, setShowAIModal] = useState(false);
    const [showTrashModal, setShowTrashModal] = useState(false);
    const [showIntegrationsModal, setShowIntegrationsModal] = useState(false);
    const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('general');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: Task } | null>(null);
    const [showShortcutsModal, setShowShortcutsModal] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'warning'; action?: { label: string; onClick: () => void } } | null>(null);
    const [confirmModalState, setConfirmModalState] = useState<{ isOpen: boolean; title: string; message: string; isDestructive?: boolean; onConfirm: () => void; }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
    
    // Setup State
    const isSheetConfigured = !!(settings.googleSheetId || settings.googleAppsScriptUrl);
    // Show welcome if not configured AND user hasn't explicitly skipped it this session (could persist skip in localStorage if desired)
    const [hasSkippedSetup, setHasSkippedSetup] = useState(false);
    const showWelcome = !isSheetConfigured && !hasSkippedSetup && !isLoading;

    // Services
    const audioControls = useBackgroundAudio(settings.audio);
    
    const isSpaceModeActive = useMemo(() => theme === 'space', [theme]);
    const hasApiKey = !!(settings.geminiApiKey || getEnvVar('VITE_GEMINI_API_KEY'));

    // Effects
    React.useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('dark');
        if (theme === 'dark' || theme === 'space') root.classList.add('dark');
        localStorage.setItem('theme', theme);
    }, [theme]);

    React.useEffect(() => {
        localStorage.setItem('viewMode', viewMode);
        localStorage.setItem('isTodayView', String(isTodayView));
        if (focusMode !== 'None') localStorage.setItem('focusMode', focusMode); else localStorage.removeItem('focusMode');
        if (focusedGoalId) localStorage.setItem('focusedGoalId', focusedGoalId); else localStorage.removeItem('focusedGoalId');
    }, [viewMode, isTodayView, focusMode, focusedGoalId]);

    React.useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    React.useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, []);

    // Handlers
    const toggleTheme = () => {
        setTheme(prev => {
            if (prev === 'light') return 'dark';
            if (prev === 'dark') return 'space';
            return 'light';
        });
    };

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
            tags: [], subtasks: [], statusChangeDate: new Date().toISOString(), actualTimeSpent: 0,
            scheduledStartDateTime: scheduledDateTime, dependencies: [], blockers: [], currentSessionStartTime: null,
            goalId: focusedGoalId && focusedGoalId !== UNASSIGNED_GOAL_ID ? focusedGoalId : undefined,
            isPinned: false
        });
    }, [focusedGoalId]);

    const handleVoiceTaskAdd = useCallback(async (transcript: string, defaultStatus: Status) => {
        const effectiveKey = settings.geminiApiKey || getEnvVar('VITE_GEMINI_API_KEY');
        if (!effectiveKey) {
             addTask({ title: transcript, status: defaultStatus, priority: 'Medium', dueDate: new Date().toISOString().split('T')[0], goalId: focusedGoalId && focusedGoalId !== UNASSIGNED_GOAL_ID ? focusedGoalId : undefined });
             return;
        }
        try {
            const parsedData = await parseTaskFromVoice(transcript, effectiveKey, goals);
            setEditingTask({
                ...parsedData,
                id: `new-${Date.now()}`,
                createdDate: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                statusChangeDate: new Date().toISOString(),
                actualTimeSpent: 0,
                isPinned: false,
                isDeleted: false,
                blockers: parsedData.blockerReason ? [{ id: `blocker-${Date.now()}`, reason: parsedData.blockerReason, createdDate: new Date().toISOString(), resolved: false }] : []
            });
        } catch (error) {
            addTask({ title: transcript, status: defaultStatus, priority: 'Medium', dueDate: new Date().toISOString().split('T')[0] });
        }
    }, [addTask, settings.geminiApiKey, focusedGoalId, goals]);

    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            if (task.isDeleted) return false;
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
            return true;
        });
    }, [tasks, isTodayView, focusedGoalId, goals]);

    // Derived
    const activeFocusGoal = useMemo(() => focusedGoalId ? (focusedGoalId === UNASSIGNED_GOAL_ID ? { id: UNASSIGNED_GOAL_ID, title: 'Unassigned', color: '#64748b' } as Goal : goals.find(g => g.id === focusedGoalId)) : null, [focusedGoalId, goals]);
    const gamification = { xp: 0, level: 1, streak: { current: 0, longest: 0, lastCompletionDate: null } }; // Placeholder

    // Keyboard Shortcuts
    useKeyboardShortcuts({
        isSheetConfigured,
        handleOpenAddTaskModal, setShowAIModal, setIsTodayView,
        setViewMode: (val) => setViewMode(val as any),
        setShowShortcutsModal, setZoomLevel,
        closeAllModals: () => { setEditingTask(null); setShowAIModal(false); setShowTrashModal(false); setShowIntegrationsModal(false); },
        isAnyModalOpen: !!(editingTask || showAIModal || showTrashModal || showIntegrationsModal)
    });

    return (
        <div className={`bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-white h-screen flex flex-col overflow-hidden font-sans ${isSpaceModeActive ? 'bg-transparent' : 'bg-dots'} transition-colors duration-300 relative`}>
            {isSpaceModeActive && <StarField />}
            
            <Header
                tasks={filteredTasks} goals={goals} isTodayView={isTodayView} setIsTodayView={setIsTodayView}
                onOpenAIAssistant={() => setShowAIModal(true)} onToggleTheme={toggleTheme} currentTheme={theme}
                onResetLayout={resetColumnLayouts} gamification={gamification} settings={settings} onUpdateSettings={updateSettings}
                currentViewMode={viewMode} onViewModeChange={setViewMode} googleAuthState={googleAuth}
                onGoogleSignIn={signIn} onGoogleSignOut={signOut} onOpenShortcutsModal={() => setShowShortcutsModal(true)}
                focusMode={focusMode} setFocusMode={setFocusMode} onOpenSettings={(tab) => { setActiveSettingsTab(tab || 'general'); setShowIntegrationsModal(true); }}
                connectionHealth={connectionHealth} syncStatus={syncStatus} onManualPull={manualPull} onManualPush={manualPush}
                isCompactMode={isCompactMode} onToggleCompactMode={() => setIsCompactMode(!isCompactMode)}
                isFitToScreen={isFitToScreen} onToggleFitToScreen={() => setIsFitToScreen(!isFitToScreen)}
                zoomLevel={zoomLevel} setZoomLevel={setZoomLevel} audioControls={audioControls}
                isTimelineVisible={showTimeline} onToggleTimeline={() => setShowTimeline(!showTimeline)}
                isMenuLocked={isMenuLocked} setIsMenuLocked={setIsMenuLocked}
                isRocketFlying={isRocketFlying} onRocketLaunch={setIsRocketFlying}
                isMenuHovered={isMenuHovered} onMenuHoverChange={setIsMenuHovered}
                activeFocusGoal={activeFocusGoal} onFocusGoal={setFocusedGoalId} onExitFocus={() => setFocusedGoalId(null)}
            />

            {deletedTasks.length > 0 && (
                <button onClick={() => setShowTrashModal(true)} className="fixed bottom-24 right-6 z-50 bg-gray-800 text-white dark:bg-gray-700 w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform md:bottom-6 md:right-auto md:left-6">
                    <i className="fas fa-trash-alt"></i>
                </button>
            )}

            <main className="flex-1 overflow-auto pl-2 sm:pl-6 pr-2 pb-2 relative flex flex-col scroll-smooth transition-all duration-700 z-10 md:pt-[50px] pt-16 pb-20 md:pb-2" style={{ paddingTop: window.innerWidth >= 768 && (isMenuLocked || isMenuHovered) ? '200px' : undefined }}>
                {notification && (
                    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-2 fade-in duration-300">
                        <div className={`px-4 py-2 rounded-lg shadow-xl text-sm font-bold flex items-center gap-2 ${notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-indigo-600 text-white'}`}>
                            {notification.message}
                            {notification.action && <button onClick={notification.action.onClick} className="ml-2 bg-white text-indigo-600 px-2 py-0.5 rounded text-xs font-extrabold uppercase">{notification.action.label}</button>}
                        </div>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex justify-center items-center h-full"><i className="fas fa-spinner fa-spin text-4xl text-indigo-500"></i></div>
                ) : (
                    <>
                        {viewMode === 'kanban' && (
                            <>
                                <TimelineGantt tasks={filteredTasks} onEditTask={setEditingTask} onUpdateTask={updateTask} addTask={addTask} isVisible={showTimeline} timezone={settings.timezone} />
                                <div className="flex-grow">
                                    <KanbanBoard
                                        tasks={filteredTasks} columns={columns} columnLayouts={columnLayouts}
                                        getTasksByStatus={(s) => getTasksByStatus(s, filteredTasks)}
                                        onTaskMove={(id, s, i) => { 
                                            const task = tasks.find(t => t.id === id);
                                            // Handle blocker logic locally or in moveTask
                                            moveTask(id, s, i); 
                                        }}
                                        onEditTask={setEditingTask} onAddTask={handleOpenAddTaskModal}
                                        onQuickAddTask={(title, status) => addTask({ title, status, priority: 'Medium', dueDate: new Date().toISOString().split('T')[0] })}
                                        onSmartAddTask={handleVoiceTaskAdd}
                                        onUpdateTask={updateTask} onUpdateColumnLayout={updateColumnLayout}
                                        activeTaskTimer={activeTaskTimer} onToggleTimer={toggleTimer}
                                        onOpenContextMenu={(e, t) => setContextMenu({ x: e.clientX, y: e.clientY, task: t })}
                                        focusMode={focusMode} onDeleteTask={deleteTask} onSubtaskToggle={(tid, sid) => { const t = tasks.find(x => x.id === tid); if(t) updateTask({...t, subtasks: t.subtasks?.map(s => s.id === sid ? {...s, isCompleted: !s.isCompleted} : s)}) }}
                                        onBreakDownTask={async (id) => { const t = tasks.find(x => x.id === id); if(t) { const steps = await breakDownTask(t.title, settings.geminiApiKey); updateTask({...t, subtasks: [...(t.subtasks||[]), ...steps]}); } }}
                                        isCompactMode={isCompactMode} isFitToScreen={isFitToScreen} zoomLevel={zoomLevel} isSpaceMode={isSpaceModeActive} goals={goals} onTogglePin={toggleTaskPin}
                                    />
                                </div>
                            </>
                        )}
                        {viewMode === 'calendar' && (
                            <div className="flex-grow h-full">
                                <CalendarView tasks={filteredTasks} onUpdateTask={updateTask} onEditTask={setEditingTask} onAddTask={handleOpenAddTaskModal} timezone={settings.timezone} />
                            </div>
                        )}
                        {viewMode === 'goals' && (
                            <div className="flex-grow h-full">
                                <GoalBoard
                                    tasks={filteredTasks} goals={goals} onTaskMove={(tid, gid) => { const t = tasks.find(x => x.id === tid); if(t) updateTask({...t, goalId: gid}); }}
                                    onEditTask={setEditingTask} onDeleteTask={deleteTask} onAddGoal={addGoal} onEditGoal={updateGoal} onUpdateTask={updateTask}
                                    onDeleteGoal={(gid) => { deleteGoal(gid); setFocusedGoalId(null); }} activeTaskTimer={activeTaskTimer} onToggleTimer={toggleTimer}
                                    onSubtaskToggle={(tid, sid) => { const t = tasks.find(x => x.id === tid); if(t) updateTask({...t, subtasks: t.subtasks?.map(s => s.id === sid ? {...s, isCompleted: !s.isCompleted} : s)}) }}
                                    isCompactMode={isCompactMode} isSpaceMode={isSpaceModeActive} zoomLevel={zoomLevel} onFocusGoal={setFocusedGoalId} currentFocusId={focusedGoalId}
                                />
                            </div>
                        )}
                        {viewMode === 'focus' && (
                            <FocusView
                                tasks={filteredTasks} goals={goals} onEditTask={setEditingTask} onUpdateTask={updateTask}
                                onTogglePin={toggleTaskPin} onSubtaskToggle={(tid, sid) => { const t = tasks.find(x => x.id === tid); if(t) updateTask({...t, subtasks: t.subtasks?.map(s => s.id === sid ? {...s, isCompleted: !s.isCompleted} : s)}) }}
                                onDeleteTask={deleteTask} isSpaceMode={isSpaceModeActive} activeTaskTimer={activeTaskTimer} onToggleTimer={toggleTimer}
                                onReorderTasks={reorderPinnedTasks} headerHeight={isMenuLocked || isMenuHovered ? '200px' : '50px'}
                            />
                        )}
                    </>
                )}
            </main>

            {showWelcome && (
                <WelcomeModal 
                    onConnect={(url) => {
                        updateSettings({ googleAppsScriptUrl: url });
                    }}
                    onSkip={() => setHasSkippedSetup(true)}
                />
            )}

            {editingTask && <EditTaskModal task={editingTask} allTasks={tasks} onSave={(t) => { t.id.startsWith('new-') ? addTask(t as any) : updateTask(t); setEditingTask(null); }} onDelete={deleteTask} onClose={() => setEditingTask(null)} onAddGoal={addGoal} />}
            {blockingTask && <BlockerModal task={blockingTask} onSetBlocker={(t, r) => { updateTask({...t, blockers: [...(t.blockers||[]), {id: Date.now().toString(), reason: r, createdDate: new Date().toISOString(), resolved: false}], status: 'Blocker'}); setBlockingTask(null); }} onClose={() => setBlockingTask(null)} />}
            {resolvingBlockerTask && <ResolveBlockerModal task={resolvingBlockerTask.task} onResolve={(t) => { updateTask({...t, blockers: t.blockers?.map(b => ({...b, resolved: true}))}); moveTask(t.id, resolvingBlockerTask.newStatus, resolvingBlockerTask.newIndex); setResolvingBlockerTask(null); }} onClose={() => setResolvingBlockerTask(null)} />}
            {showAIModal && <AIAssistantModal onClose={() => setShowAIModal(false)} onApplyChanges={async (diff) => { diff.added.forEach(t => addTask(t as any)); diff.updated.forEach(t => { const ex = tasks.find(x => x.id === t.id); if(ex) updateTask({...ex, ...t}); }); diff.deletedIds.forEach(id => deleteTask(id)); }} tasks={filteredTasks} apiKey={settings.geminiApiKey} onSaveApiKey={(k) => updateSettings({ geminiApiKey: k })} />}
            {showTrashModal && <TrashModal deletedTasks={deletedTasks} onRestore={restoreTask} onDeleteForever={permanentlyDeleteTask} onEmptyTrash={() => { emptyTrash(); setShowTrashModal(false); }} onClose={() => setShowTrashModal(false)} />}
            {showShortcutsModal && <ShortcutsModal onClose={() => setShowShortcutsModal(false)} />}
            {showIntegrationsModal && <IntegrationsModal settings={settings} onUpdateSettings={updateSettings} onClose={() => setShowIntegrationsModal(false)} googleAuthState={googleAuth} onGoogleSignIn={signIn} onGoogleSignOut={signOut} initialTab={activeSettingsTab} />}
            <ConfirmModal isOpen={confirmModalState.isOpen} title={confirmModalState.title} message={confirmModalState.message} isDestructive={confirmModalState.isDestructive} onConfirm={confirmModalState.onConfirm} onCancel={() => setConfirmModalState(prev => ({ ...prev, isOpen: false }))} />
            {contextMenu && (
                <div style={{ top: contextMenu.y, left: contextMenu.x }} className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg py-1 w-48" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
                    <div className="px-3 py-1 text-sm font-bold border-b border-gray-200 dark:border-gray-700 mb-1 truncate">{contextMenu.task.title}</div>
                    <button onClick={() => { setEditingTask(contextMenu.task); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"><i className="fas fa-edit text-blue-500 w-4"></i> Edit Task</button>
                    <button onClick={() => { toggleTaskPin(contextMenu.task.id); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"><i className={`fas fa-thumbtack w-4 ${contextMenu.task.isPinned ? 'text-indigo-500' : 'text-gray-400'}`}></i> {contextMenu.task.isPinned ? 'Unpin' : 'Pin'}</button>
                    <button onClick={() => { deleteTask(contextMenu.task.id); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2 mb-1"><i className="fas fa-trash-alt w-4"></i> Trash</button>
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                    {COLUMN_STATUSES.map(s => <button key={s} onClick={() => { moveTask(contextMenu.task.id, s, 0); setContextMenu(null); }} className="block w-full text-left px-3 py-1 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50" disabled={contextMenu.task.status === s}>{s}</button>)}
                </div>
            )}
        </div>
    );
};

const App: React.FC = () => {
    return (
        <SettingsProvider>
            <AuthProvider>
                <TaskProvider>
                    <AppContent />
                </TaskProvider>
            </AuthProvider>
        </SettingsProvider>
    );
};

export default App;
        