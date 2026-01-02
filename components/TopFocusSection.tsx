
import React, { useState } from 'react';
import { Task, Status } from '../types';
import { STATUS_STYLES } from '../constants';

interface TopFocusSectionProps {
    tasks: Task[];
    onUnpin: (taskId: string) => void;
    onEditTask: (task: Task) => void;
    isSpaceMode: boolean;
    onFocusDrop: (taskId: string) => void;
}

const getStatusColor = (status: Status, isSpaceMode: boolean): string => {
    // Return a color indicator for the status dot
    const styles = STATUS_STYLES[status];
    switch (status) {
        case 'Done': return '#10b981'; // Green
        case 'In Progress': return '#3b82f6'; // Blue
        case 'Review': return '#a855f7'; // Purple
        case 'Blocker': return '#ef4444'; // Red
        case 'Hold': return '#f59e0b'; // Amber
        default: return isSpaceMode ? '#cbd5e1' : '#64748b'; // Slate (To Do / Won't Do)
    }
};

export const TopFocusSection: React.FC<TopFocusSectionProps> = ({ tasks, onUnpin, onEditTask, isSpaceMode, onFocusDrop }) => {
    const pinnedTasks = tasks.filter(t => t.isPinned);
    const [isDragOver, setIsDragOver] = useState(false);

    const containerClasses = isSpaceMode 
        ? 'bg-slate-900/60 backdrop-blur-md border-b border-slate-700/50 text-white' 
        : 'bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 shadow-sm';

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const taskId = e.dataTransfer.getData('taskId');
        if (taskId) {
            onFocusDrop(taskId);
        }
    };

    return (
        <div 
            className={`w-full py-3 px-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 ${containerClasses} z-40 transition-all duration-300 ${isDragOver ? 'ring-2 ring-indigo-500 ring-inset bg-indigo-50/50 dark:bg-indigo-900/50' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="flex items-center gap-2 flex-shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSpaceMode ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>
                    <i className="fas fa-thumbtack transform rotate-45"></i>
                </div>
                <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider">Current Focus</h3>
                    <p className={`text-[10px] ${isSpaceMode ? 'text-slate-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        {pinnedTasks.length} Pinned
                    </p>
                </div>
            </div>

            <div className="flex-grow flex flex-wrap gap-3 items-center min-h-[40px]">
                {pinnedTasks.length === 0 ? (
                    <span className={`text-sm italic flex items-center gap-2 ${isSpaceMode ? 'text-slate-500' : 'text-gray-400'}`}>
                        {isDragOver ? (
                            <span className="text-indigo-500 font-bold animate-pulse">Drop to Pin Task!</span>
                        ) : (
                            <>
                                <span>Pin tasks to focus today</span>
                                <span className="text-xs opacity-70">(Drag tasks here)</span>
                            </>
                        )}
                    </span>
                ) : (
                    pinnedTasks.map(task => (
                        <div 
                            key={task.id}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData('taskId', task.id)}
                            className={`group relative flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-lg border cursor-pointer transition-all duration-200
                                ${isSpaceMode 
                                    ? 'bg-black/40 border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800/60' 
                                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md'
                                }
                            `}
                            onClick={() => onEditTask(task)}
                            title={`Status: ${task.status}`}
                        >
                            {/* Status Indicator */}
                            <div 
                                className="w-2 h-2 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: getStatusColor(task.status, isSpaceMode) }}
                            />
                            
                            <span className={`text-xs font-semibold truncate max-w-[150px] ${task.status === 'Done' ? 'line-through opacity-60' : ''} ${isSpaceMode ? 'text-slate-200' : 'text-gray-700 dark:text-gray-200'}`}>
                                {task.title}
                            </span>

                            {/* Unpin Button */}
                            <button
                                onClick={(e) => { e.stopPropagation(); onUnpin(task.id); }}
                                className={`ml-1 w-5 h-5 flex items-center justify-center rounded-md hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 transition-colors ${isSpaceMode ? 'text-slate-500' : 'text-gray-400'}`}
                                title="Unpin"
                            >
                                <i className="fas fa-times text-xs"></i>
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
