
import React, { useState, useRef } from 'react';
import { Task, Goal } from '../types';
import { GoalColumn } from './GoalColumn';

interface GoalBoardProps {
    tasks: Task[];
    goals: Goal[];
    onTaskMove: (taskId: string, newGoalId: string) => void;
    onEditTask: (task: Task) => void;
    onDeleteTask: (taskId: string) => void;
    onAddGoal: (goal: Omit<Goal, 'id' | 'createdDate'>) => void;
    onEditGoal: (goal: Goal) => void;
    onDeleteGoal: (goalId: string) => void;
    activeTaskTimer: {taskId: string, startTime: number} | null;
    onToggleTimer: (taskId: string) => void;
    onSubtaskToggle: (taskId: string, subtaskId: string) => void;
    isCompactMode: boolean;
    isSpaceMode: boolean;
    zoomLevel: number;
    // Focus Mode Props
    onFocusGoal?: (goalId: string) => void;
    currentFocusId?: string | null;
}

export const GoalBoard: React.FC<GoalBoardProps> = ({
    tasks, goals, onTaskMove, onEditTask, onDeleteTask, onAddGoal, onEditGoal, onDeleteGoal,
    activeTaskTimer, onToggleTimer, onSubtaskToggle, isCompactMode, isSpaceMode, zoomLevel,
    onFocusGoal, currentFocusId
}) => {
    const [isCreating, setIsCreating] = useState(false);
    const [newGoalTitle, setNewGoalTitle] = useState('');
    const [newGoalColor, setNewGoalColor] = useState('#6366f1');
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newGoalTitle.trim()) {
            onAddGoal({
                title: newGoalTitle.trim(),
                color: newGoalColor,
                description: '',
            });
            setNewGoalTitle('');
            setIsCreating(false);
        }
    };

    // Enhanced Auto-scroll logic
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); 
        
        const container = scrollContainerRef.current;
        if (!container) return;

        const { left, width } = container.getBoundingClientRect();
        const x = e.clientX;
        
        // Increased threshold and speed
        const threshold = 150; 
        const maxSpeed = 25; 

        // Calculate speed based on proximity to edge
        if (x < left + threshold) {
            const intensity = 1 - ((x - left) / threshold);
            container.scrollLeft -= maxSpeed * intensity;
        } else if (x > left + width - threshold) {
            const intensity = 1 - ((left + width - x) / threshold);
            container.scrollLeft += maxSpeed * intensity;
        }
    };

    // Virtual "Unassigned" Goal
    const unassignedGoal: Goal = {
        id: 'unassigned',
        title: 'Unassigned Tasks',
        color: '#64748b', // Slate
        createdDate: new Date().toISOString(),
        progress: 0
    };

    const unassignedTasks = tasks.filter(t => !t.goalId || !goals.find(g => g.id === t.goalId));

    const PRESET_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'];

    return (
        <>
            {/* Status Legend - Fixed at Bottom Right */}
            <div className={`fixed bottom-6 right-6 z-40 transition-all duration-500 ${isSpaceMode ? 'text-white' : ''}`}>
                <div className={`
                    p-4 rounded-xl shadow-xl backdrop-blur-md border animate-fadeIn
                    ${isSpaceMode 
                        ? 'bg-black/40 border-white/20' 
                        : 'bg-white/90 dark:bg-gray-800/90 border-gray-200 dark:border-gray-700'
                    }
                `}>
                    <h4 className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isSpaceMode ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                        Task Status Guide
                    </h4>
                    <div className="space-y-2.5 min-w-[140px]">
                        <div className="flex items-center gap-2.5">
                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: '#94a3b8' }}></div>
                            <span className="text-xs font-semibold opacity-90">To Do</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: '#3b82f6' }}></div>
                            <span className="text-xs font-semibold opacity-90">In Progress</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: '#a855f7' }}></div>
                            <span className="text-xs font-semibold opacity-90">Review</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: '#ef4444' }}></div>
                            <span className="text-xs font-semibold opacity-90">Blocker</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: '#10b981' }}></div>
                            <span className="text-xs font-semibold opacity-90">Done</span>
                        </div>
                    </div>
                </div>
            </div>

            <div 
                ref={scrollContainerRef}
                className="w-full h-full overflow-x-auto overflow-y-hidden"
                onDragOver={handleDragOver}
                style={{ 
                    transform: `scale(${zoomLevel})`, 
                    transformOrigin: 'top left',
                    width: `${100 / zoomLevel}%`,
                    height: `${100 / zoomLevel}%`
                }}
            >
                <div className="flex h-full p-4 gap-6 min-w-max pb-8">
                    
                    {/* Unassigned Column - Always First */}
                    <GoalColumn
                        key="unassigned"
                        goal={unassignedGoal}
                        tasks={unassignedTasks}
                        allTasks={tasks}
                        onTaskMove={(tid) => onTaskMove(tid, undefined!)} // Sending undefined removes goalId
                        onEditTask={onEditTask}
                        onDeleteTask={onDeleteTask}
                        onEditGoal={() => {}} // Can't edit unassigned
                        onDeleteGoal={() => {}} // Can't delete unassigned
                        activeTaskTimer={activeTaskTimer}
                        onToggleTimer={onToggleTimer}
                        onSubtaskToggle={onSubtaskToggle}
                        isCompactMode={isCompactMode}
                        isSpaceMode={isSpaceMode}
                        onFocusGoal={onFocusGoal}
                        isFocused={currentFocusId === 'unassigned'}
                    />

                    {/* Actual Goal Columns */}
                    {goals.map(goal => (
                        <GoalColumn
                            key={goal.id}
                            goal={goal}
                            tasks={tasks.filter(t => t.goalId === goal.id)}
                            allTasks={tasks}
                            onTaskMove={(tid) => onTaskMove(tid, goal.id)}
                            onEditTask={onEditTask}
                            onDeleteTask={onDeleteTask}
                            onEditGoal={onEditGoal}
                            onDeleteGoal={onDeleteGoal}
                            activeTaskTimer={activeTaskTimer}
                            onToggleTimer={onToggleTimer}
                            onSubtaskToggle={onSubtaskToggle}
                            isCompactMode={isCompactMode}
                            isSpaceMode={isSpaceMode}
                            onFocusGoal={onFocusGoal}
                            isFocused={currentFocusId === goal.id}
                        />
                    ))}

                    {/* Add Goal Button / Form */}
                    <div className="flex-shrink-0 w-80">
                        {isCreating ? (
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg border border-indigo-200 dark:border-indigo-800 animate-fadeIn">
                                <h3 className="font-bold mb-3 text-gray-800 dark:text-white">New Goal Strategy</h3>
                                <form onSubmit={handleCreateSubmit}>
                                    <input
                                        autoFocus
                                        type="text"
                                        value={newGoalTitle}
                                        onChange={e => setNewGoalTitle(e.target.value)}
                                        placeholder="Goal Title (e.g. Launch Product)"
                                        className="w-full p-2 mb-3 bg-gray-100 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                                    />
                                    
                                    <div className="mb-2">
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase">Color Theme</label>
                                        <div className="flex flex-wrap gap-2 items-center">
                                            {PRESET_COLORS.map(c => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => setNewGoalColor(c)}
                                                    className={`w-6 h-6 rounded-full border-2 transition-all duration-200 ${newGoalColor === c ? 'border-gray-600 dark:border-white scale-110 ring-1 ring-gray-400 ring-offset-1 dark:ring-offset-gray-800' : 'border-transparent hover:scale-105'}`}
                                                    style={{ backgroundColor: c }}
                                                    title={c}
                                                />
                                            ))}
                                            
                                            {/* Custom Color Picker */}
                                            <div className="relative group ml-1">
                                                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all ${!PRESET_COLORS.includes(newGoalColor) ? 'border-gray-600 dark:border-white ring-1 ring-gray-400 ring-offset-1 dark:ring-offset-gray-800' : 'border-gray-200 dark:border-gray-600 hover:border-gray-400'}`}>
                                                    <div 
                                                        className="w-full h-full rounded-full" 
                                                        style={{ backgroundColor: !PRESET_COLORS.includes(newGoalColor) ? newGoalColor : 'transparent', backgroundImage: !PRESET_COLORS.includes(newGoalColor) ? 'none' : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                                                    ></div>
                                                </div>
                                                <input 
                                                    type="color" 
                                                    value={newGoalColor} 
                                                    onChange={(e) => setNewGoalColor(e.target.value)}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                    title="Choose Custom Color"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 mt-4">
                                        <button 
                                            type="button" 
                                            onClick={() => setIsCreating(false)}
                                            className="flex-1 px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-sm font-bold text-gray-700 dark:text-gray-300 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            type="submit" 
                                            className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-sm font-bold text-white shadow-md transition-colors"
                                        >
                                            Create Goal
                                        </button>
                                    </div>
                                </form>
                            </div>
                        ) : (
                            <button 
                                onClick={() => setIsCreating(true)}
                                className="w-full h-full max-h-[600px] min-h-[200px] border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:text-indigo-500 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all group animate-fadeIn"
                            >
                                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-sm">
                                    <i className="fas fa-plus text-2xl"></i>
                                </div>
                                <span className="font-bold text-lg">Add New Goal</span>
                                <span className="text-xs mt-1 opacity-70">Define a new strategy</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};
