
import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { Task, Status, Goal } from '../types';
import { PRIORITY_COLORS, TAG_COLORS, STATUS_STYLES, PRIORITY_LABELS } from '../constants';

interface TaskCardProps {
    task: Task;
    allTasks: Task[]; // All tasks needed for dependency tooltips
    goals?: Goal[]; // New Prop: Pass all goals to find color/title
    onEditTask: (task: Task) => void;
    activeTaskTimer: any; // Kept for interface compatibility but ignored
    onToggleTimer: (taskId:string) => void;
    onOpenContextMenu: (e: React.MouseEvent, task: Task) => void;
    onDeleteTask: (taskId: string) => void;
    onSubtaskToggle: (taskId: string, subtaskId: string) => void;
    onBreakDownTask?: (taskId: string) => Promise<void>;
    isCompactMode: boolean;
    onTaskSizeChange?: () => void;
}

const getTagColor = (tagName: string) => {
    let hash = 0;
    for (let i = 0; i < tagName.length; i++) {
        hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % TAG_COLORS.length);
    return TAG_COLORS[index];
};

const formatSeconds = (seconds: number = 0): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    const hours = (seconds / 3600).toFixed(1);
    return `${hours}h`;
};

const formatTimeSince = (dateStr: string): string => {
    const now = new Date();
    const date = new Date(dateStr);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};


export const TaskCard: React.FC<TaskCardProps> = ({ task, allTasks, goals = [], onEditTask, onToggleTimer, onOpenContextMenu, onDeleteTask, onSubtaskToggle, onBreakDownTask, isCompactMode, onTaskSizeChange }) => {
    const priorityClasses = PRIORITY_COLORS[task.priority];
    const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES['To Do'];
    const [currentSessionTime, setCurrentSessionTime] = useState(0);
    const [isBreakingDown, setIsBreakingDown] = useState(false);
    const isObservation = task.type === 'observation';
    
    // Derived Goal Data
    const assignedGoal = goals.find(g => g.id === task.goalId);
    
    // Local state to handle individual expansion
    const [isExpanded, setIsExpanded] = useState(false);

    // Reset expansion when global mode changes to ensure clean state
    useEffect(() => {
        setIsExpanded(false);
    }, [isCompactMode]);

    // ARCH-001: Trigger layout recalculation when expanded state changes
    useLayoutEffect(() => {
        if (onTaskSizeChange) {
            onTaskSizeChange();
        }
    }, [isExpanded, isCompactMode, onTaskSizeChange, task.subtasks?.length]);

    const handleExpandToggle = useCallback((e: React.MouseEvent, expanded: boolean) => {
        e.preventDefault();
        e.stopPropagation(); // CRITICAL: Stop propagation to prevent opening edit modal
        setIsExpanded(expanded);
    }, []);

    // K-Teaching: "Let the list be a mirror, not a judge."
    // Removed "Overdue" red styling. Changed to neutral "Date Passed".
    const isDatePassed = new Date(task.dueDate) < new Date() && task.status !== 'Done';
    
    const isActiveTimer = !!task.currentSessionStartTime;
    const isBlockedByDep = task.isBlockedByDependencies;
    const activeBlocker = task.blockers?.find(b => !b.resolved);

    const blockerTooltip = isBlockedByDep
        ? `Blocked by: ${task.dependencies?.map(depId => allTasks.find(t => t.id === depId)?.title).filter(Boolean).join(', ')}`
        : '';

    useEffect(() => {
        if (isActiveTimer && task.currentSessionStartTime) {
             const interval = setInterval(() => {
                setCurrentSessionTime(Date.now() - task.currentSessionStartTime!);
            }, 1000);
            return () => clearInterval(interval);
        } else {
            setCurrentSessionTime(0);
        }
    }, [isActiveTimer, task.currentSessionStartTime]);


    const completedSubtasks = task.subtasks?.filter(st => st.isCompleted).length || 0;
    const totalSubtasks = task.subtasks?.length || 0;
    const subtaskProgress = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        if (isBlockedByDep) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('taskId', task.id);
        const target = e.currentTarget;
        target.classList.add('ghost-card');
        setTimeout(() => {
            target.style.visibility = 'hidden';
        }, 0);
    };

    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        target.classList.remove('ghost-card');
        target.style.visibility = 'visible';
    };

    const handleCardClick = (e: React.MouseEvent) => {
        // Prevent edit modal if text is selected
        if (window.getSelection()?.toString()) return;
        onEditTask(task);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenContextMenu(e, task);
    };

    const handleDeleteClick = (e: React.MouseEvent) => {
        // Stop everything to prevent parent handlers (drag/edit)
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation(); 
        
        onDeleteTask(task.id);
    };

    const handleButtonMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        // Essential: Prevents the draggable parent from stealing the event
        e.stopPropagation();
    };

    const handleSubtaskClick = (e: React.MouseEvent, subtaskId: string) => {
        e.stopPropagation();
        e.preventDefault();
        onSubtaskToggle(task.id, subtaskId);
    };
    
    const handleStuckClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (!onBreakDownTask || isBreakingDown) return;
        
        setIsBreakingDown(true);
        try {
            await onBreakDownTask(task.id);
            setIsExpanded(true); // Auto-expand on success
        } catch (err) {
            console.error(err);
        } finally {
            setIsBreakingDown(false);
        }
    };

    const cardCursorClass = isBlockedByDep ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing';
    
    const renderTimerButton = (compact = false) => {
        if (task.status !== 'In Progress') return null;
        if (isObservation) return null;
        
        return (
            <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleTimer(task.id); }}
                onMouseDown={handleButtonMouseDown}
                onTouchStart={handleButtonMouseDown}
                className={`timer-button flex items-center gap-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${compact ? 'p-1' : 'px-2 py-1'}`}
                aria-label={isActiveTimer ? 'Pause timer' : 'Start timer'}
                disabled={isBlockedByDep}
            >
                <i className={`fas fa-fw ${isActiveTimer ? 'fa-pause text-red-500' : 'fa-play text-green-500'} ${compact ? 'text-xs' : ''}`}></i>
                {isActiveTimer && <span className="text-xs font-mono animate-pulse">{new Date(currentSessionTime).toISOString().substr(14, 5)}</span>}
            </button>
        );
    };

    // --- OBSERVATION CARD RENDER ---
    if (isObservation) {
        return (
            <div
                draggable={!isBlockedByDep}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                data-task-id={task.id}
                className={`group task-card relative bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm ${cardCursorClass} hover:shadow-md border-l-4 border-l-purple-400`}
                onClick={handleCardClick}
                onContextMenu={handleContextMenu}
            >
                <div className="flex items-start gap-2 mb-2">
                    <i className="fas fa-eye text-purple-500 mt-1"></i>
                    <h3 className="font-serif italic text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
                        "{task.title}"
                    </h3>
                </div>
                {task.description && <p className="text-xs text-gray-500 dark:text-gray-400 pl-6">{task.description}</p>}
                
                <div className="mt-3 flex justify-between items-center text-xs text-gray-400">
                    <span>Observation</span>
                    <button onClick={handleDeleteClick} className="hover:text-red-500 transition-colors"><i className="fas fa-times"></i></button>
                </div>
            </div>
        );
    }

    // --- COMPACT MODE RENDER ---
    if (isCompactMode && !isExpanded) {
        return (
            <div
                draggable={!isBlockedByDep}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                data-task-id={task.id}
                className={`group task-card relative bg-white dark:bg-gray-800 rounded-md p-2 border border-gray-200 dark:border-gray-700 shadow-sm ${cardCursorClass} hover:shadow-md ${statusStyle.cardBorder} ${isBlockedByDep ? 'opacity-60 saturate-50' : ''}`}
                onClick={handleCardClick}
                onContextMenu={handleContextMenu}
                title={`${task.title} (Priority: ${task.priority})`}
                role="article"
                aria-label={`Task: ${task.title}`}
            >
                <div className="relative flex items-center justify-between gap-2 z-10">
                    
                    {/* Left: Drag Handle + Title */}
                    <div className="flex items-center gap-2 flex-grow min-w-0">
                         {isBlockedByDep ? (
                             <i className="fas fa-lock text-xs text-amber-500 flex-shrink-0" title={blockerTooltip}></i>
                         ) : (
                             <div className="md:hidden text-gray-400 cursor-move">
                                 <i className="fas fa-grip-vertical text-xs"></i>
                             </div>
                         )}
                         
                         <span className={`text-sm font-medium text-gray-800 dark:text-gray-100 truncate`}>
                             {task.title}
                         </span>
                    </div>

                    {/* Right: Meta + Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Pin Icon Indicator (No Button) */}
                        {task.isPinned && (
                            <i className="fas fa-thumbtack text-[10px] text-indigo-500 transform rotate-45" title="Pinned to Focus"></i>
                        )}

                        {/* Priority Badge */}
                        <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded flex-shrink-0 uppercase ${priorityClasses.bg} ${priorityClasses.text} border ${priorityClasses.text.replace('text-', 'border-')} border-opacity-30`} title={`Priority: ${task.priority}`}>
                            {PRIORITY_LABELS[task.priority]}
                        </span>

                        {/* Goal Dot */}
                        {assignedGoal && (
                             <div 
                                className="flex-shrink-0 w-2.5 h-2.5 rounded-full" 
                                style={{ backgroundColor: assignedGoal.color }}
                                title={`Context: ${assignedGoal.title}`}
                             ></div>
                         )}

                        {/* Status/Blocker Icons */}
                        {activeBlocker && (
                            <i className="fas fa-exclamation-triangle text-red-500 text-xs" title={`Blocked: ${activeBlocker.reason}`}></i>
                        )}
                        
                        {totalSubtasks > 0 && (
                            <button 
                                type="button" 
                                onClick={(e) => handleExpandToggle(e, true)}
                                className="text-xs text-gray-500 dark:text-gray-400 font-mono flex items-center gap-1 hover:text-indigo-500 transition-colors" 
                                title={`${completedSubtasks}/${totalSubtasks} subtasks completed`}
                            >
                                <i className="fas fa-check-square text-[10px]"></i>
                                {completedSubtasks}/{totalSubtasks}
                            </button>
                        )}

                        {renderTimerButton(true)}

                        <button
                            type="button"
                            onClick={(e) => handleExpandToggle(e, true)}
                            onMouseDown={handleButtonMouseDown} 
                            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            title="Expand task details"
                            aria-label="Expand task details"
                        >
                            <i className="fas fa-chevron-down text-xs"></i>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // --- FULL MODE RENDER ---
    return (
        <div
            draggable={!isBlockedByDep}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            data-task-id={task.id}
            className={`group task-card task-card-tilt relative bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 shadow-md ${cardCursorClass} ${priorityClasses.glow} hover:shadow-2xl ${statusStyle.cardBorder} ${isBlockedByDep ? 'opacity-60 saturate-50' : ''}`}
            onClick={handleCardClick}
            onContextMenu={handleContextMenu}
            title={`Priority: ${task.priority}`}
            role="article"
            aria-label={`Task: ${task.title}`}
        >
            <div className="relative z-10">
                {/* Header */}
                <div className="flex justify-between items-start gap-2">
                    <h3 className="font-bold text-gray-800 dark:text-gray-100 flex-1 flex items-center gap-2 min-w-0 text-base">
                         {isBlockedByDep ? (
                             <i className="fas fa-lock text-xs text-amber-500 flex-shrink-0" title={blockerTooltip}></i>
                         ) : (
                            <div className="md:hidden text-gray-300 dark:text-gray-600 cursor-move mr-1">
                                <i className="fas fa-grip-vertical"></i>
                            </div>
                         )}
                        <span className="break-words leading-tight">{task.title}</span>
                    </h3>
                    
                    <div className="flex items-center gap-1 flex-shrink-0 relative z-20">
                        {/* Pin Indicator */}
                        {task.isPinned && (
                            <i className="fas fa-thumbtack text-xs text-indigo-500 transform rotate-45 mr-1" title="Pinned"></i>
                        )}

                        {/* Priority First */}
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${priorityClasses.bg} ${priorityClasses.text}`}>
                            {PRIORITY_LABELS[task.priority]}
                        </span>

                        {/* Goal Second */}
                        {assignedGoal && (
                            <span 
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white whitespace-nowrap shadow-sm truncate max-w-[80px]"
                                style={{ backgroundColor: assignedGoal.color }}
                                title={`Context: ${assignedGoal.title}`}
                            >
                                {assignedGoal.title}
                            </span>
                        )}
                        
                        {isCompactMode && isExpanded && (
                            <button
                                type="button"
                                onClick={(e) => handleExpandToggle(e, false)}
                                onMouseDown={handleButtonMouseDown} 
                                className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 shadow-sm transition-all hover:bg-gray-200 dark:hover:bg-gray-600 ml-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 relative z-30 pointer-events-auto"
                                title="Collapse to compact view"
                                aria-label="Collapse to compact view"
                            >
                                <i className="fas fa-chevron-up text-xs"></i>
                            </button>
                        )}
                    </div>
                </div>
                
                {task.description && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
                        {task.description}
                    </p>
                )}

                {activeBlocker && (
                     <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800">
                        <p className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                            <i className="fas fa-exclamation-triangle"></i> Blocker
                        </p>
                        <p className="text-xs text-red-500 dark:text-red-300 mt-0.5">{activeBlocker.reason}</p>
                     </div>
                )}
                
                <div className="flex flex-wrap gap-1 mt-3">
                    {task.tags?.map(tag => (
                        <span key={tag} className={`text-xs px-2 py-0.5 rounded-full text-white/90 font-medium ${getTagColor(tag)} shadow-sm`}>{tag}</span>
                    ))}
                </div>

                {/* Subtasks Section with "I'm Stuck" */}
                <div className="mt-3 bg-gray-50 dark:bg-gray-900/50 rounded-md p-2 relative">
                    <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                        <span className="font-semibold">Subtasks</span>
                        <div className="flex items-center gap-2">
                            <span>{completedSubtasks} / {totalSubtasks}</span>
                            {/* Stuck Button */}
                            {onBreakDownTask && task.status !== 'Done' && (
                                <button
                                    onClick={handleStuckClick}
                                    disabled={isBreakingDown}
                                    className={`w-5 h-5 flex items-center justify-center rounded-full transition-all border ${isBreakingDown ? 'border-transparent' : 'border-indigo-200 dark:border-indigo-800 hover:border-indigo-400 bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 text-indigo-500'}`}
                                    title="I'm Stuck (Break down task)"
                                >
                                    {isBreakingDown ? (
                                        <i className="fas fa-spinner fa-spin text-xs"></i>
                                    ) : (
                                        <i className="fas fa-brain text-[10px]"></i>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                    {totalSubtasks > 0 && (
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-2">
                            <div className="bg-green-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${subtaskProgress}%` }}></div>
                        </div>
                    )}
                    {/* Interactive Subtask List (Preview) */}
                    {totalSubtasks > 0 && (
                        <div className="space-y-1 cursor-default">
                            {task.subtasks?.slice(0, 3).map(st => (
                                <div 
                                    key={st.id} 
                                    className="flex items-center gap-2 text-xs hover:bg-gray-200 dark:hover:bg-gray-700/50 p-1 rounded cursor-pointer transition-colors group/subtask"
                                    onClick={(e) => handleSubtaskClick(e, st.id)}
                                >
                                    <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${st.isCompleted ? 'bg-green-500 border-green-600' : 'bg-white dark:bg-gray-800 border-gray-400 group-hover/subtask:border-indigo-400'}`}>
                                        {st.isCompleted && <i className="fas fa-check text-white text-[8px]"></i>}
                                    </div>
                                    <span className={`truncate ${st.isCompleted ? 'line-through text-gray-400' : 'text-gray-600 dark:text-gray-300'}`}>{st.title}</span>
                                </div>
                            ))}
                            {totalSubtasks > 3 && (
                                <div className="text-[10px] text-gray-400 pl-5">+{totalSubtasks - 3} more...</div>
                            )}
                        </div>
                    )}
                </div>
                
                <div className="mt-3 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700/50 pt-2">
                    <span className={`flex items-center ${isDatePassed ? 'text-amber-600 dark:text-amber-500 font-bold' : ''}`}>
                        <i className="far fa-calendar-alt mr-1.5"></i>
                        {isDatePassed ? `Review: ${new Date(task.dueDate).toLocaleDateString()}` : new Date(task.dueDate).toLocaleDateString()}
                    </span>
                    <span>{formatTimeSince(task.statusChangeDate)}</span>
                </div>

                <div className="mt-2 flex justify-between items-center text-sm">
                    <div className="text-xs font-mono text-gray-500 dark:text-gray-400 flex items-center bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded" title="Time Tracked / Time Estimated">
                        <i className="far fa-clock mr-1.5"></i>
                        {formatSeconds(task.actualTimeSpent)}
                        {task.timeEstimate ? ` / ${task.timeEstimate}h` : ''}
                    </div>
                    
                    <div className="flex items-center gap-2 relative z-50 isolate">
                        {renderTimerButton()}
                        <button
                            type="button"
                            onClick={handleDeleteClick}
                            onMouseDown={handleButtonMouseDown} 
                            onTouchStart={handleButtonMouseDown}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                            title="Delete Task"
                            aria-label="Delete Task"
                        >
                            <i className="fas fa-trash-alt pointer-events-none"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
