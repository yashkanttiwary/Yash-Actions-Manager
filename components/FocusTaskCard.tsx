
import React, { useState, useEffect } from 'react';
import { Task, Goal } from '../types';
import { PRIORITY_COLORS, TAG_COLORS } from '../constants';

interface FocusTaskCardProps {
    task: Task;
    goals: Goal[];
    onEditTask: (task: Task) => void;
    onUpdateTask: (task: Task) => void;
    onSubtaskToggle: (taskId: string, subtaskId: string) => void;
    onDeleteTask: (taskId: string) => void;
    onUnpin: (taskId: string) => void;
    isCore: boolean;
    isSpaceMode: boolean;
    // Timer props
    activeTaskTimer: {taskId: string, startTime: number} | null;
    onToggleTimer: (taskId: string) => void;
    // Reorder props
    onDragStart: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, taskId: string) => void;
}

const getTagColor = (tagName: string) => {
    let hash = 0;
    for (let i = 0; i < tagName.length; i++) {
        hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % TAG_COLORS.length);
    return TAG_COLORS[index];
};

export const FocusTaskCard: React.FC<FocusTaskCardProps> = ({ 
    task, goals, onEditTask, onUpdateTask, onSubtaskToggle, onUnpin, isCore, isSpaceMode,
    activeTaskTimer, onToggleTimer, onDragStart, onDrop
}) => {
    const priorityColors = PRIORITY_COLORS[task.priority];
    const assignedGoal = goals.find(g => g.id === task.goalId);
    
    const isDone = task.status === 'Done';
    const isActiveTimer = activeTaskTimer?.taskId === task.id;
    const [currentSessionTime, setCurrentSessionTime] = useState(0);

    // Subtask Edit State
    const [isEditingSteps, setIsEditingSteps] = useState(false);
    const [newStepText, setNewStepText] = useState('');

    // Timer Sync
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
    
    const handleStatusToggle = () => {
        if (task.status === 'Done') {
            onUpdateTask({ ...task, status: 'To Do' });
        } else {
            onUpdateTask({ ...task, status: 'Done', completionDate: new Date().toISOString() });
        }
    };

    const handleDragEnd = (e: React.DragEvent) => {
        if (e.target instanceof HTMLElement) e.target.classList.remove('opacity-50');
    };

    const handleDropInternal = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(e, task.id); // Drop ONTO this task
    };

    // --- Subtask Handlers ---
    const handleStepUpdate = (subtaskId: string, newTitle: string) => {
        const updated = task.subtasks?.map(st => st.id === subtaskId ? { ...st, title: newTitle } : st) || [];
        onUpdateTask({ ...task, subtasks: updated });
    };

    const handleStepDelete = (subtaskId: string) => {
        const updated = task.subtasks?.filter(st => st.id !== subtaskId) || [];
        onUpdateTask({ ...task, subtasks: updated });
    };

    const handleStepAdd = () => {
        if (!newStepText.trim()) return;
        const newStep = {
            id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            title: newStepText.trim(),
            isCompleted: false
        };
        const updated = [...(task.subtasks || []), newStep];
        onUpdateTask({ ...task, subtasks: updated });
        setNewStepText('');
    };

    // Card Styling Logic
    const baseClasses = isSpaceMode 
        ? `bg-slate-900/80 backdrop-blur-xl border ${isActiveTimer ? 'border-green-500 shadow-[0_0_30px_rgba(34,197,94,0.3)]' : isCore ? 'border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.15)]' : 'border-slate-700/50'}`
        : `bg-white dark:bg-gray-800 border ${isActiveTimer ? 'border-green-500 ring-2 ring-green-100 dark:ring-green-900' : isCore ? 'border-indigo-200 dark:border-indigo-900 shadow-xl' : 'border-gray-200 dark:border-gray-700 shadow-md'}`;

    return (
        <div 
            draggable
            onDragStart={onDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropInternal}
            className={`
                relative w-full rounded-2xl overflow-hidden transition-all duration-300 group cursor-grab active:cursor-grabbing
                ${baseClasses}
                ${isDone ? 'opacity-70 grayscale' : 'hover:scale-[1.01]'}
            `}
        >
            {/* Header / Status Bar */}
            <div className={`px-6 py-4 border-b flex justify-between items-center ${isSpaceMode ? 'border-white/10 bg-white/5' : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50'}`}>
                <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md ${isCore ? (isSpaceMode ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-700') : (isSpaceMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-600')}`}>
                        {isCore ? 'Must Do' : 'Nice to Do'}
                    </span>
                    {assignedGoal && (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/5 dark:bg-white/5">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: assignedGoal.color }}></div>
                            <span className={`text-[10px] font-bold uppercase tracking-wide ${isSpaceMode ? 'text-white/70' : 'text-gray-600 dark:text-gray-300'}`}>
                                {assignedGoal.title}
                            </span>
                        </div>
                    )}
                </div>
                
                <div className="flex items-center gap-2">
                    {/* Timer Button */}
                    {!isDone && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleTimer(task.id); }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                                isActiveTimer 
                                    ? 'bg-green-500 text-white animate-pulse shadow-green-500/50' 
                                    : isSpaceMode 
                                        ? 'bg-white/10 text-white hover:bg-white/20' 
                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                        >
                            <i className={`fas ${isActiveTimer ? 'fa-pause' : 'fa-play'}`}></i>
                            {isActiveTimer ? new Date(currentSessionTime).toISOString().substr(14, 5) : 'Timer'}
                        </button>
                    )}

                    <button 
                        onClick={() => onEditTask(task)}
                        className={`text-xs font-medium px-2 py-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${isSpaceMode ? 'text-slate-400' : 'text-gray-400'}`}
                    >
                        Edit
                    </button>
                    <button 
                        onClick={() => onUnpin(task.id)}
                        className={`text-xs font-medium px-2 py-1 rounded hover:bg-red-500/10 hover:text-red-500 transition-colors ${isSpaceMode ? 'text-slate-400' : 'text-gray-400'}`}
                        title="Remove from Focus (Unpin)"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <div className="p-6 md:p-8">
                {/* Title & Checkbox */}
                <div className="flex items-start gap-4 mb-4">
                    <button
                        onClick={handleStatusToggle}
                        className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 shadow-sm
                            ${isDone 
                                ? 'bg-green-500 border-green-500 scale-110' 
                                : isSpaceMode ? 'border-slate-500 hover:border-green-400' : 'border-gray-300 dark:border-gray-600 hover:border-green-500'
                            }
                        `}
                    >
                        {isDone && <i className="fas fa-check text-white text-sm"></i>}
                    </button>
                    
                    <div className="flex-grow">
                        <h3 className={`text-2xl font-bold leading-tight mb-2 ${isDone ? 'line-through text-gray-500' : (isSpaceMode ? 'text-white' : 'text-gray-900 dark:text-white')}`}>
                            {task.title}
                        </h3>
                        
                        {task.description && (
                            <div className={`text-sm leading-relaxed whitespace-pre-wrap ${isSpaceMode ? 'text-indigo-200/70' : 'text-gray-600 dark:text-gray-400'}`}>
                                {task.description}
                            </div>
                        )}
                    </div>
                </div>

                {/* Subtasks Section with Inline Edit */}
                <div className="mt-6 pl-0 md:pl-12">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className={`text-xs font-bold uppercase tracking-widest ${isSpaceMode ? 'text-slate-500' : 'text-gray-400'}`}>
                            Steps
                        </h4>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsEditingSteps(!isEditingSteps); }}
                            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${isEditingSteps ? 'bg-green-500 text-white' : (isSpaceMode ? 'hover:bg-white/10 text-slate-500' : 'hover:bg-gray-100 text-gray-400')}`}
                            title={isEditingSteps ? "Done Editing" : "Edit Steps"}
                        >
                            <i className={`fas ${isEditingSteps ? 'fa-check' : 'fa-pen'} text-xs`}></i>
                        </button>
                    </div>

                    {isEditingSteps ? (
                        <div className="space-y-2 animate-fadeIn">
                            {task.subtasks?.map(st => (
                                <div key={st.id} className="flex items-center gap-2">
                                    <button 
                                        onClick={() => handleStepDelete(st.id)}
                                        className="text-red-400 hover:text-red-500 px-1"
                                        title="Delete step"
                                    >
                                        <i className="fas fa-minus-circle"></i>
                                    </button>
                                    <input 
                                        type="text" 
                                        value={st.title}
                                        onChange={(e) => handleStepUpdate(st.id, e.target.value)}
                                        className={`flex-1 text-sm bg-transparent border-b ${isSpaceMode ? 'border-white/20 text-white focus:border-white' : 'border-gray-300 text-gray-800 focus:border-indigo-500'} focus:outline-none py-1 transition-colors`}
                                    />
                                </div>
                            ))}
                            <div className="flex items-center gap-2 mt-2">
                                <i className={`fas fa-plus text-xs ${isSpaceMode ? 'text-slate-500' : 'text-gray-400'} pl-1.5`}></i>
                                <input 
                                    type="text" 
                                    value={newStepText}
                                    onChange={(e) => setNewStepText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleStepAdd()}
                                    placeholder="Add a new step..."
                                    className={`flex-1 text-sm bg-transparent border-b ${isSpaceMode ? 'border-white/10 text-slate-300 placeholder-slate-600 focus:border-white/50' : 'border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-500'} focus:outline-none py-1 transition-colors`}
                                />
                                <button 
                                    onClick={handleStepAdd}
                                    disabled={!newStepText.trim()}
                                    className={`text-xs font-bold px-2 py-1 rounded ${!newStepText.trim() ? 'opacity-50 cursor-not-allowed' : ''} ${isSpaceMode ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-600'}`}
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {task.subtasks && task.subtasks.length > 0 ? (
                                task.subtasks.map(st => (
                                    <div 
                                        key={st.id} 
                                        onClick={() => onSubtaskToggle(task.id, st.id)}
                                        className={`group/sub flex items-start gap-3 cursor-pointer select-none transition-opacity ${st.isCompleted ? 'opacity-50' : 'opacity-100'}`}
                                    >
                                        <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors ${st.isCompleted ? 'bg-green-500 border-green-500' : (isSpaceMode ? 'border-slate-600 group-hover/sub:border-white' : 'border-gray-300 dark:border-gray-600 group-hover/sub:border-indigo-500')}`}>
                                            {st.isCompleted && <i className="fas fa-check text-[10px] text-white"></i>}
                                        </div>
                                        <span className={`text-sm ${st.isCompleted ? 'line-through' : ''} ${isSpaceMode ? 'text-slate-300' : 'text-gray-700 dark:text-gray-300'}`}>
                                            {st.title}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <div 
                                    onClick={() => setIsEditingSteps(true)}
                                    className={`text-sm italic cursor-pointer transition-colors ${isSpaceMode ? 'text-slate-600 hover:text-slate-400' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    No steps defined. Click to add breakdown.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Metadata */}
                <div className="mt-8 flex flex-wrap items-center gap-3 pt-4 border-t border-dashed border-gray-200 dark:border-gray-700/50">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${priorityColors.bg} ${priorityColors.text}`}>
                        {task.priority} Priority
                    </span>
                    
                    {task.timeEstimate && (
                        <span className={`text-xs flex items-center gap-1.5 px-2 py-1 rounded-md ${isSpaceMode ? 'bg-white/5 text-slate-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                            <i className="far fa-clock"></i> {task.timeEstimate}h Estimate
                        </span>
                    )}

                    {task.tags && task.tags.map(tag => (
                        <span key={tag} className={`text-xs px-2.5 py-1 rounded-full text-white shadow-sm ${getTagColor(tag)}`}>
                            #{tag}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};
