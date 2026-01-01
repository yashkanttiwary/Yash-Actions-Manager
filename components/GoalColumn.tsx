
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Task, Goal, Status } from '../types';
import { TaskCard } from './TaskCard';
import { getContrastColor } from '../utils/colorUtils';
import { useTaskContext } from '../contexts';

interface GoalColumnProps {
    goal: Goal;
    tasks: Task[];
    allTasks: Task[];
    onTaskMove: (taskId: string, newGoalId: string) => void;
    onEditTask: (task: Task) => void;
    onEditGoal: (goal: Goal) => void;
    onDeleteGoal: (goalId: string) => void;
    
    // UI Props
    isCompactMode: boolean;
    isSpaceMode: boolean;
    onFocusGoal?: (goalId: string) => void;
    isFocused?: boolean;
    
    // Legacy/Optional - kept for compat but ignored
    onUpdateTask?: any;
    onDeleteTask?: any;
    activeTaskTimer?: any;
    onToggleTimer?: any;
    onSubtaskToggle?: any;
}

const getStatusColor = (status: Status): string => {
    switch (status) {
        case 'Done': return '#10b981';
        case 'In Progress': return '#3b82f6';
        case 'Review': return '#a855f7';
        case 'Blocker': return '#ef4444';
        case 'Hold': return '#f59e0b';
        default: return '#94a3b8';
    }
};

export const GoalColumn: React.FC<GoalColumnProps> = ({ 
    goal, tasks, allTasks, onTaskMove, onEditTask, onEditGoal, onDeleteGoal,
    isCompactMode, isSpaceMode, onFocusGoal, isFocused
}) => {
    const { goals } = useTaskContext(); // Consume goals directly

    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showScrollIndicator, setShowScrollIndicator] = useState(false);
    const [showTopScrollIndicator, setShowTopScrollIndicator] = useState(false);
    
    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.status === 'Done' && b.status !== 'Done') return 1;
        if (a.status !== 'Done' && b.status === 'Done') return -1;
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
    });

    const checkScrollIndicator = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const hasOverflow = el.scrollHeight > el.clientHeight;
        const isAtBottom = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 5;
        const isAtTop = el.scrollTop < 5;
        setShowScrollIndicator(hasOverflow && !isAtBottom);
        setShowTopScrollIndicator(hasOverflow && !isAtTop);
    }, []);

    useEffect(() => {
        checkScrollIndicator();
        window.addEventListener('resize', checkScrollIndicator);
        return () => window.removeEventListener('resize', checkScrollIndicator);
    }, [tasks, checkScrollIndicator]);

    const handleScroll = () => checkScrollIndicator();

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingOver(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        setIsDraggingOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingOver(false);
        const taskId = e.dataTransfer.getData('taskId');
        if (taskId) {
            onTaskMove(taskId, goal.id);
        }
    };

    const containerClasses = isSpaceMode
        ? 'bg-slate-900/60 backdrop-blur-md border border-slate-700/50'
        : 'bg-gray-100/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700';

    const safeColor = goal.color.startsWith('#') ? goal.color : '#6366f1'; 
    const effectiveTextColor = goal.textColor 
        ? goal.textColor 
        : (isSpaceMode ? '#ffffff' : getContrastColor(safeColor));

    const activeTaskCount = tasks.filter(t => t.status !== 'Done' && t.status !== "Won't Complete").length;
    const ENTROPY_THRESHOLD = 5; 
    const entropyLevel = Math.min(100, (activeTaskCount / ENTROPY_THRESHOLD) * 100);
    const isDecaying = activeTaskCount > ENTROPY_THRESHOLD;

    return (
        <div 
            className={`flex-shrink-0 w-full rounded-xl flex flex-col ${containerClasses} shadow-lg transition-all duration-300 relative ${isFocused ? 'ring-4 ring-offset-2 ring-indigo-500' : ''} h-auto md:h-full`}
            style={{ 
                borderColor: isDraggingOver ? safeColor : (isSpaceMode ? `${safeColor}66` : undefined),
                borderWidth: isDraggingOver ? '2px' : '1px',
                boxShadow: isSpaceMode ? `0 0 15px ${safeColor}10` : undefined
            }}
        >
            <div 
                className={`relative p-3 rounded-t-xl overflow-hidden group`}
                style={{ color: effectiveTextColor }}
            >
                <div className="absolute inset-0 transition-all duration-300" style={{ backgroundColor: safeColor, opacity: isSpaceMode ? 0.45 : 1 }} />
                {isSpaceMode && <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-black/60 pointer-events-none" />}
                <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIi8+CjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz4KPC9zdmc+')] mix-blend-overlay pointer-events-none"></div>
                {isDecaying && (
                    <div 
                        className="absolute inset-0 pointer-events-none transition-opacity duration-1000"
                        style={{ 
                            opacity: (entropyLevel - 100) / 100,
                            backgroundImage: 'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48ZmlsdGVyIGlkPSJnoiPjxmZVR1cmJ1bGVuY2UgYmFzZUZyZXF1ZW5jeT0iMC41IiAvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNnKSIgb3BhY2l0eT0iMC41Ii8+PC9zdmc+")',
                            filter: 'sepia(1) hue-rotate(-50deg) saturate(3)' 
                        }}
                    />
                )}

                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg leading-tight truncate pr-2 drop-shadow-sm">{goal.title}</h3>
                        <div className="flex items-center gap-1">
                            {onFocusGoal && (
                                <button 
                                    onClick={() => onFocusGoal(isFocused ? '' : goal.id)}
                                    className={`p-1 rounded transition-colors text-xs ${isFocused ? 'bg-white text-black animate-pulse' : 'hover:bg-white/20'}`}
                                    title={isFocused ? "Exit Focus Zone" : "Enter Focus Zone"}
                                >
                                    <i className="fas fa-crosshairs"></i>
                                </button>
                            )}
                            <button onClick={() => onEditGoal(goal)} className="p-1 hover:bg-white/20 rounded transition-colors text-xs">
                                <i className="fas fa-pencil-alt"></i>
                            </button>
                            {goal.id !== 'unassigned' && (
                                <button onClick={() => onDeleteGoal(goal.id)} className="p-1 hover:bg-red-500/50 rounded transition-colors text-xs">
                                    <i className="fas fa-trash"></i>
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-between text-xs opacity-90 font-mono drop-shadow-sm mt-1 items-center">
                        <span>{tasks.length} Items</span>
                        {activeTaskCount > 0 ? (
                            <span className={`font-bold ${isDecaying ? 'text-red-200 animate-pulse' : ''}`}>
                                {isDecaying ? '⚠ HIGH ENTROPY' : 'Stable'}
                            </span>
                        ) : <span className="opacity-70">Empty</span>}
                    </div>
                </div>
            </div>

            <div 
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-grow p-2 overflow-y-auto min-h-[200px] space-y-2 custom-scrollbar relative"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div 
                    className={`sticky top-0 left-0 right-0 h-8 pointer-events-none transition-all duration-500 z-20 -mb-8 -mx-2 ${showTopScrollIndicator ? 'opacity-100' : 'opacity-0'}`}
                    style={{
                        background: isSpaceMode 
                            ? 'linear-gradient(to bottom, rgba(165, 243, 252, 0.2) 0%, rgba(165, 243, 252, 0) 100%)' 
                            : 'linear-gradient(to bottom, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0) 100%)',
                        backdropFilter: 'blur(4px)',
                        maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)'
                    }}
                >
                    <div className={`w-full h-[1px] shadow-sm ${isSpaceMode ? 'bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent' : 'bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent'}`}></div>
                </div>

                {sortedTasks.length === 0 ? (
                    <div className={`h-full flex flex-col items-center justify-center p-8 text-center border-2 border-dashed rounded-lg m-2 ${isSpaceMode ? 'border-slate-700 text-slate-500' : 'border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500'}`}>
                        <i className="far fa-clipboard text-2xl mb-2 opacity-50"></i>
                        <span className="text-sm">Drop tasks here</span>
                    </div>
                ) : (
                    sortedTasks.map(task => (
                        <div key={task.id} className="relative">
                            <div className="absolute -left-1 top-3 bottom-3 w-1 rounded-l-md shadow-sm" style={{ backgroundColor: getStatusColor(task.status) }} />
                            <TaskCard
                                task={task}
                                allTasks={allTasks}
                                goals={goals}
                                onEditTask={onEditTask}
                                onOpenContextMenu={(e) => { e.preventDefault(); onEditTask(task); }}
                                onSubtaskToggle={() => {}}
                                isCompactMode={isCompactMode}
                            />
                        </div>
                    ))
                )}
            </div>

            <div 
                className={`absolute bottom-0 left-0 right-0 h-10 pointer-events-none transition-all duration-500 rounded-b-xl z-20 ${showScrollIndicator ? 'opacity-100' : 'opacity-0'}`}
                style={{
                    background: isSpaceMode 
                        ? 'linear-gradient(to top, rgba(165, 243, 252, 0.2) 0%, rgba(165, 243, 252, 0) 100%)' 
                        : 'linear-gradient(to top, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0) 100%)',
                    backdropFilter: 'blur(4px)',
                    maskImage: 'linear-gradient(to top, black 40%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to top, black 40%, transparent 100%)'
                }}
            >
                 <div className={`absolute bottom-0 left-0 right-0 h-[1px] shadow-sm ${isSpaceMode ? 'bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent' : 'bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent'}`}></div>
            </div>
        </div>
    );
};
