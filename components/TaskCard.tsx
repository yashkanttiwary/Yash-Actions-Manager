
import React, { useState, useEffect, useLayoutEffect, useCallback, memo } from 'react';
import { Task, Status, Goal } from '../types';
import { PRIORITY_COLORS, TAG_COLORS, STATUS_STYLES, PRIORITY_LABELS } from '../constants';
import { getContrastColor } from '../utils/colorUtils';
import { useTaskContext } from '../contexts';

interface TaskCardProps {
    task: Task;
    allTasks: Task[]; // Still needed for dependency tooltips
    goals?: Goal[];
    // Actions are now optional as they can come from context, but keeping interface flexible
    onEditTask: (task: Task) => void; 
    onOpenContextMenu: (e: React.MouseEvent, task: Task) => void;
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

// Memoized Component
export const TaskCard: React.FC<TaskCardProps> = memo(({ task, allTasks, goals = [], onEditTask, onOpenContextMenu, onSubtaskToggle, onBreakDownTask, isCompactMode, onTaskSizeChange }) => {
    // Consume Context for actions to avoid drilling
    const { updateTask, deleteTask, toggleTimer, activeTaskTimer } = useTaskContext();

    const priorityClasses = PRIORITY_COLORS[task.priority];
    const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES['To Do'];
    const [currentSessionTime, setCurrentSessionTime] = useState(0);
    const [isBreakingDown, setIsBreakingDown] = useState(false);
    const isObservation = task.type === 'observation';
    
    const assignedGoal = goals.find(g => g.id === task.goalId);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        setIsExpanded(false);
    }, [isCompactMode]);

    useLayoutEffect(() => {
        if (onTaskSizeChange) onTaskSizeChange();
    }, [isExpanded, isCompactMode, onTaskSizeChange, task.subtasks?.length]);

    const handleExpandToggle = useCallback((e: React.MouseEvent, expanded: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        setIsExpanded(expanded);
    }, []);

    const isDatePassed = new Date(task.dueDate) < new Date() && task.status !== 'Done';
    const isActiveTimer = !!task.currentSessionStartTime;
    const isBlockedByDep = task.isBlockedByDependencies;
    const activeBlocker = task.blockers?.find(b => !b.resolved);

    const blockerTooltip = isBlockedByDep
        ? `Blocked by: ${task.dependencies?.map(depId => allTasks.find(t => t.id === depId)?.title).filter(Boolean).join(', ')}`
        : '';

    const isBecoming = task.isBecoming;
    const becomingClasses = isBecoming 
        ? 'ring-2 ring-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]' 
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
        setTimeout(() => { target.style.visibility = 'hidden'; }, 0);
    };

    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        target.classList.remove('ghost-card');
        target.style.visibility = 'visible';
    };

    const handleCardClick = (e: React.MouseEvent) => {
        if (window.getSelection()?.toString()) return;
        onEditTask(task);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onEditTask(task);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenContextMenu(e, task);
    };

    const handleMenuButtonClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenContextMenu(e, task);
    }

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation(); 
        deleteTask(task.id); // Context Action
    };

    const handleButtonMouseDown = (e: React.MouseEvent | React.TouchEvent) => e.stopPropagation();

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
            setIsExpanded(true);
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
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleTimer(task.id); }}
                onMouseDown={handleButtonMouseDown}
                onTouchStart={handleButtonMouseDown}
                className={`timer-button flex items-center gap-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${compact ? 'p-1.5 md:p-1' : 'px-3 py-1.5 md:px-2 md:py-1'}`}
                aria-label={isActiveTimer ? 'Pause timer' : 'Start timer'}
                disabled={isBlockedByDep}
            >
                <i className={`fas fa-fw ${isActiveTimer ? 'fa-pause text-neutral-600 dark:text-neutral-300' : 'fa-play text-neutral-600 dark:text-neutral-300'} ${compact ? 'text-sm md:text-xs' : ''}`}></i>
                {isActiveTimer && <span className="text-xs font-mono animate-pulse">{new Date(currentSessionTime).toISOString().substr(14, 5)}</span>}
            </button>
        );
    };

    if (isObservation) {
        return (
            <div
                draggable={!isBlockedByDep}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                data-task-id={task.id}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                className={`group task-card relative bg-white/50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm ${cardCursorClass} hover:shadow-md border-l-4 border-l-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900`}
                onClick={handleCardClick}
                onContextMenu={handleContextMenu}
            >
                <div className="flex items-start gap-2 mb-2">
                    <i className="fas fa-eye text-purple-500 mt-1"></i>
                    <h3 className="font-serif italic text-gray-800 dark:text-gray-200 text-sm leading-relaxed">"{task.title}"</h3>
                </div>
                {task.description && <p className="text-xs text-gray-500 dark:text-gray-400 pl-6">{task.description}</p>}
                
                <div className="mt-3 flex justify-between items-center text-xs text-gray-400">
                    <span>Observation</span>
                    <button onClick={handleDeleteClick} className="p-2 hover:text-red-500 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"><i className="fas fa-times"></i></button>
                </div>
            </div>
        );
    }

    if (isCompactMode && !isExpanded) {
        return (
            <div
                draggable={!isBlockedByDep}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                data-task-id={task.id}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                className={`group task-card relative bg-white dark:bg-gray-800 rounded-lg md:rounded-md p-3 md:p-2 border border-gray-200 dark:border-gray-700 shadow-sm ${cardCursorClass} hover:shadow-md ${statusStyle.cardBorder} ${isBlockedByDep ? 'opacity-60 saturate-50' : ''} ${becomingClasses} focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900`}
                onClick={handleCardClick}
                onContextMenu={handleContextMenu}
                title={`${task.title} (Priority: ${task.priority})`}
                role="article"
            >
                <div className="relative flex items-center justify-between gap-2 z-10">
                    <div className="flex items-center gap-2 flex-grow min-w-0">
                         {isBlockedByDep ? <i className="fas fa-lock text-xs text-amber-500 flex-shrink-0" title={blockerTooltip}></i> : <div className="md:hidden text-gray-400 cursor-move"><i className="fas fa-grip-vertical text-xs"></i></div>}
                         {isBecoming && <i className="fas fa-biohazard text-red-500 text-xs flex-shrink-0 animate-pulse"></i>}
                         <span className={`text-base md:text-sm font-medium text-gray-800 dark:text-gray-100 truncate ${isBecoming ? 'italic text-red-900 dark:text-red-200' : ''}`}>{task.title}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {task.isPinned && <i className="fas fa-thumbtack text-[10px] text-neutral-500 transform rotate-45"></i>}
                        <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded flex-shrink-0 uppercase ${priorityClasses.bg} ${priorityClasses.text} border border-opacity-30 border-current`}>{PRIORITY_LABELS[task.priority]}</span>
                        {assignedGoal && <div className="flex-shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: assignedGoal.color }}></div>}
                        {activeBlocker && <i className="fas fa-exclamation-triangle text-stone-500 text-xs"></i>}
                        {totalSubtasks > 0 && <button type="button" onClick={(e) => handleExpandToggle(e, true)} className="text-xs text-gray-500 dark:text-gray-400 font-mono flex items-center gap-1 hover:text-indigo-500 transition-colors p-1"><i className="fas fa-check-square text-[10px]"></i>{completedSubtasks}/{totalSubtasks}</button>}
                        {renderTimerButton(true)}
                        <button type="button" onClick={(e) => handleExpandToggle(e, true)} onMouseDown={handleButtonMouseDown} className="w-8 h-8 md:w-6 md:h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"><i className="fas fa-chevron-down text-sm md:text-xs"></i></button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            draggable={!isBlockedByDep}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            data-task-id={task.id}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className={`group task-card task-card-tilt relative bg-white dark:bg-gray-800 rounded-lg p-4 md:p-3 border border-gray-200 dark:border-gray-700 shadow-md ${cardCursorClass} ${priorityClasses.glow} hover:shadow-2xl ${statusStyle.cardBorder} ${isBlockedByDep ? 'opacity-60 saturate-50' : ''} ${becomingClasses} focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900`}
            onClick={handleCardClick}
            onContextMenu={handleContextMenu}
            role="article"
        >
            <div className="relative z-10">
                <div className="flex justify-between items-start gap-2">
                    <h3 className={`font-bold text-gray-800 dark:text-gray-100 flex-1 flex items-center gap-2 min-w-0 text-base md:text-sm ${isBecoming ? 'italic text-red-700 dark:text-red-300' : ''}`}>
                         {isBlockedByDep ? <i className="fas fa-lock text-xs text-amber-500 flex-shrink-0" title={blockerTooltip}></i> : <div className="md:hidden text-gray-300 dark:text-gray-600 cursor-move mr-1"><i className="fas fa-grip-vertical"></i></div>}
                         {isBecoming && <i className="fas fa-biohazard text-red-500 animate-pulse"></i>}
                        <span className="break-words leading-tight">{task.title}</span>
                    </h3>
                    <div className="flex items-center gap-1 flex-shrink-0 relative z-20">
                        {task.isPinned && <i className="fas fa-thumbtack text-xs text-neutral-500 transform rotate-45 mr-1"></i>}
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${priorityClasses.bg} ${priorityClasses.text}`}>{PRIORITY_LABELS[task.priority]}</span>
                        {assignedGoal && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm truncate max-w-[80px]" style={{ backgroundColor: assignedGoal.color, color: getContrastColor(assignedGoal.color) }}>{assignedGoal.title}</span>}
                        <button type="button" onClick={handleMenuButtonClick} onMouseDown={handleButtonMouseDown} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ml-1 focus:outline-none"><i className="fas fa-ellipsis-v text-xs"></i></button>
                        {isCompactMode && isExpanded && <button type="button" onClick={(e) => handleExpandToggle(e, false)} onMouseDown={handleButtonMouseDown} className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 shadow-sm transition-all hover:bg-gray-200 dark:hover:bg-gray-600 ml-1 relative z-30 pointer-events-auto"><i className="fas fa-chevron-up text-xs"></i></button>}
                    </div>
                </div>
                
                {isBecoming && task.becomingWarning && (
                    <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 border-l-2 border-red-500 text-xs italic text-red-800 dark:text-red-200 flex justify-between items-start gap-2">
                        <div><i className="fas fa-exclamation-circle mr-1"></i> {task.becomingWarning}</div>
                        <button onClick={(e) => { e.stopPropagation(); updateTask({ ...task, isBecoming: false, becomingWarning: undefined }); }} className="text-red-600 hover:text-red-800 dark:text-red-300 transition-colors px-1"><i className="fas fa-times"></i></button>
                    </div>
                )}
                
                {task.description && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-3">{task.description}</p>}
                {activeBlocker && <div className="mt-2 p-2 bg-stone-100 dark:bg-stone-900/20 rounded-md border border-stone-200 dark:border-stone-800"><p className="text-xs font-bold text-stone-600 dark:text-stone-400 flex items-center gap-1"><i className="fas fa-exclamation-triangle"></i> Blocker</p><p className="text-xs text-stone-500 dark:text-stone-300 mt-0.5">{activeBlocker.reason}</p></div>}
                <div className="flex flex-wrap gap-1 mt-3">{task.tags?.map(tag => <span key={tag} className={`text-xs px-2 py-0.5 rounded-full text-white/90 font-medium ${getTagColor(tag)} shadow-sm`}>{tag}</span>)}</div>

                <div className="mt-3 bg-gray-50 dark:bg-gray-900/50 rounded-md p-2 relative">
                    <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                        <span className="font-semibold">Subtasks</span>
                        <div className="flex items-center gap-2">
                            <span>{completedSubtasks} / {totalSubtasks}</span>
                            {onBreakDownTask && task.status !== 'Done' && <button onClick={handleStuckClick} disabled={isBreakingDown} className={`w-9 h-9 md:w-5 md:h-5 flex items-center justify-center rounded-full transition-all border ${isBreakingDown ? 'border-transparent' : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 bg-white dark:bg-gray-800 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 text-neutral-500'}`}>{isBreakingDown ? <i className="fas fa-spinner fa-spin text-xs"></i> : <i className="fas fa-brain text-[10px]"></i>}</button>}
                        </div>
                    </div>
                    {totalSubtasks > 0 && <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-2"><div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${subtaskProgress}%` }}></div></div>}
                    {totalSubtasks > 0 && <div className="space-y-1 cursor-default">{task.subtasks?.slice(0, 3).map(st => <div key={st.id} className="flex items-center gap-2 text-xs hover:bg-gray-200 dark:hover:bg-gray-700/50 p-2 md:p-1 rounded cursor-pointer transition-colors group/subtask" onClick={(e) => handleSubtaskClick(e, st.id)}><div className={`w-5 h-5 md:w-3.5 md:h-3.5 flex-shrink-0 rounded-sm border flex items-center justify-center transition-colors ${st.isCompleted ? 'bg-emerald-500 border-emerald-600' : 'bg-white dark:bg-gray-800 border-gray-400 group-hover/subtask:border-indigo-400'}`}>{st.isCompleted && <i className="fas fa-check text-white text-[8px]"></i>}</div><span className={`truncate ${st.isCompleted ? 'line-through text-gray-400' : 'text-gray-600 dark:text-gray-300'}`}>{st.title}</span></div>)} {totalSubtasks > 3 && <div className="text-[10px] text-gray-400 pl-5">+{totalSubtasks - 3} more...</div>}</div>}
                </div>
                
                <div className="mt-3 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700/50 pt-2">
                    <span className={`flex items-center ${isDatePassed ? 'text-gray-500 italic' : ''}`}><i className="far fa-calendar-alt mr-1.5"></i>{new Date(task.dueDate).toLocaleDateString()}</span>
                    <span>{formatTimeSince(task.statusChangeDate)}</span>
                </div>

                <div className="mt-2 flex justify-between items-center text-sm">
                    <div className="text-xs font-mono text-gray-500 dark:text-gray-400 flex items-center bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded"><i className="far fa-clock mr-1.5"></i>{formatSeconds(task.actualTimeSpent)}{task.timeEstimate ? ` / ${task.timeEstimate}h` : ''}</div>
                    <div className="flex items-center gap-2 relative z-50 isolate">
                        {renderTimerButton()}
                        <button type="button" onClick={handleDeleteClick} onMouseDown={handleButtonMouseDown} onTouchStart={handleButtonMouseDown} className="w-10 h-10 md:w-7 md:h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"><i className="fas fa-trash-alt pointer-events-none"></i></button>
                    </div>
                </div>
            </div>
        </div>
    );
});
