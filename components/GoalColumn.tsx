
import React, { useRef, useState } from 'react';
import { Task, Goal } from '../types';
import { TaskCard } from './TaskCard';

interface GoalColumnProps {
    goal: Goal;
    tasks: Task[]; // Tasks belonging to this goal
    allTasks: Task[]; // For context
    onTaskMove: (taskId: string, newGoalId: string) => void;
    onEditTask: (task: Task) => void;
    onDeleteTask: (taskId: string) => void;
    onEditGoal: (goal: Goal) => void;
    onDeleteGoal: (goalId: string) => void;
    activeTaskTimer: {taskId: string, startTime: number} | null;
    onToggleTimer: (taskId: string) => void;
    onSubtaskToggle: (taskId: string, subtaskId: string) => void;
    isCompactMode: boolean;
    isSpaceMode: boolean;
}

export const GoalColumn: React.FC<GoalColumnProps> = ({ 
    goal, tasks, allTasks, onTaskMove, onEditTask, onDeleteTask, onEditGoal, onDeleteGoal,
    activeTaskTimer, onToggleTimer, onSubtaskToggle, isCompactMode, isSpaceMode 
}) => {
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    
    // Sort tasks: Active first, then Done
    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.status === 'Done' && b.status !== 'Done') return 1;
        if (a.status !== 'Done' && b.status === 'Done') return -1;
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
    });

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingOver(true);
    };

    const handleDragLeave = () => {
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

    const progress = goal.progress || 0;
    
    // Dynamic Styles based on goal color
    // We use inline styles for the custom color, but tailwind for structure
    const headerStyle = {
        backgroundColor: isSpaceMode ? 'rgba(0,0,0,0.6)' : goal.color,
        borderColor: goal.color
    };
    
    const containerClasses = isSpaceMode
        ? 'bg-slate-900/60 backdrop-blur-md border border-slate-700/50'
        : 'bg-gray-100/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700';

    return (
        <div 
            className={`flex-shrink-0 w-80 rounded-xl flex flex-col ${containerClasses} shadow-lg transition-all duration-300 relative`}
            style={{ borderColor: isDraggingOver ? goal.color : undefined, borderWidth: isDraggingOver ? '2px' : '1px' }}
        >
            {/* Header */}
            <div 
                className="p-3 rounded-t-xl text-white relative overflow-hidden"
                style={headerStyle}
            >
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg leading-tight truncate pr-2">{goal.title}</h3>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => onEditGoal(goal)}
                                className="p-1 hover:bg-white/20 rounded transition-colors text-xs"
                            >
                                <i className="fas fa-pencil-alt"></i>
                            </button>
                            {goal.id !== 'unassigned' && (
                                <button 
                                    onClick={() => onDeleteGoal(goal.id)}
                                    className="p-1 hover:bg-red-500/50 rounded transition-colors text-xs"
                                >
                                    <i className="fas fa-trash"></i>
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-black/30 rounded-full h-2 mb-1">
                        <div 
                            className="bg-white/90 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                    <div className="flex justify-between text-xs opacity-90 font-mono">
                        <span>{progress}% Complete</span>
                        <span>{tasks.length} Tasks</span>
                    </div>
                </div>
                
                {/* Visual texture overlay */}
                <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIi8+CjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMDAiLz4KPC9zdmc+')]"></div>
            </div>

            {/* Task List */}
            <div 
                className="flex-grow p-2 overflow-y-auto min-h-[200px] space-y-2 custom-scrollbar"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {sortedTasks.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg m-2">
                        <i className="far fa-clipboard text-2xl mb-2 opacity-50"></i>
                        <span className="text-sm">Drop tasks here</span>
                    </div>
                ) : (
                    sortedTasks.map(task => (
                        <div key={task.id} className="relative">
                            {/* Status Indicator Pill for Goal View */}
                            <div className="absolute -left-1 top-3 bottom-3 w-1 rounded-l-md" 
                                style={{ 
                                    backgroundColor: task.status === 'Done' ? '#10b981' : 
                                                     task.status === 'In Progress' ? '#3b82f6' : 
                                                     task.status === 'Blocker' ? '#ef4444' : '#94a3b8' 
                                }} 
                            />
                            <TaskCard
                                task={task}
                                allTasks={allTasks}
                                onEditTask={onEditTask}
                                activeTaskTimer={activeTaskTimer}
                                onToggleTimer={onToggleTimer}
                                onOpenContextMenu={(e) => { e.preventDefault(); onEditTask(task); }} // Simple edit on right click for now
                                onDeleteTask={onDeleteTask}
                                onSubtaskToggle={onSubtaskToggle}
                                isCompactMode={isCompactMode}
                            />
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};