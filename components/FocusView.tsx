
import React, { useMemo, useState, useEffect } from 'react';
import { Task, Goal, Status, Priority } from '../types';
import { FocusTaskCard } from './FocusTaskCard';
import { storage } from '../utils/storage';
import { PRIORITY_LABELS, PRIORITY_COLORS, PRIORITY_ORDER } from '../constants';

interface FocusViewProps {
    tasks: Task[];
    goals: Goal[];
    onEditTask: (task: Task) => void;
    onUpdateTask: (task: Task) => void;
    onTogglePin: (taskId: string) => void;
    onSubtaskToggle: (taskId: string, subtaskId: string) => void;
    onDeleteTask: (taskId: string) => void;
    isSpaceMode: boolean;
    // New Props
    activeTaskTimer: {taskId: string, startTime: number} | null;
    onToggleTimer: (taskId: string) => void;
    onReorderTasks: (activeId: string, overId: string) => void;
    headerHeight: string; // Dynamic header height
}

export const FocusView: React.FC<FocusViewProps> = ({
    tasks, goals, onEditTask, onUpdateTask, onTogglePin, onSubtaskToggle, onDeleteTask, isSpaceMode,
    activeTaskTimer, onToggleTimer, onReorderTasks, headerHeight
}) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [dragOverFocus, setDragOverFocus] = useState(false);
    const [dragOverSidebar, setDragOverSidebar] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Load sidebar state on mount (only for desktop default)
    useEffect(() => {
        const loadSidebarState = async () => {
            const savedState = await storage.get('focusSidebarOpen');
            if (savedState !== null && !isMobile) {
                setIsSidebarOpen(savedState === 'true');
            } else if (isMobile) {
                // Default closed on mobile
                setIsSidebarOpen(false);
            }
        };
        loadSidebarState();
    }, [isMobile]);

    const toggleSidebar = () => {
        const newState = !isSidebarOpen;
        setIsSidebarOpen(newState);
        storage.set('focusSidebarOpen', String(newState));
    };

    // 1. Filter Pinned Tasks and Sort by focusOrder
    const pinnedTasks = useMemo(() => {
        return tasks
            .filter(t => t.isPinned)
            .sort((a, b) => {
                // Primary Sort: Manual Focus Order
                if (a.focusOrder !== undefined && b.focusOrder !== undefined) {
                    return a.focusOrder - b.focusOrder;
                }
                // Fallback Sort: Priority then Due Date
                // Use Centralized PRIORITY_ORDER
                const pA = PRIORITY_ORDER[a.priority] || 0;
                const pB = PRIORITY_ORDER[b.priority] || 0;
                if (pA !== pB) return pB - pA;
                return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            });
    }, [tasks]);

    // Split tasks into sections for display (but keep them unlimited)
    const coreTasks = pinnedTasks.slice(0, 3);
    const bonusTasks = pinnedTasks.slice(3, 5);
    const additionalTasks = pinnedTasks.slice(5);

    // 2. Backlog Tasks (Unpinned, not Done)
    const backlogTasks = useMemo(() => {
        return tasks
            .filter(t => !t.isPinned && t.status !== 'Done' && t.status !== "Won't Complete")
            .sort((a, b) => (PRIORITY_ORDER[b.priority] || 0) - (PRIORITY_ORDER[a.priority] || 0));
    }, [tasks]);

    // Drag Handlers
    const handleDragStart = (e: React.DragEvent, taskId: string, source: 'sidebar' | 'focus') => {
        e.dataTransfer.setData('taskId', taskId);
        e.dataTransfer.setData('source', source);
        e.dataTransfer.effectAllowed = 'move';
        
        if (e.target instanceof HTMLElement) {
            const target = e.target;
            setTimeout(() => {
                target.classList.add('opacity-50');
            }, 0);
        }
    };

    const handleDropOnList = (e: React.DragEvent, targetId?: string) => {
        e.preventDefault();
        setDragOverFocus(false);
        const sourceId = e.dataTransfer.getData('taskId');
        const source = e.dataTransfer.getData('source');
        
        if (source === 'focus') {
            // Reordering within Focus View
            if (targetId && sourceId !== targetId) {
                onReorderTasks(sourceId, targetId);
            }
        } else if (source === 'sidebar') {
            // Adding from Sidebar - Unlimited in K-Mode
            if (sourceId) {
                onTogglePin(sourceId);
            }
        }
    };

    const handleDropOnSidebar = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOverSidebar(false);
        const taskId = e.dataTransfer.getData('taskId');
        const source = e.dataTransfer.getData('source');

        // Only unpin if it came from the focus view
        if (source === 'focus' && taskId) {
            onTogglePin(taskId);
        }
    };

    return (
        <div className="flex h-full w-full overflow-hidden relative flex-col md:flex-row">
            
            {/* MAIN FOCUS AREA */}
            <div 
                className={`flex-1 overflow-y-auto custom-scrollbar p-4 md:p-12 flex flex-col items-center relative transition-all duration-300 ${dragOverFocus ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : ''}`}
                style={{ paddingRight: (isSidebarOpen && !isMobile) ? '340px' : (isMobile ? '16px' : '40px') }}
                onDragOver={(e) => { e.preventDefault(); setDragOverFocus(true); }}
                onDragLeave={() => setDragOverFocus(false)}
                onDrop={(e) => handleDropOnList(e)} // Drop on background appends
            >
                
                {/* Header */}
                <div className="w-full max-w-3xl mb-4 md:mb-8 text-center mt-2 md:mt-0">
                    <h1 className={`text-2xl md:text-5xl font-black mb-1 md:mb-3 tracking-tight ${isSpaceMode ? 'text-white drop-shadow-md' : 'text-gray-900 dark:text-white'}`}>
                        Action in the Now
                    </h1>
                    <p className={`text-base md:text-xl font-light tracking-wide ${isSpaceMode ? 'text-indigo-200' : 'text-indigo-600 dark:text-indigo-400'}`}>
                        Do the necessary
                    </p>
                </div>

                {/* ZONE A: CORE 3 */}
                <div className="w-full max-w-3xl space-y-3 md:space-y-6 mb-6 md:mb-12">
                    <div className="flex items-center gap-4 md:gap-6 mb-2 md:mb-6">
                        <div className={`h-px flex-1 ${isSpaceMode ? 'bg-indigo-500/30' : 'bg-indigo-200 dark:bg-indigo-900'}`}></div>
                        <h2 className={`text-xs md:text-sm font-bold uppercase tracking-[0.2em] ${isSpaceMode ? 'text-indigo-300' : 'text-indigo-600 dark:text-indigo-400'}`}>
                            Necessary Action
                        </h2>
                        <div className={`h-px flex-1 ${isSpaceMode ? 'bg-indigo-500/30' : 'bg-indigo-200 dark:bg-indigo-900'}`}></div>
                    </div>

                    {coreTasks.length === 0 ? (
                        <div className={`border-3 border-dashed rounded-3xl p-8 md:p-16 text-center transition-all ${isSpaceMode ? 'border-slate-700/50 text-slate-500' : 'border-gray-200 dark:border-gray-800 text-gray-400'}`}>
                            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mx-auto mb-4">
                                <i className="far fa-star text-3xl md:text-4xl opacity-50"></i>
                            </div>
                            <p className="text-lg md:text-xl font-medium mb-1">Silence before action.</p>
                            <p className="text-xs md:text-sm opacity-70">Drag necessary tasks here.</p>
                        </div>
                    ) : (
                        coreTasks.map(task => (
                            <FocusTaskCard 
                                key={task.id} 
                                task={task} 
                                goals={goals}
                                onEditTask={onEditTask} 
                                onUpdateTask={onUpdateTask}
                                onSubtaskToggle={onSubtaskToggle}
                                onDeleteTask={onDeleteTask}
                                onUnpin={onTogglePin}
                                isCore={true} 
                                isSpaceMode={isSpaceMode}
                                activeTaskTimer={activeTaskTimer}
                                onToggleTimer={onToggleTimer}
                                onDragStart={(e) => handleDragStart(e, task.id, 'focus')}
                                onDrop={handleDropOnList}
                            />
                        ))
                    )}
                </div>

                {/* ZONE B: BONUS 2 */}
                {bonusTasks.length > 0 && (
                    <div className="w-full max-w-3xl space-y-3 md:space-y-6 mb-6 md:mb-12">
                        <div className="flex items-center gap-4 md:gap-6 mb-2 md:mb-6">
                            <div className={`h-px flex-1 ${isSpaceMode ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
                            <h2 className={`text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] ${isSpaceMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                Subsidiary Facts
                            </h2>
                            <div className={`h-px flex-1 ${isSpaceMode ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
                        </div>

                        {bonusTasks.map(task => (
                            <FocusTaskCard 
                                key={task.id} 
                                task={task} 
                                goals={goals}
                                onEditTask={onEditTask} 
                                onUpdateTask={onUpdateTask}
                                onSubtaskToggle={onSubtaskToggle}
                                onDeleteTask={onDeleteTask}
                                onUnpin={onTogglePin}
                                isCore={false}
                                isSpaceMode={isSpaceMode}
                                activeTaskTimer={activeTaskTimer}
                                onToggleTimer={onToggleTimer}
                                onDragStart={(e) => handleDragStart(e, task.id, 'focus')}
                                onDrop={handleDropOnList}
                            />
                        ))}
                    </div>
                )}

                {/* ZONE C: ADDITIONAL (UNLIMITED) */}
                {additionalTasks.length > 0 && (
                    <div className="w-full max-w-3xl space-y-3 md:space-y-6 mb-16">
                        <div className="flex items-center gap-4 md:gap-6 mb-2 md:mb-6">
                            <div className={`h-px flex-1 ${isSpaceMode ? 'bg-gray-800' : 'bg-gray-200'}`}></div>
                            <h2 className={`text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] ${isSpaceMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                Further Action
                            </h2>
                            <div className={`h-px flex-1 ${isSpaceMode ? 'bg-gray-800' : 'bg-gray-200'}`}></div>
                        </div>

                        {additionalTasks.map(task => (
                            <FocusTaskCard 
                                key={task.id} 
                                task={task} 
                                goals={goals}
                                onEditTask={onEditTask} 
                                onUpdateTask={onUpdateTask}
                                onSubtaskToggle={onSubtaskToggle}
                                onDeleteTask={onDeleteTask}
                                onUnpin={onTogglePin}
                                isCore={false}
                                isSpaceMode={isSpaceMode}
                                activeTaskTimer={activeTaskTimer}
                                onToggleTimer={onToggleTimer}
                                onDragStart={(e) => handleDragStart(e, task.id, 'focus')}
                                onDrop={handleDropOnList}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* SIDEBAR: BACKLOG (Mobile: Bottom Sheet / Desktop: Right Sidebar) */}
            <div 
                className={`fixed z-30 shadow-2xl transition-all duration-700 ease-in-out transform
                    ${isMobile 
                        ? 'bottom-0 left-0 right-0 h-[60vh] rounded-t-2xl border-t'
                        : 'right-0 top-0 bottom-0 w-80 border-l'
                    }
                    ${isSpaceMode 
                        ? 'bg-slate-900/95 border-slate-800' 
                        : 'bg-white/95 dark:bg-gray-900/95 border-gray-200 dark:border-gray-700 backdrop-blur-md'
                    }
                    ${isSidebarOpen 
                        ? 'translate-y-0 translate-x-0' 
                        : (isMobile ? 'translate-y-[100%]' : 'translate-x-full')
                    }
                    ${dragOverSidebar ? 'ring-2 ring-red-500 ring-inset bg-red-50/10' : ''}
                `}
                style={!isMobile ? { paddingTop: headerHeight } : {}}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverSidebar(true);
                }}
                onDragLeave={() => setDragOverSidebar(false)}
                onDrop={handleDropOnSidebar}
            >
                {/* PROMINENT TOGGLE TAB */}
                <button 
                    onClick={toggleSidebar}
                    className={`absolute flex items-center justify-center shadow-lg border-y cursor-pointer transition-all duration-300 group
                        ${isMobile
                            ? 'left-1/2 -translate-x-1/2 -top-8 w-24 h-8 rounded-t-xl border-x'
                            : '-left-10 top-1/2 -translate-y-1/2 w-10 h-32 rounded-l-xl border-l'
                        }
                        ${isSpaceMode 
                            ? 'bg-indigo-600/90 border-indigo-400/50 text-white hover:bg-indigo-500' 
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-indigo-600 dark:text-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }
                    `}
                    title={isSidebarOpen ? "Close Tasks Panel" : "Open Available Tasks"}
                >
                    <i className={`fas ${isMobile ? (isSidebarOpen ? 'fa-chevron-down' : 'fa-chevron-up') : (isSidebarOpen ? 'fa-chevron-right' : 'fa-chevron-left')} text-lg ${isMobile ? '' : 'mb-2'}`}></i>
                    {!isMobile && (
                        <span className="text-[10px] font-bold uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 opacity-80 group-hover:opacity-100">
                            {isSidebarOpen ? 'Close' : 'Tasks'}
                        </span>
                    )}
                </button>

                <div className="h-full flex flex-col p-4">
                    <h3 className={`font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2 ${isSpaceMode ? 'text-white' : 'text-gray-800 dark:text-white'}`}>
                        {dragOverSidebar ? (
                            <span className="text-red-500 animate-pulse"><i className="fas fa-trash-alt mr-2"></i>Drop to Unpin</span>
                        ) : (
                            <>
                                <i className="fas fa-inbox text-gray-400"></i> Available Tasks
                            </>
                        )}
                    </h3>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                        {backlogTasks.map(task => {
                            const priorityColors = PRIORITY_COLORS[task.priority];
                            return (
                                <div
                                    key={task.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, task.id, 'sidebar')}
                                    className={`p-3 rounded-lg border text-sm cursor-grab active:cursor-grabbing transition-all hover:translate-x-1
                                        ${isSpaceMode 
                                            ? 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300' 
                                            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
                                        }
                                    `}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-semibold truncate flex-1">{task.title}</span>
                                        {/* K-Mode: Correct Priority Display using Labels and Colors */}
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${priorityColors.bg} ${priorityColors.text}`}>
                                            {PRIORITY_LABELS[task.priority]}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs opacity-60">
                                        <span><i className="far fa-calendar"></i> {new Date(task.dueDate).toLocaleDateString(undefined, {month: 'numeric', day: 'numeric'})}</span>
                                        {task.timeEstimate && <span>• {task.timeEstimate}h</span>}
                                    </div>
                                </div>
                            );
                        })}
                        {backlogTasks.length === 0 && (
                            <div className="text-center p-8 opacity-50 text-sm">
                                No available tasks. <br/> Add some on the board!
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
