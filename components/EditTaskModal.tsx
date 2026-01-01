import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Task, Priority, Status, Subtask, Blocker, Goal, TaskType } from '../types';
import { COLUMN_STATUSES, PRIORITY_LABELS } from '../constants';
import { ConfirmModal } from './ConfirmModal';
import { storage } from '../utils/storage';

interface EditTaskModalProps {
    task: Task;
    allTasks: Task[]; // Receive all tasks for dependency selection
    onSave: (task: Task) => void;
    onDelete: (taskId: string) => void; // New prop
    onClose: () => void;
    onAddGoal?: (goal: Omit<Goal, 'id' | 'createdDate'>) => string; // New prop, returns ID
}

export const EditTaskModal: React.FC<EditTaskModalProps> = ({ task, allTasks, onSave, onDelete, onClose, onAddGoal }) => {
    const [editedTask, setEditedTask] = useState<Task>(task);
    const [tagsInput, setTagsInput] = useState(task.tags?.join(', ') || '');
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
    const [activeBlockerReason, setActiveBlockerReason] = useState('');
    const [availableGoals, setAvailableGoals] = useState<Goal[]>([]);
    
    // New Goal Creation State
    const [isCreatingGoal, setIsCreatingGoal] = useState(false);
    const [newGoalName, setNewGoalName] = useState('');
    
    // Validation State
    const [errors, setErrors] = useState<{ title?: string; timeEstimate?: string }>({});
    const [showBlockerWarning, setShowBlockerWarning] = useState(false);
    
    // Subtask Deletion Confirmation State
    const [subtaskToDelete, setSubtaskToDelete] = useState<string | null>(null);

    const isNewTask = task.id.startsWith('new-');
    const isObservation = editedTask.type === 'observation';
    
    const PRESET_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'];

    useEffect(() => {
        const loadGoals = async () => {
            const saved = await storage.get('goals');
            if (saved) {
                try {
                    setAvailableGoals(JSON.parse(saved));
                } catch (e) {
                    console.error("Failed to load goals for modal", e);
                }
            }
        };
        loadGoals();
    }, []);

    useEffect(() => {
        const currentActiveBlocker = task.blockers?.find(b => !b.resolved);
        setEditedTask({ ...task, type: task.type || 'action' });
        setTagsInput(task.tags?.join(', ') || '');
        setActiveBlockerReason(currentActiveBlocker?.reason || '');
    }, [task]);

    // Check for blocker warning logic
    useEffect(() => {
        const currentActiveBlocker = task.blockers?.find(b => !b.resolved);
        const newReason = activeBlockerReason.trim();
        const hasNewBlocker = newReason !== '' && newReason !== (currentActiveBlocker?.reason || '');
        setShowBlockerWarning(hasNewBlocker && editedTask.status !== 'Blocker');
    }, [activeBlockerReason, editedTask.status, task.blockers]);


    // Function to recursively check for circular dependencies
    const isCircularDependency = (currentTaskId: string, potentialDependencyId: string): boolean => {
        const taskMap = new Map<string, Task>(allTasks.map(t => [t.id, t]));
        
        let toCheck = [potentialDependencyId];
        const visited = new Set<string>();

        while(toCheck.length > 0) {
            const checkingId = toCheck.pop()!;
            if (checkingId === currentTaskId) return true; // Found a circle
            if (visited.has(checkingId)) continue;
            
            visited.add(checkingId);
            const checkingTask = taskMap.get(checkingId);
            if (checkingTask?.dependencies) {
                toCheck.push(...checkingTask.dependencies);
            }
        }
        return false;
    };

    const potentialDependencies = useMemo(() => {
        return allTasks.filter(t => 
            t.id !== editedTask.id && !isCircularDependency(editedTask.id, t.id)
        );
    }, [allTasks, editedTask.id]);


    const handleSave = useCallback(() => {
        // Validation
        const newErrors: { title?: string; timeEstimate?: string } = {};
        if (!editedTask.title.trim()) {
            newErrors.title = "Task title is required.";
        }
        if (editedTask.timeEstimate !== undefined && editedTask.timeEstimate < 0) {
            newErrors.timeEstimate = "Time estimate cannot be negative.";
        }
        
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        const tags = tagsInput.split(',').map(tag => tag.trim()).filter(Boolean);
        let finalTask = { ...editedTask, tags };
    
        const originalActiveBlocker = task.blockers?.find(b => !b.resolved);
        const newReason = activeBlockerReason.trim();
    
        const wasBlocked = !!originalActiveBlocker;
        const isNowBlocked = newReason !== '';
        const reasonChanged = newReason !== (originalActiveBlocker?.reason || '');
    
        if (reasonChanged) {
            const now = new Date().toISOString();
            let updatedBlockers = [...(finalTask.blockers || [])];
    
            // If there was an old blocker, resolve it first
            if (wasBlocked) {
                updatedBlockers = updatedBlockers.map(b => 
                    b.id === originalActiveBlocker.id ? { ...b, resolved: true, resolvedDate: now } : b
                );
            }
    
            // If there's a new reason, add a new active blocker
            if (isNowBlocked) {
                const newBlocker: Blocker = {
                    id: `blocker-${Date.now()}-${Math.random()}`,
                    reason: newReason,
                    createdDate: now,
                    resolved: false,
                };
                updatedBlockers.push(newBlocker);
                finalTask.status = 'Blocker'; // Force status to Blocker if a reason is added/edited
            }
            
            // If the task was blocked but now isn't, move it out of Blocker status
            if (wasBlocked && !isNowBlocked && finalTask.status === 'Blocker') {
                finalTask.status = 'To Do'; // Default to 'To Do' when resolved
            }
            
            finalTask.blockers = updatedBlockers;
        }
    
        onSave(finalTask);
    }, [editedTask, tagsInput, activeBlockerReason, onSave, task.blockers]);
    
    const handleDelete = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onDelete(task.id);
    }, [onDelete, task.id]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSave]);


    const handleInputChange = <K extends keyof Task>(key: K, value: Task[K]) => {
        setEditedTask(prev => ({...prev, [key]: value}));
        // Clear errors
        if (key === 'title') setErrors(prev => ({ ...prev, title: undefined }));
        if (key === 'timeEstimate') setErrors(prev => ({ ...prev, timeEstimate: undefined }));
    };

    const handleDateTimeChange = (value: string) => {
        const newDateTime = value ? new Date(value).toISOString() : undefined;
        // Also update due date when scheduled date time changes
        const newDueDate = value ? value.split('T')[0] : editedTask.dueDate;
        setEditedTask(prev => ({
            ...prev,
            scheduledStartDateTime: newDateTime,
            dueDate: newDueDate,
        }));
    };

    const handleAddSubtask = () => {
        if (newSubtaskTitle.trim() === '') return;
        const newSubtask: Subtask = {
            id: `sub-${Date.now()}-${Math.random()}`,
            title: newSubtaskTitle.trim(),
            isCompleted: false,
        };
        const updatedSubtasks = [...(editedTask.subtasks || []), newSubtask];
        handleInputChange('subtasks', updatedSubtasks);
        setNewSubtaskTitle('');
    };

    const handleToggleSubtask = (subtaskId: string) => {
        const updatedSubtasks = editedTask.subtasks?.map(st =>
            st.id === subtaskId ? { ...st, isCompleted: !st.isCompleted } : st
        );
        handleInputChange('subtasks', updatedSubtasks);
    };

    const requestDeleteSubtask = (subtaskId: string) => {
        setSubtaskToDelete(subtaskId);
    };

    const confirmDeleteSubtask = () => {
        if (!subtaskToDelete) return;
        const updatedSubtasks = editedTask.subtasks?.filter(st => st.id !== subtaskToDelete);
        handleInputChange('subtasks', updatedSubtasks);
        setSubtaskToDelete(null);
    };
    
    const handleDependencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedIds = Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value);
        setEditedTask(prev => ({ ...prev, dependencies: selectedIds }));
    };
    
    // --- CONTEXT CREATION HANDLER ---
    const handleCreateGoal = () => {
        if (!newGoalName.trim() || !onAddGoal) return;
        
        // Pick a random preset color
        const randomColor = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
        
        const newId = onAddGoal({
            title: newGoalName.trim(),
            color: randomColor,
            description: ''
        });
        
        // Optimistically add to local available goals list so it appears in dropdown immediately
        setAvailableGoals(prev => [...prev, {
            id: newId,
            title: newGoalName.trim(),
            color: randomColor,
            createdDate: new Date().toISOString()
        }]);
        
        handleInputChange('goalId', newId);
        setIsCreatingGoal(false);
        setNewGoalName('');
    };

    const inputClasses = "w-full p-3 bg-gray-200 dark:bg-gray-900/50 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-gray-800 dark:text-gray-200";
    const labelClasses = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";
    
    const resolvedBlockers = useMemo(() => 
        editedTask.blockers?.filter(b => b.resolved).sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime()) || [],
    [editedTask.blockers]);


    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] sm:p-4" onClick={onClose}>
            <div 
                className="bg-white dark:bg-gray-800/80 border border-gray-300 dark:border-gray-600 sm:rounded-2xl shadow-2xl w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{isNewTask ? 'New Entry' : 'Edit Entry'}</h2>
                    <button onClick={onClose} className="sm:hidden p-2 text-gray-500"><i className="fas fa-times text-xl"></i></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                    <div>
                        <label htmlFor="task-title" className={labelClasses}>{isObservation ? 'Observation' : 'Task Title'} <span className="text-red-500">*</span></label>
                        <input 
                            id="task-title" 
                            type="text" 
                            value={editedTask.title} 
                            onChange={e => handleInputChange('title', e.target.value)} 
                            placeholder={isObservation ? "What are you observing about the mind?" : "What is the factual action?"} 
                            className={`${inputClasses} ${errors.title ? 'border-red-500 focus:ring-red-500' : ''}`}
                        />
                        {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
                    </div>
                    <div>
                        <label htmlFor="task-desc" className={labelClasses}>Description</label>
                        <textarea id="task-desc" value={editedTask.description || ''} onChange={e => handleInputChange('description', e.target.value)} placeholder="Details..." className={`${inputClasses} h-24`}></textarea>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <div>
                            <label htmlFor="task-status" className={labelClasses}>Status</label>
                            <select id="task-status" value={editedTask.status} onChange={e => handleInputChange('status', e.target.value as Status)} className={inputClasses}>
                                {COLUMN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                         </div>
                         
                         {/* Hide Priority for Observations */}
                         {!isObservation && (
                             <div>
                                <label htmlFor="task-priority" className={labelClasses}>Priority</label>
                                <select id="task-priority" value={editedTask.priority} onChange={e => handleInputChange('priority', e.target.value as Priority)} className={inputClasses}>
                                    {['Critical', 'High', 'Medium', 'Low'].map(p => (
                                        <option key={p} value={p}>{PRIORITY_LABELS[p as Priority]}</option>
                                    ))}
                                </select>
                             </div>
                         )}
                         
                         <div>
                             <label htmlFor="task-due-date" className={labelClasses}>{isObservation ? 'Recorded Date' : 'Due Date'}</label>
                             <input id="task-due-date" type="date" value={editedTask.dueDate.split('T')[0]} onChange={e => handleInputChange('dueDate', e.target.value)} className={inputClasses} required/>
                         </div>

                         {/* Hide Time Estimate for Observations */}
                         {!isObservation && (
                             <div>
                                <label htmlFor="task-time-est" className={labelClasses}>Time Estimate (hours)</label>
                                <input 
                                    id="task-time-est" 
                                    type="number" 
                                    min="0" 
                                    step="0.5" 
                                    value={editedTask.timeEstimate || ''} 
                                    onChange={e => handleInputChange('timeEstimate', Number(e.target.value))} 
                                    placeholder="e.g., 2.5" 
                                    className={`${inputClasses} ${errors.timeEstimate ? 'border-red-500 focus:ring-red-500' : ''}`}
                                />
                                {errors.timeEstimate && <p className="text-red-500 text-xs mt-1">{errors.timeEstimate}</p>}
                             </div>
                         )}
                    </div>
                    
                    {/* Context Selector */}
                    <div>
                        <label htmlFor="task-goal" className={labelClasses}>Context</label>
                        <div className="relative">
                            {isCreatingGoal ? (
                                <div className="flex gap-2 animate-fadeIn">
                                    <input 
                                        type="text" 
                                        value={newGoalName} 
                                        onChange={(e) => setNewGoalName(e.target.value)}
                                        placeholder="New Context Name..." 
                                        className={inputClasses}
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleCreateGoal();
                                            } else if (e.key === 'Escape') {
                                                setIsCreatingGoal(false);
                                            }
                                        }}
                                    />
                                    <button 
                                        onClick={handleCreateGoal}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 rounded-md transition-colors"
                                        title="Create Context"
                                    >
                                        <i className="fas fa-check"></i>
                                    </button>
                                    <button 
                                        onClick={() => setIsCreatingGoal(false)}
                                        className="bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-3 rounded-md transition-colors"
                                        title="Cancel"
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                            ) : (
                                <select 
                                    id="task-goal" 
                                    value={editedTask.goalId || ''} 
                                    onChange={e => {
                                        if (e.target.value === 'NEW_GOAL_TRIGGER') {
                                            setIsCreatingGoal(true);
                                        } else {
                                            handleInputChange('goalId', e.target.value || undefined);
                                        }
                                    }} 
                                    className={inputClasses}
                                >
                                    <option value="">General</option>
                                    {availableGoals.map(g => (
                                        <option key={g.id} value={g.id}>{g.title}</option>
                                    ))}
                                    {onAddGoal && (
                                        <option value="NEW_GOAL_TRIGGER" className="font-bold text-indigo-600 dark:text-indigo-400">
                                            + Create New Context
                                        </option>
                                    )}
                                </select>
                            )}
                            
                            {!isCreatingGoal && (
                                <div className="absolute inset-y-0 right-8 flex items-center pointer-events-none">
                                    {editedTask.goalId && (
                                        <div 
                                            className="w-3 h-3 rounded-full mr-2"
                                            style={{ backgroundColor: availableGoals.find(g => g.id === editedTask.goalId)?.color || 'transparent' }}
                                        ></div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                     <div>
                        <label htmlFor="task-tags" className={labelClasses}>Tags</label>
                        <input id="task-tags" type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="Tags (comma separated)" className={inputClasses}/>
                     </div>
                     
                     {!isObservation && (
                         <div>
                            <label htmlFor="scheduledTime" className={labelClasses}>Scheduled Time</label>
                             <input
                                id="scheduledTime"
                                type="datetime-local"
                                value={editedTask.scheduledStartDateTime ? editedTask.scheduledStartDateTime.substring(0, 16) : ''}
                                onChange={e => handleDateTimeChange(e.target.value)}
                                className={inputClasses}
                            />
                         </div>
                     )}

                    {/* Active Blocker Section */}
                    <div className="mt-6 pt-4 border-t border-gray-300 dark:border-gray-700">
                        <h3 className="text-lg font-semibold mb-1 text-gray-700 dark:text-gray-300">Wait State / Blocker</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            Is this waiting on something else? Waiting is not failure.
                        </p>
                        <textarea
                            id="blocker-reason"
                            value={activeBlockerReason}
                            onChange={e => setActiveBlockerReason(e.target.value)}
                            placeholder="Reason for waiting..."
                            className={`${inputClasses} h-20 ${showBlockerWarning ? 'border-amber-500 focus:ring-amber-500' : ''}`}
                        />
                        {showBlockerWarning && (
                            <p className="text-stone-500 dark:text-stone-400 text-xs mt-1 font-bold">
                                <i className="fas fa-exclamation-triangle mr-1"></i>
                                Moving to 'Blocker' column.
                            </p>
                        )}
                    </div>

                     {/* Dependencies Section - Hide for Observations */}
                     {!isNewTask && !isObservation && (
                        <div className="mt-6 pt-4 border-t border-gray-300 dark:border-gray-700">
                            <label htmlFor="dependencies" className={labelClasses}>Dependencies</label>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Ctrl/Cmd to select multiple.</p>
                            <select
                                id="dependencies"
                                multiple
                                value={editedTask.dependencies || []}
                                onChange={handleDependencyChange}
                                className={`${inputClasses} h-32`}
                            >
                                {potentialDependencies.map(dep => (
                                    <option key={dep.id} value={dep.id} className="p-2">{dep.title}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Subtasks Section - Observations don't have subtasks usually, but can keep as "notes" */}
                    <div className="mt-6 pt-4 border-t border-gray-300 dark:border-gray-700">
                        <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-300">{isObservation ? 'Details / Points' : 'Subtasks'}</h3>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                            {editedTask.subtasks?.map(subtask => (
                                <div key={subtask.id} className="flex items-center justify-between bg-gray-100 dark:bg-gray-900/50 p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700/50 transition-colors">
                                    <div className="flex items-center flex-1">
                                        <input
                                            type="checkbox"
                                            checked={subtask.isCompleted}
                                            onChange={() => handleToggleSubtask(subtask.id)}
                                            className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 mr-3 cursor-pointer"
                                        />
                                        <span className={`flex-1 ${subtask.isCompleted ? 'line-through text-gray-500 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                                            {subtask.title}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => requestDeleteSubtask(subtask.id)}
                                        className="text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-3 px-2"
                                        aria-label={`Delete subtask ${subtask.title}`}
                                    >
                                        <i className="fas fa-trash-alt fa-sm"></i>
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 mt-3">
                            <input
                                type="text"
                                value={newSubtaskTitle}
                                onChange={e => setNewSubtaskTitle(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddSubtask();
                                    }
                                }}
                                placeholder={isObservation ? "Add a detail..." : "Add a new subtask..."}
                                className={inputClasses}
                            />
                            <button
                                type="button"
                                onClick={handleAddSubtask}
                                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold text-sm text-white flex-shrink-0"
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    {/* Bottom Section: Type Switcher & Info */}
                    <div className="pt-6 border-t border-gray-200 dark:border-gray-700 mt-6">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Entry Type & Psychology</label>
                        
                        <div className="flex flex-col gap-4">
                            {/* TYPE SWITCHER */}
                            <div className="bg-gray-200 dark:bg-gray-700 p-1 rounded-lg flex text-xs font-bold self-start">
                                <button
                                    type="button"
                                    onClick={() => handleInputChange('type', 'action')}
                                    className={`px-3 py-1.5 rounded-md transition-all ${!isObservation ? 'bg-white dark:bg-gray-600 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500'}`}
                                >
                                    Factual Action
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleInputChange('type', 'observation')}
                                    className={`px-3 py-1.5 rounded-md transition-all ${isObservation ? 'bg-white dark:bg-gray-600 shadow text-purple-600 dark:text-purple-400' : 'text-gray-500'}`}
                                >
                                    Observation
                                </button>
                            </div>

                            {/* Educational Info Block */}
                            <div className={`p-3 rounded-lg text-xs leading-relaxed border ${!isObservation ? 'bg-indigo-50 border-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-300' : 'bg-purple-50 border-purple-100 text-purple-800 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300'}`}>
                                <div className="flex gap-3">
                                    <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${!isObservation ? 'bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300' : 'bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300'}`}>
                                        <i className={`fas ${!isObservation ? 'fa-check' : 'fa-eye'} text-[10px]`}></i>
                                    </div>
                                    <div>
                                        <strong className="block mb-1">{!isObservation ? 'Chronological Time (Action)' : 'Psychological Time (Insight)'}</strong>
                                        <p className="opacity-90">
                                            {!isObservation 
                                                ? "Use this for concrete tasks that must be done in the real world (e.g., 'Pay Bills', 'Write Code'). These have deadlines and completion states."
                                                : "Use this to note mental traps, fears, or realizations (e.g., 'I am procrastinating because I fear failure'). These are for awareness only, not completion."
                                            }
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Psychological Trap Toggle */}
                            {(!isObservation) && (
                                <div>
                                    <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-600">
                                        <input 
                                            type="checkbox" 
                                            checked={!!editedTask.isBecoming}
                                            onChange={(e) => {
                                                handleInputChange('isBecoming', e.target.checked);
                                                if (!e.target.checked) {
                                                    handleInputChange('becomingWarning', undefined);
                                                }
                                            }}
                                            className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
                                        />
                                        <span className={`text-sm font-medium ${editedTask.isBecoming ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-600 dark:text-gray-400'}`}>
                                            <i className="fas fa-biohazard mr-1.5"></i>
                                            Flagged as Psychological Trap ("Becoming")
                                        </span>
                                    </label>
                                    {editedTask.isBecoming && (
                                        <p className="text-xs text-red-500 ml-8 mt-1 italic">
                                            This task is marked as an ambition of the ego rather than a functional necessity.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>


                <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center flex-shrink-0 bg-white dark:bg-gray-800">
                    <div>
                        {!isNewTask && (
                            <button 
                                type="button"
                                onClick={handleDelete} 
                                className="px-4 py-2 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors font-medium flex items-center gap-2"
                                title="Delete Task Permanently"
                            >
                                <i className="fas fa-trash-alt"></i> Delete
                            </button>
                        )}
                    </div>

                    <div className="flex space-x-4">
                        <button onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-800 dark:text-gray-200">Cancel</button>
                        <button onClick={handleSave} className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold text-white">Save Changes</button>
                    </div>
                </div>
            </div>
            
            <ConfirmModal
                isOpen={!!subtaskToDelete}
                title="Delete Subtask?"
                message="Are you sure you want to remove this?"
                isDestructive={true}
                onConfirm={confirmDeleteSubtask}
                onCancel={() => setSubtaskToDelete(null)}
                confirmLabel="Delete"
            />
        </div>
    );
};