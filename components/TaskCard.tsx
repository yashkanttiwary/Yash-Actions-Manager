
import React, { useState, useEffect } from 'react';
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


export const TaskCard: React.FC<TaskCardProps> = ({ task, allTasks, onEditTask, onToggleTimer, onOpenContextMenu, onDeleteTask }) => {
    const priorityClasses = PRIORITY_COLORS[task.priority];
    const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES['To Do'];
    const [currentSessionTime, setCurrentSessionTime] = useState(0);

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
        onEditTask(task);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenContextMenu(e, task);
    };

    const cardCursorClass = isBlockedByDep ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing';

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
            <div style={agingStyle} className="absolute inset-0 bg-amber-400 dark:bg-amber-500 rounded-lg pointer-events-none transition-opacity duration-500"></div>
            <div className="relative">
                <div className="flex justify-between items-start">
                    <h3 className="font-bold text-gray-800 dark:text-gray-100 pr-2 flex-1 flex items-center gap-2">
                         {isBlockedByDep && <i className="fas fa-lock text-xs text-amber-500" title={blockerTooltip}></i>}
                        <span>{task.title}</span>
                    </h3>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${priorityClasses.bg} ${priorityClasses.text}`}>{task.priority}</span>
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
                        {task.status === 'In Progress' && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onToggleTimer(task.id); }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="timer-button flex items-center gap-2 px-2 py-1 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label={isActiveTimer ? 'Pause timer' : 'Start timer'}
                                disabled={isBlockedByDep}
                            >
                                <i className={`fas fa-fw ${isActiveTimer ? 'fa-pause text-red-500' : 'fa-play text-green-500'}`}></i>
                                {isActiveTimer && <span className="text-xs font-mono animate-pulse">{new Date(currentSessionTime).toISOString().substr(14, 5)}</span>}
                            </button>
                        )}
                        {/* DELETE BUTTON REMOVED */}
                    </div>
                </div>
            </div>

        </div>
    );
};
