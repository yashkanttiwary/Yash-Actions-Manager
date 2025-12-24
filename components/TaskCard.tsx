
import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { Task, Status } from '../types';
import { PRIORITY_COLORS, TAG_COLORS, STATUS_STYLES } from '../constants';

interface TaskCardProps {
    task: Task;
    allTasks: Task[]; // All tasks needed for dependency tooltips
    onEditTask: (task: Task) => void;
    activeTaskTimer: any; // Kept for interface compatibility but ignored
    onToggleTimer: (taskId:string) => void;
    onOpenContextMenu: (e: React.MouseEvent, task: Task) => void;
    onDeleteTask: (taskId: string) => void;
    isCompactMode: boolean;
    onTaskSizeChange?: () => void; // New prop from KanbanColumn
}

const getTagColor = (tagName: string) => {
    let hash = 0;
    for (let i = 0; i < tagName.length; i++) {
        hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % TAG_COLORS.length);
    return TAG_COLORS[index];
};

const getAgingInfo = (statusChangeDateStr: string, status: Status): { style: React.CSSProperties, message: string } => {
    const defaultInfo = { style: { opacity: 0 }, message: '' };

    if (status === 'Done' || status === 'Review' || status === "Won't Complete" || status === 'Hold' || !statusChangeDateStr) {
        return defaultInfo;
    }
    
    try {
        const now = new Date();
        const statusChangeDate = new Date(statusChangeDateStr);
        const diffHours = (now.getTime() - statusChangeDate.getTime()) / (1000 * 3600);
        
        if (diffHours > 72) { // Over 3 days
            const diffDays = Math.floor(diffHours / 24);
            return { style: { opacity: 0.20 }, message: `This task hasn't been updated in ${diffDays} days.` };
        }
        if (diffHours > 24) { // Over 1 day
            return { style: { opacity: 0.15 }, message: `This task hasn't been updated in over a day.` };
        }
        if (diffHours > 8) { // Over 8 hours
            return { style: { opacity: 0.10 }, message: `This task hasn't been updated in over 8 hours.` };
        }
    } catch (e) {
        console.error("Invalid date for aging style:", statusChangeDateStr, e);
        return defaultInfo;
    }
    
    return defaultInfo;
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


export const TaskCard: React.FC<TaskCardProps> = ({ task, allTasks, onEditTask, onToggleTimer, onOpenContextMenu, onDeleteTask, isCompactMode, onTaskSizeChange }) => {
    const priorityClasses = PRIORITY_COLORS[task.priority];
    const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES['To Do'];
    const [currentSessionTime, setCurrentSessionTime] = useState(0);
    
    // Local state to handle individual expansion
    const [isExpanded, setIsExpanded] = useState(false);

    // Reset expansion when global mode changes to ensure clean state
    useEffect(() => {
        setIsExpanded(false);
    }, [isCompactMode]);

    // ARCH-001: Trigger layout recalculation when expanded state changes
    // This makes dependency lines snap to the new height instantly
    useLayoutEffect(() => {
        if (onTaskSizeChange) {
            onTaskSizeChange();
        }
    }, [isExpanded, isCompactMode, onTaskSizeChange]);

    const handleExpandToggle = useCallback((e: React.MouseEvent, expanded: boolean) => {
        e.preventDefault();
        e.stopPropagation(); // CRITICAL: Stop propagation to prevent opening edit modal
        setIsExpanded(expanded);
    }, []);

    const isOverdue = new Date(task.dueDate) < new Date() && task.status !== 'Done';
    const { style: agingStyle, message: agingMessage } = getAgingInfo(task.statusChangeDate, task.status);
    
    // Use persisted start time from task object
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
        e.nativeEvent.stopImmediatePropagation(); // Extra layer of safety
        
        if (window.confirm(`Are you sure you want to delete "${task.title}"?`)) {
            onDeleteTask(task.id);
        }
    };

    const handleButtonMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        // Essential: Prevents the draggable parent from stealing the event
        e.stopPropagation();
    };

    const cardCursorClass = isBlockedByDep ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing';
    
    // Common Logic for Timer Button
    const renderTimerButton = (compact = false) => {
        if (task.status !== 'In Progress') return null;
        
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

    // --- COMPACT MODE RENDER ---
    // Only render compact if global mode is on AND individual card is not expanded
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
                title={agingMessage || `${task.title} (Priority: ${task.priority})`}
            >
                <div style={agingStyle} className="absolute inset-0 bg-amber-400 dark:bg-amber-500 rounded-md pointer-events-none transition-opacity duration-500 z-0"></div>
                <div className="relative flex items-center justify-between gap-2 z-10">
                    
                    {/* Left: Priority Indicator & Title */}
                    <div className="flex items-center gap-2 flex-grow min-w-0">
                         {isBlockedByDep ? (
                             <i className="fas fa-lock text-xs text-amber-500 flex-shrink-0" title={blockerTooltip}></i>
                         ) : (
                             // Mobile Drag Handle (Dots)
                             <div className="md:hidden text-gray-400 cursor-move">
                                 <i className="fas fa-grip-vertical text-xs"></i>
                             </div>
                         )}
                         <div className={`hidden md:block w-2 h-2 rounded-full flex-shrink-0 ${priorityClasses.bg} border ${priorityClasses.text.replace('text-', 'border-')}`} title={`Priority: ${task.priority}`}></div>
                         
                         <span className={`text-sm font-medium text-gray-800 dark:text-gray-100 truncate ${isOverdue ? 'text-red-600 dark:text-red-400' : ''}`}>
                             {task.title}
                         </span>
                    </div>

                    {/* Right: Indicators, Timer & Expand Button */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {activeBlocker && (
                            <i className="fas fa-exclamation-triangle text-red-500 text-xs" title={`Blocked: ${activeBlocker.reason}`}></i>
                        )}
                        
                        {totalSubtasks > 0 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono flex items-center gap-1" title={`${completedSubtasks}/${totalSubtasks} subtasks completed`}>
                                <i className="fas fa-check-square text-[10px]"></i>
                                {completedSubtasks}/{totalSubtasks}
                            </span>
                        )}

                        {renderTimerButton(true)}

                        {/* Expand Button */}
                        <button
                            type="button"
                            onClick={(e) => handleExpandToggle(e, true)}
                            onMouseDown={handleButtonMouseDown} // Prevent Drag Start
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
            className={`group task-card task-card-tilt relative bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-700 shadow-md ${cardCursorClass} ${priorityClasses.glow} hover:shadow-2xl ${statusStyle.cardBorder} ${isBlockedByDep ? 'opacity-60 saturate-50' : ''}`}
            onClick={handleCardClick}
            onContextMenu={handleContextMenu}
            title={agingMessage || `Priority: ${task.priority} | Due: ${new Date(task.dueDate).toLocaleDateString()}`}
        >
            {/* Background Layer: z-0 */}
            <div style={agingStyle} className="absolute inset-0 bg-amber-400 dark:bg-amber-500 rounded-lg pointer-events-none transition-opacity duration-500 z-0"></div>
            
            {/* Content Layer: z-10 (Crucial to sit above background) */}
            <div className="relative z-10">
                {/* UX-001: Revised Header Layout to prevent overlap */}
                <div className="flex justify-between items-start gap-2">
                    <h3 className="font-bold text-gray-800 dark:text-gray-100 flex-1 flex items-center gap-2 min-w-0">
                         {isBlockedByDep ? (
                             <i className="fas fa-lock text-xs text-amber-500 flex-shrink-0" title={blockerTooltip}></i>
                         ) : (
                             // Mobile Drag Handle
                            <div className="md:hidden text-gray-300 dark:text-gray-600 cursor-move mr-1">
                                <i className="fas fa-grip-vertical"></i>
                            </div>
                         )}
                        <span className="truncate">{task.title}</span>
                    </h3>
                    
                    {/* Header Controls: Priority & Collapse Button */}
                    {/* z-20 Ensure controls are clickable above content */}
                    <div className="flex items-center gap-1 flex-shrink-0 relative z-20">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${priorityClasses.bg} ${priorityClasses.text}`}>
                            {task.priority}
                        </span>
                        
                        {/* Collapse Button (Only visible if expanded from compact mode) */}
                        {isCompactMode && isExpanded && (
                            <button
                                type="button"
                                onClick={(e) => handleExpandToggle(e, false)}
                                onMouseDown={handleButtonMouseDown} // Prevent Drag Start
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
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 truncate">
                        {task.description}
                    </p>
                )}

                {activeBlocker && (
                     <div className="mt-2 p-2 bg-red-900/50 rounded-md border border-red-500/50">
                        <p className="text-sm font-semibold text-red-300"><i className="fas fa-exclamation-triangle mr-2"></i>Blocker</p>
                        <p className="text-xs text-red-300/80 mt-1">{activeBlocker.reason}</p>
                     </div>
                )}
                
                <div className="flex flex-wrap gap-1 mt-2">
                    {task.tags?.map(tag => (
                        <span key={tag} className={`text-xs px-2 py-0.5 rounded-full text-white/90 ${getTagColor(tag)}`}>{tag}</span>
                    ))}
                </div>

                {totalSubtasks > 0 && (
                    <div className="mt-2">
                        <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <span className="font-semibold">Subtasks</span>
                            <span>{completedSubtasks} / {totalSubtasks}</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${subtaskProgress}%` }}></div>
                        </div>
                    </div>
                )}
                
                <div className="mt-2 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                    <span className={`flex items-center ${isOverdue ? 'text-red-500 dark:text-red-400 font-bold' : ''}`}>
                        <i className="far fa-calendar-alt mr-1.5"></i>
                        {new Date(task.dueDate).toLocaleDateString()}
                    </span>
                    <span>In column for {formatTimeSince(task.statusChangeDate)}</span>
                </div>

                <div className="mt-2 pt-1 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center text-sm">
                    <div className="text-xs font-mono text-gray-500 dark:text-gray-400 flex items-center" title="Time Tracked / Time Estimated">
                        <i className="far fa-clock mr-1"></i>
                        {formatSeconds(task.actualTimeSpent)}
                        {task.timeEstimate ? ` / ${task.timeEstimate}h` : ''}
                    </div>
                    
                    {/* ACTION BUTTONS */}
                    <div className="flex items-center gap-2 relative z-50 isolate">
                        {renderTimerButton()}
                        <button
                            type="button"
                            onClick={handleDeleteClick}
                            onMouseDown={handleButtonMouseDown} 
                            onTouchStart={handleButtonMouseDown} // Robustness for touch devices
                            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                            title="Delete Task"
                        >
                            <i className="fas fa-trash-alt pointer-events-none"></i>
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
};
