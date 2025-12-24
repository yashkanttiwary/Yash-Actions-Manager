
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Task, Priority, Status, Subtask, Blocker } from '../types';
import { COLUMN_STATUSES } from '../constants';
import { ConfirmModal } from './ConfirmModal';

interface EditTaskModalProps {
    task: Task;
    allTasks: Task[]; // Receive all tasks for dependency selection
    onSave: (task: Task) => void;
    onDelete: (taskId: string) => void; // New prop
    onClose: () => void;
}

export const EditTaskModal: React.FC<EditTaskModalProps> = ({ task, allTasks, onSave, onDelete, onClose }) => {
    const [editedTask, setEditedTask] = useState<Task>(task);
    const [tagsInput, setTagsInput] = useState(task.tags?.join(', ') || '');
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
    const [activeBlockerReason, setActiveBlockerReason] = useState('');
    
    // Validation State
    const [errors, setErrors] = useState<{ title?: string; timeEstimate?: string }>({});
    const [showBlockerWarning, setShowBlockerWarning] = useState(false);
    
    // Subtask Deletion Confirmation State
    const [subtaskToDelete, setSubtaskToDelete] = useState<string | null>(null);

    const isNewTask = task.id.startsWith('new-');
    
    useEffect(() => {
        const currentActiveBlocker = task.blockers?.find(b => !b.resolved);
        setEditedTask(task);
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

    const inputClasses = "w-full p-3 bg-gray-200 dark:bg-gray-900/50 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-gray-800 dark:text-gray-200";
    const labelClasses = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";
    
    const resolvedBlockers = useMemo(() => 
        editedTask.blockers?.filter(b => b.resolved).sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime()) || [],
    [editedTask.blockers]);


    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800/80 border border-gray-300 dark:border-gray-600 rounded-2xl shadow-2xl w-full max-w-2xl p-6 sm:p-8" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">{isNewTask ? 'Add New Task' : 'Edit Task'}</h2>
                
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-4">
                    <div>
                        <label htmlFor="task-title" className={labelClasses}>Title <span className="text-red-500">*</span></label>
                        <input 
                            id="task-title" 
                            type="text" 
                            value={editedTask.title} 
                            onChange={e => handleInputChange('title', e.target.value)} 
                            placeholder="Title" 
                            className={`${inputClasses} ${errors.title ? 'border-red-500 focus:ring-red-500' : ''}`}
                        />
                        {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
                    </div>
                    <div>
                        <label htmlFor="task-desc" className={labelClasses}>Description</label>
                        <textarea id="task-desc" value={editedTask.description || ''} onChange={e => handleInputChange('description', e.target.value)} placeholder="Description" className={`${inputClasses} h-24`}></textarea>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <div>
                            <label htmlFor="task-status" className={labelClasses}>Status (Board Column)</label>
                            <select id="task-status" value={editedTask.status} onChange={e => handleInputChange('status', e.target.value as Status)} className={inputClasses}>
                                {COLUMN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                         </div>
                         <div>
                            <label htmlFor="task-priority" className={labelClasses}>Priority</label>
                            <select id="task-priority" value={editedTask.priority} onChange={e => handleInputChange('priority', e.target.value as Priority)} className={inputClasses}>
                                {['Critical', 'High', 'Medium', 'Low'].map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                         </div>
                         <div>
                             <label htmlFor="task-due-date" className={labelClasses}>Due Date</label>
                             <input id="task-due-date" type="date" value={editedTask.dueDate.split('T')[0]} onChange={e => handleInputChange('dueDate', e.target.value)} className={inputClasses} required/>
                         </div>
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
                    </div>
                     <div>
                        <label htmlFor="task-tags" className={labelClasses}>Tags</label>
                        <input id="task-tags" type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="Tags (comma separated)" className={inputClasses}/>
                     </div>
                     <div>
                        <label htmlFor="scheduledTime" className={labelClasses}>Scheduled Time (optional)</label>
                         <input
                            id="scheduledTime"
                            type="datetime-local"
                            value={editedTask.scheduledStartDateTime ? editedTask.scheduledStartDateTime.substring(0, 16) : ''}
                            onChange={e => handleDateTimeChange(e.target.value)}
                            className={inputClasses}
                        />
                     </div>

                    {/* Active Blocker Section */}
                    <div className="mt-6 pt-4 border-t border-gray-300 dark:border-gray-700">
                        <h3 className="text-lg font-semibold mb-1 text-gray-700 dark:text-gray-300">Active Blocker</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            Add a reason to move this task to the 'Blocker' column. Clear the reason to resolve the blocker.
                        </p>
                        <textarea
                            id="blocker-reason"
                            value={activeBlockerReason}
                            onChange={e => setActiveBlockerReason(e.target.value)}
                            placeholder="e.g., Waiting for API key from external team..."
                            className={`${inputClasses} h-20 ${showBlockerWarning ? 'border-amber-500 focus:ring-amber-500' : ''}`}
                        />
                        {showBlockerWarning && (
                            <p className="text-amber-600 dark:text-amber-400 text-xs mt-1 font-bold">
                                <i className="fas fa-exclamation-triangle mr-1"></i>
                                Warning: Saving this will automatically move the task to the 'Blocker' column.
                            </p>
                        )}
                    </div>

                     {/* Dependencies Section */}
                     {!isNewTask && (
                        <div className="mt-6 pt-4 border-t border-gray-300 dark:border-gray-700">
                            <label htmlFor="dependencies" className={labelClasses}>Dependencies (Blocked By)</label>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Select tasks that must be completed before this one. Use Ctrl/Cmd to select multiple.</p>
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

                    {/* Subtasks Section */}
                    <div className="mt-6 pt-4 border-t border-gray-300 dark:border-gray-700">
                        <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-300">Subtasks</h3>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
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
                                placeholder="Add a new subtask..."
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

                    {/* Blocker History Section */}
                    {resolvedBlockers.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-gray-300 dark:border-gray-700">
                            <h3 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-300">Resolved Blocker History</h3>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                                {resolvedBlockers.map(blocker => (
                                    <div key={blocker.id} className="flex items-start p-3 rounded-md bg-green-100 dark:bg-green-900/30">
                                        <i className="fas fa-check-circle text-green-500 mt-1 mr-3"></i>
                                        <div>
                                            <p className="text-sm line-through text-gray-500 dark:text-gray-400">
                                                {blocker.reason}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                Resolved on {new Date(blocker.resolvedDate!).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>


                <div className="mt-8 flex justify-between items-center flex-shrink-0">
                    {/* Delete Button (Only for existing tasks) */}
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
                message="Are you sure you want to remove this subtask?"
                isDestructive={true}
                onConfirm={confirmDeleteSubtask}
                onCancel={() => setSubtaskToDelete(null)}
                confirmLabel="Delete"
            />
        </div>
    );
};
