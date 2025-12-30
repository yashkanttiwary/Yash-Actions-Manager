
import React, { useMemo, useState } from 'react';
import { Task, Goal, Status, Priority } from '../types';
import { FocusTaskCard } from './FocusTaskCard';

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
}

// Helper to determine priority weight for sorting (fallback)
const getPriorityWeight = (p: Priority): number => {
    switch (p) {
        case 'Critical': return 4;
        case 'High': return 3;
        case 'Medium': return 2;
        case 'Low': return 1;
        default: return 0;
    }
};

export const FocusView: React.FC<FocusViewProps> = ({
    tasks, goals, onEditTask, onUpdateTask, onTogglePin, onSubtaskToggle, onDeleteTask, isSpaceMode,
    activeTaskTimer, onToggleTimer, onReorderTasks
}) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [dragOverFocus, setDragOverFocus] = useState(false);
    const [dragOverSidebar, setDragOverSidebar] = useState(false);

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
                const pA = getPriorityWeight(a.priority);
                const pB = getPriorityWeight(b.priority);
                if (pA !== pB) return pB - pA;
                return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            });
    }, [tasks]);

    const coreTasks = pinnedTasks.slice(0, 3);
    const bonusTasks = pinnedTasks.slice(3, 5);
    const isFull = pinnedTasks.length >= 5;

    // 2. Backlog Tasks (Unpinned, not Done)
    const backlogTasks = useMemo(() => {
        return tasks
            .filter(t => !t.isPinned && t.status !== 'Done' && t.status !== "Won't Complete")
            .sort((a, b) => getPriorityWeight(b.priority) - getPriorityWeight(a.priority));
    }, [tasks]);

    // 3. Goal Impact Calculation
    const impactGoals = useMemo(() => {
        const uniqueGoalIds = Array.from(new Set(pinnedTasks.map(t => t.goalId).filter(Boolean)));
        
        return uniqueGoalIds.map(goalId => {
            const goal = goals.find(g => g.id === goalId);
            if (!goal) return null;
            
            const relevantTasks = pinnedTasks.filter(t => t.goalId === goalId);
            const completedCount = relevantTasks.filter(t => t.status === 'Done').length;
            const progress = relevantTasks.length > 0 ? (completedCount / relevantTasks.length) * 100 : 0;
            
            return {
                ...goal,
                focusProgress: progress,
                taskCount: relevantTasks.length,
                completedCount
            };
        }).filter(Boolean) as (Goal & { focusProgress: number, taskCount: number, completedCount: number })[];
    }, [pinnedTasks, goals]);

    // Drag Handlers
    const handleDragStart = (e: React.DragEvent, taskId: string, source: 'sidebar' | 'focus') => {
        e.dataTransfer.setData('taskId', taskId);
        e.dataTransfer.setData('source', source);
        e.dataTransfer.effectAllowed = 'move';
        
        if (e.target instanceof HTMLElement) {
            setTimeout(() => {
                e.target.classList.add('opacity-50');
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
            // Adding from Sidebar
            if (isFull) {
                alert("Daily Limit Reached (5 Tasks). Please remove a task first.");
                return;
            }
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
        <div className="flex h-full w-full overflow-hidden relative">
            
            {/* MAIN FOCUS AREA */}
            <div 
                className={`flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12 flex flex-col items-center relative transition-colors ${dragOverFocus ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : ''}`}
                onDragOver={(e) => { e.preventDefault(); !isFull && setDragOverFocus(true); }}
                onDragLeave={() => setDragOverFocus(false)}
                onDrop={(e) => handleDropOnList(e)} // Drop on background appends
            >
                
                {/* Header */}
                <div className="w-full max-w-3xl mb-12 text-center">
                    <h1 className={`text-5xl font-black mb-3 tracking-tight ${isSpaceMode ? 'text-white drop-shadow-md' : 'text-gray-900 dark:text-white'}`}>
                        Daily Focus
                    </h1>
                    <p className={`text-xl font-light tracking-wide ${isSpaceMode ? 'text-indigo-200' : 'text-indigo-600 dark:text-indigo-400'}`}>
                        The 3 + 2 Method
                    </p>
                    {isFull && (
                        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-bold uppercase tracking-wider shadow-sm">
                            <i className="fas fa-lock"></i> Maximum Capacity Reached
                        </div>
                    )}
                </div>

                {/* ZONE A: CORE 3 */}
                <div className="w-full max-w-3xl space-y-8 mb-16">
                    <div className="flex items-center gap-6 mb-6">
                        <div className="h-px bg-indigo-500/30 flex-1"></div>
                        <h2 className={`text-sm font-bold uppercase tracking-[0.2em] ${isSpaceMode ? 'text-indigo-300' : 'text-indigo-600 dark:text-indigo-400'}`}>
                            The Core 3
                        </h2>
                        <div className="h-px bg-indigo-500/30 flex-1"></div>
                    </div>

                    {coreTasks.length === 0 ? (
                        <div className={`border-3 border-dashed rounded-3xl p-16 text-center transition-all ${isSpaceMode ? 'border-slate-700/50 text-slate-500' : 'border-gray-200 dark:border-gray-800 text-gray-400'}`}>
                            <div className="w-20 h-20 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mx-auto mb-4">
                                <i className="far fa-star text-4xl opacity-50"></i>
                            </div>
                            <p className="text-xl font-medium mb-1">Your canvas is empty.</p>
                            <p className="text-sm opacity-70">Drag critical tasks here from the sidebar.</p>
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

                {/* DIVIDER */}
                {pinnedTasks.length > 3 && (
                    <div className="w-full max-w-xl my-8 flex items-center justify-center opacity-30">
                        <div className="h-24 w-px border-l-2 border-dashed border-gray-400 dark:border-gray-500"></div>
                    </div>
                )}

                {/* ZONE B: BONUS 2 */}
                <div className="w-full max-w-3xl space-y-6 mb-24">
                    <div className="flex items-center gap-6 mb-6">
                        <div className="h-px bg-gray-300 dark:bg-gray-700 flex-1"></div>
                        <h2 className={`text-xs font-bold uppercase tracking-[0.2em] ${isSpaceMode ? 'text-slate-400' : 'text-gray-500'}`}>
                            The Bonus 2
                        </h2>
                        <div className="h-px bg-gray-300 dark:bg-gray-700 flex-1"></div>
                    </div>

                    {bonusTasks.length === 0 && coreTasks.length === 3 && (
                        <div className={`border-2 border-dashed rounded-2xl p-8 text-center opacity-60 ${isSpaceMode ? 'border-slate-700 text-slate-500' : 'border-gray-200 dark:border-gray-800 text-gray-400'}`}>
                            <p className="text-sm">Optional: Add up to 2 secondary tasks.</p>
                        </div>
                    )}

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

                {/* GOAL IMPACT FOOTER */}
                {impactGoals.length > 0 && (
                    <div className={`w-full max-w-3xl rounded-3xl p-8 border mb-12 ${isSpaceMode ? 'bg-white/5 border-white/10 backdrop-blur-md' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-lg'}`}>
                        <h3 className={`text-xs font-bold uppercase tracking-wider mb-6 flex items-center gap-2 ${isSpaceMode ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                            <i className="fas fa-chart-pie text-indigo-500"></i> Today's Strategic Impact
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {impactGoals.map(goal => (
                                <div key={goal.id} className="flex flex-col gap-2">
                                    <div className="flex justify-between items-center text-xs font-medium">
                                        <span style={{ color: goal.color }} className="font-bold text-sm">{goal.title}</span>
                                        <span className={isSpaceMode ? 'text-slate-400' : 'text-gray-500'}>
                                            {goal.completedCount}/{goal.taskCount}
                                        </span>
                                    </div>
                                    <div className={`h-3 rounded-full overflow-hidden ${isSpaceMode ? 'bg-slate-700' : 'bg-gray-100 dark:bg-gray-700'}`}>
                                        <div 
                                            className="h-full transition-all duration-500 ease-out rounded-full"
                                            style={{ width: `${goal.focusProgress}%`, backgroundColor: goal.color }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* SIDEBAR: BACKLOG (DROP ZONE FOR REMOVAL) */}
            <div 
                className={`fixed right-0 top-0 bottom-0 pt-16 z-20 w-80 shadow-2xl transition-transform duration-300 transform border-l
                    ${isSpaceMode 
                        ? 'bg-slate-900/95 border-slate-800' 
                        : 'bg-white/95 dark:bg-gray-900/95 border-gray-200 dark:border-gray-700 backdrop-blur-md'
                    }
                    ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}
                    ${dragOverSidebar ? 'ring-2 ring-red-500 ring-inset bg-red-50/10' : ''}
                `}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverSidebar(true);
                }}
                onDragLeave={() => setDragOverSidebar(false)}
                onDrop={handleDropOnSidebar}
            >
                <button 
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className={`absolute -left-8 top-24 w-8 h-10 flex items-center justify-center rounded-l-lg shadow-md border-l border-t border-b cursor-pointer
                        ${isSpaceMode 
                            ? 'bg-slate-800 border-slate-700 text-white' 
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                        }
                    `}
                >
                    <i className={`fas fa-chevron-${isSidebarOpen ? 'right' : 'left'}`}></i>
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
                        {backlogTasks.map(task => (
                            <div
                                key={task.id}
                                draggable={!isFull}
                                onDragStart={(e) => handleDragStart(e, task.id, 'sidebar')}
                                className={`p-3 rounded-lg border text-sm cursor-grab active:cursor-grabbing transition-all hover:translate-x-1
                                    ${isSpaceMode 
                                        ? 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300' 
                                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
                                    }
                                    ${isFull ? 'opacity-50 cursor-not-allowed' : ''}
                                `}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-semibold truncate flex-1">{task.title}</span>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${task.priority === 'Critical' ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-600'}`}>
                                        {task.priority}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs opacity-60">
                                    <span><i className="far fa-calendar"></i> {new Date(task.dueDate).toLocaleDateString(undefined, {month: 'numeric', day: 'numeric'})}</span>
                                    {task.timeEstimate && <span>• {task.timeEstimate}h</span>}
                                </div>
                            </div>
                        ))}
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
