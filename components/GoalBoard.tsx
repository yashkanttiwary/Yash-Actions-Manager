import React, { useState, useRef } from 'react';
import { Task, Goal } from '../types';
import { GoalColumn } from './GoalColumn';
import { UNASSIGNED_GOAL_ID } from '../constants';

interface GoalBoardProps {
    tasks: Task[];
    goals: Goal[];
    onTaskMove: (taskId: string, newGoalId: string) => void;
    onEditTask: (task: Task) => void;
    onUpdateTask: (task: Task) => void; // Added prop
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
    tasks, goals, onTaskMove, onEditTask, onUpdateTask, onDeleteTask, onAddGoal, onEditGoal, onDeleteGoal,
    activeTaskTimer, onToggleTimer, onSubtaskToggle, isCompactMode, isSpaceMode, zoomLevel,
    onFocusGoal, currentFocusId
}) => {
    const [isCreating, setIsCreating] = useState(false);
    const [newGoalTitle, setNewGoalTitle] = useState('');
    const [newGoalColor, setNewGoalColor] = useState('#6366f1');
    const [newGoalTextColor, setNewGoalTextColor] = useState<string | undefined>(undefined); // Undefined means auto-contrast
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newGoalTitle.trim()) {
            onAddGoal({
                title: newGoalTitle.trim(),
                color: newGoalColor,
                textColor: newGoalTextColor, // Pass the custom text color
                description: '',
            });
            setNewGoalTitle('');
            setNewGoalColor('#6366f1');
            setNewGoalTextColor(undefined);
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
        id: UNASSIGNED_GOAL_ID,
        title: 'General', // K-Mode: General tasks instead of "Unassigned"
        color: '#64748b', // Slate
        createdDate: new Date().toISOString(),
        progress: 0
    };

    const unassignedTasks = tasks.filter(t => !t.goalId || !goals.find(g => g.id === t.goalId));

    const PRESET_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'];

    // Helper to calculate contrast for preview if undefined
    const getPreviewTextColor = (bg: string) => {
        if (newGoalTextColor) return newGoalTextColor;
        // Simple auto-contrast logic
        const r = parseInt(bg.substring(1, 3), 16);
        const g = parseInt(bg.substring(3, 5), 16);
        const b = parseInt(bg.substring(5, 7), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return yiq >= 128 ? '#000000' : '#ffffff';
    };

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
                        Fact Status
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
                        onUpdateTask={onUpdateTask}
                        onDeleteTask={onDeleteTask}
                        onEditGoal={() => {}} // Can't edit unassigned
                        onDeleteGoal={() => {}} // Can't delete unassigned
                        activeTaskTimer={activeTaskTimer}
                        onToggleTimer={onToggleTimer}
                        onSubtaskToggle={onSubtaskToggle}
                        isCompactMode={isCompactMode}
                        isSpaceMode={isSpaceMode}
                        onFocusGoal={onFocusGoal}
                        isFocused={currentFocusId === UNASSIGNED_GOAL_ID}
                    />

                    {/* Actual Context Columns */}
                    {goals.map(goal => (
                        <GoalColumn
                            key={goal.id}
                            goal={goal}
                            tasks={tasks.filter(t => t.goalId === goal.id)}
                            allTasks={tasks}
                            onTaskMove={(tid) => onTaskMove(tid, goal.id)}
                            onEditTask={onEditTask}
                            onUpdateTask={onUpdateTask}
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

                    {/* Add Context Button / Form */}
                    <div className="flex-shrink-0 w-80">
                        {isCreating ? (
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg border border-indigo-200 dark:border-indigo-800 animate-fadeIn">
                                <h3 className="font-bold mb-3 text-gray-800 dark:text-white">New Context</h3>
                                <form onSubmit={handleCreateSubmit}>
                                    <div className="mb-3">
                                        <input
                                            autoFocus
                                            type="text"
                                            value={newGoalTitle}
                                            onChange={e => setNewGoalTitle(e.target.value)}
                                            placeholder="Context Title (e.g. Health, Work)"
                                            className="w-full p-2 bg-gray-100 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                                        />
                                    </div>
                                    
                                    {/* Preview Chip */}
                                    {newGoalTitle && (
                                        <div className="mb-3 p-2 rounded text-center text-sm font-bold shadow-sm transition-colors border border-black/10" style={{ backgroundColor: newGoalColor, color: getPreviewTextColor(newGoalColor) }}>
                                            {newGoalTitle}
                                        </div>
                                    )}

                                    <div className="mb-4 space-y-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase">Background Color</label>
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
                                                
                                                {/* Custom Background Picker */}
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
                                                        title="Choose Background Color"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase">Text Color</label>
                                            <div className="flex items-center gap-3">
                                                <div className="relative flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 cursor-pointer overflow-hidden shadow-sm hover:border-gray-400">
                                                    <input 
                                                        type="color" 
                                                        value={newGoalTextColor || '#ffffff'}
                                                        onChange={(e) => setNewGoalTextColor(e.target.value)}
                                                        className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] p-0 m-0 cursor-pointer"
                                                        style={{ border: 'none' }}
                                                    />
                                                    <i className="fas fa-font z-10 pointer-events-none drop-shadow-md text-xs" style={{ color: newGoalTextColor ? (parseInt(newGoalTextColor.substring(1), 16) > 0xffffff/2 ? 'black' : 'white') : 'gray' }}></i>
                                                </div>
                                                
                                                <button
                                                    type="button"
                                                    onClick={() => setNewGoalTextColor(undefined)}
                                                    className={`px-2 py-1 text-[10px] rounded border transition-colors ${!newGoalTextColor ? 'bg-indigo-100 text-indigo-700 border-indigo-200 font-bold' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}
                                                >
                                                    Auto / Reset
                                                </button>
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
                                            Create Context
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
                                <span className="font-bold text-lg">Add New Context</span>
                                <span className="text-xs mt-1 opacity-70">Group tasks by context</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};