
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Task, Status, ColumnLayout, Goal, Priority } from '../types';
import { COLUMN_STATUSES } from '../constants';
import { storage } from '../utils/storage';

const COLUMN_WIDTH = 320; // Corresponds to w-80
const COLUMN_GAP = 24; // Increased gap for better visual separation

export const useTaskManager = (enableLoading: boolean = true) => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [columnLayouts, setColumnLayouts] = useState<ColumnLayout[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const getDefaultLayout = useCallback((): ColumnLayout[] => {
        return COLUMN_STATUSES.map((status, index) => ({
            id: status,
            x: index * (COLUMN_WIDTH + COLUMN_GAP),
            y: 0,
            zIndex: 10
        }));
    }, []);

    // Filter out deleted tasks for main view
    const activeTasks = useMemo(() => tasks.filter(t => !t.isDeleted), [tasks]);
    const deletedTasks = useMemo(() => tasks.filter(t => t.isDeleted), [tasks]);

    // FIX LOW-001: Memoize expensive calculation
    const processedTasks = useMemo(() => {
        const taskMap = new Map<string, Task>(activeTasks.map(t => [t.id, t]));
        return activeTasks.map(task => {
            let isBlocked = false;
            if (task.dependencies && task.dependencies.length > 0) {
                for (const depId of task.dependencies) {
                    const dependencyTask = taskMap.get(depId);
                    // A task is blocked if any of its dependencies exist and are not 'Done'
                    if (dependencyTask && dependencyTask.status !== 'Done') {
                        isBlocked = true;
                        break;
                    }
                }
            }
            return { ...task, isBlockedByDependencies: isBlocked };
        });
    }, [activeTasks]);

    // Calculate Goal Progress automatically
    const processedGoals = useMemo(() => {
        return goals.map(goal => {
            const goalTasks = activeTasks.filter(t => t.goalId === goal.id);
            const total = goalTasks.length;
            const completed = goalTasks.filter(t => t.status === 'Done').length;
            const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
            return { ...goal, progress };
        });
    }, [goals, activeTasks]);

    useEffect(() => {
        // Strict Guard: If loading is not enabled (i.e. not connected), do nothing.
        // However, we MUST ensure layouts are initialized if we are going to show anything later.
        if (!enableLoading) {
            setTasks([]);
            setGoals([]);
            // We intentionally don't set layouts here to avoid flashing default layout before checking storage
            setIsLoading(false);
            return;
        }

        const loadData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // FIX CRIT-001: Load Tasks from centralized storage
                const savedTasks = await storage.get('tasks');
                let loadedTasks: Task[] = [];
                if (savedTasks && savedTasks !== '[]') {
                    try {
                        const parsedTasks = JSON.parse(savedTasks).map((task: any) => {
                            // Backfill blocker data for backward compatibility
                            let blockers = task.blockers || [];
                            if (task.blockerReason && !blockers.some((b: any) => b.reason === task.blockerReason)) {
                                blockers.push({
                                    id: `blocker-${Date.now()}-${Math.random()}`,
                                    reason: task.blockerReason,
                                    createdDate: task.statusChangeDate || new Date().toISOString(),
                                    resolved: false,
                                });
                            }
                            delete task.blockerReason; // Remove old field

                            return {
                                ...task,
                                dueDate: task.dueDate || new Date().toISOString().split('T')[0],
                                statusChangeDate: task.statusChangeDate || task.lastModified || new Date().toISOString(),
                                actualTimeSpent: task.actualTimeSpent || 0,
                                xpAwarded: task.xpAwarded || (task.status === 'Done'),
                                scheduledStartDateTime: task.scheduledStartDateTime,
                                dependencies: task.dependencies || [],
                                blockers: blockers,
                                currentSessionStartTime: task.currentSessionStartTime || null,
                                goalId: task.goalId || undefined, // New Field
                                isPinned: task.isPinned || false, // Default to false
                                focusOrder: task.focusOrder, // Load order
                                isDeleted: task.isDeleted || false, // Soft delete support
                            };
                        });
                        loadedTasks = parsedTasks;
                    } catch (e) {
                        console.error("Failed to parse saved tasks", e);
                        loadedTasks = [];
                    }
                }
                setTasks(loadedTasks);

                // LOAD GOALS
                const savedGoals = await storage.get('goals');
                if (savedGoals && savedGoals !== '[]') {
                    try {
                        const parsedGoals = JSON.parse(savedGoals);
                        setGoals(parsedGoals);
                    } catch (e) {
                        console.error("Failed to parse goals", e);
                        setGoals([]);
                    }
                }

                // FIX CRIT-001: Load Column Layouts from centralized storage
                const savedLayouts = await storage.get('columnLayouts_v5');
                let finalLayouts: ColumnLayout[] = [];
                
                if (savedLayouts) {
                    try {
                        const parsed = JSON.parse(savedLayouts);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            finalLayouts = parsed;
                        }
                    } catch (e) {
                        console.error("Failed to parse saved layouts", e);
                    }
                }
                
                // If layouts are missing or empty, use default
                if (finalLayouts.length === 0) {
                    finalLayouts = getDefaultLayout();
                }
                
                setColumnLayouts(finalLayouts);

            } catch (err) {
                console.error(err);
                setError('Failed to load local data.');
                setTasks([]);
                setGoals([]);
                setColumnLayouts(getDefaultLayout());
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [getDefaultLayout, enableLoading]);

    // FIX CRIT-001: Save to centralized storage
    useEffect(() => {
        // Only save if we are enabled and not loading.
        // This prevents overwriting storage with empty arrays during initialization phases.
        if (!isLoading && enableLoading) {
            storage.set('tasks', JSON.stringify(tasks));
            storage.set('goals', JSON.stringify(goals));
            storage.set('columnLayouts_v5', JSON.stringify(columnLayouts));
        }
    }, [tasks, goals, columnLayouts, isLoading, enableLoading]);

    // TYPE FIX: Flexible input allowing full Task or partial data.
    // Returns the created task so the caller can perform follow-up actions (like AI analysis).
    const addTask = useCallback((taskData: Partial<Task> & { title: string; status: Status; priority: Priority; dueDate: string }) => {
        const now = new Date().toISOString();
        const newTask: Task = {
            id: taskData.id || `task-${Date.now()}-${Math.random()}`,
            createdDate: taskData.createdDate || now,
            lastModified: taskData.lastModified || now,
            statusChangeDate: taskData.statusChangeDate || now,
            priority: 'Medium',
            tags: [],
            subtasks: [],
            actualTimeSpent: 0,
            xpAwarded: false,
            dependencies: [],
            blockers: [],
            currentSessionStartTime: null,
            isPinned: false,
            isDeleted: false,
            ...taskData,
        };
        setTasks(prevTasks => [...prevTasks, newTask]);
        return newTask;
    }, []);

    const updateTask = useCallback((updatedTask: Task) => {
        setTasks(prevTasks => {
            const newTasks = prevTasks.map(task =>
                task.id === updatedTask.id ? { ...updatedTask, lastModified: new Date().toISOString() } : task
            );
            return newTasks;
        });
    }, []);

    // Soft Delete (Safe)
    const deleteTask = useCallback((taskId: string) => {
        setTasks(prevTasks => prevTasks.map(task => 
            String(task.id) === String(taskId) 
                ? { ...task, isDeleted: true, lastModified: new Date().toISOString() } 
                : task
        ));
    }, []);

    // Restore from Trash
    const restoreTask = useCallback((taskId: string) => {
        setTasks(prevTasks => prevTasks.map(task => 
            String(task.id) === String(taskId) 
                ? { ...task, isDeleted: false, lastModified: new Date().toISOString() } 
                : task
        ));
    }, []);

    // Hard Delete (Destructive)
    const permanentlyDeleteTask = useCallback((taskId: string) => {
        setTasks(prevTasks => prevTasks.filter(task => String(task.id) !== String(taskId)));
    }, []);

    const emptyTrash = useCallback(() => {
        setTasks(prevTasks => prevTasks.filter(task => !task.isDeleted));
    }, []);

    const moveTask = useCallback((taskId: string, newStatus: Status, newIndex: number) => {
        setTasks(prevTasks => {
            let taskToMove = { ...prevTasks.find(t => t.id === taskId)! };
            if (!taskToMove) return prevTasks;

            const oldStatus = taskToMove.status;
            const now = new Date().toISOString();
            
            taskToMove.status = newStatus;
            taskToMove.lastModified = now;

            if (oldStatus !== newStatus) {
                taskToMove.statusChangeDate = now;
            }
    
            if (newStatus === 'Done' && !taskToMove.xpAwarded) {
                taskToMove.completionDate = now;
                taskToMove.xpAwarded = true;
            }

            const tasksWithoutMoved = prevTasks.filter(t => t.id !== taskId);
            
            // We need to insert it back in the correct visual order relative to other *active* tasks
            // But state is flat. We just append for now, filtering handles view.
            // Complex reordering in flat state is tricky without a sort index.
            // We rely on the Kanban component to map view index to logic if needed, 
            // but for simple status change, we just update.
            // However, useTaskManager's moveTask logic attempts to splice.
            // If we are filtering deleted tasks in view, splice might be off if deleted tasks exist.
            // For safety, we just add it to the end of the array or rely on sort order.
            // But let's try to honor the splice logic for active tasks context.
            
            // Actually, simpler to just return updated array with modified task.
            // Layout order is handled by the board sorting or focusOrder.
            
            return prevTasks.map(t => t.id === taskId ? taskToMove : t);
        });
    }, []);
    
    // --- FOCUS LOGIC (Unlimited + Auto In Progress) ---
    const toggleTaskPin = useCallback((taskId: string) => {
        let result = { success: true, message: '' };
        
        setTasks(prevTasks => {
            const task = prevTasks.find(t => t.id === taskId);
            if (!task) return prevTasks;

            // If pinning (currently false)
            if (!task.isPinned) {
                const pinnedTasks = prevTasks.filter(t => t.isPinned && !t.isDeleted);
                const maxOrder = pinnedTasks.reduce((max, t) => Math.max(max, t.focusOrder || 0), -1);
                
                let newStatus = task.status;
                if (task.status !== 'Blocker' && task.status !== 'Done') {
                    newStatus = 'In Progress';
                }

                return prevTasks.map(t => 
                    t.id === taskId ? { 
                        ...t, 
                        isPinned: true, 
                        focusOrder: maxOrder + 1, 
                        status: newStatus,
                        lastModified: new Date().toISOString() 
                    } : t
                );
            }

            // If unpinning
            return prevTasks.map(t => 
                t.id === taskId ? { ...t, isPinned: false, focusOrder: undefined, lastModified: new Date().toISOString() } : t
            );
        });
        
        return result;
    }, []);

    // Reorder tasks within the Focus View
    const reorderPinnedTasks = useCallback((activeTaskId: string, overTaskId: string) => {
        setTasks(prev => {
            const pinned = prev.filter(t => t.isPinned && !t.isDeleted).sort((a, b) => {
                if (a.focusOrder !== undefined && b.focusOrder !== undefined) return a.focusOrder - b.focusOrder;
                return 0; 
            });

            const activeIndex = pinned.findIndex(t => t.id === activeTaskId);
            const overIndex = pinned.findIndex(t => t.id === overTaskId);

            if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return prev;

            const [moved] = pinned.splice(activeIndex, 1);
            pinned.splice(overIndex, 0, moved);

            const orderUpdates = new Map<string, number>();
            pinned.forEach((t, index) => orderUpdates.set(t.id, index));

            return prev.map(t => {
                if (orderUpdates.has(t.id)) {
                    return { ...t, focusOrder: orderUpdates.get(t.id), lastModified: new Date().toISOString() };
                }
                return t;
            });
        });
    }, []);

    // --- GOAL OPERATIONS ---
    const addGoal = useCallback((goalData: Omit<Goal, 'id' | 'createdDate'>) => {
        const now = new Date().toISOString();
        const id = `goal-${Date.now()}-${Math.random()}`;
        const newGoal: Goal = {
            id,
            createdDate: now,
            ...goalData
        };
        setGoals(prev => [...prev, newGoal]);
        return id; 
    }, []);

    const updateGoal = useCallback((updatedGoal: Goal) => {
        setGoals(prev => prev.map(g => g.id === updatedGoal.id ? updatedGoal : g));
    }, []);

    const deleteGoal = useCallback((goalId: string) => {
        setGoals(prev => prev.filter(g => g.id !== goalId));
        setTasks(prev => prev.map(t => t.goalId === goalId ? { ...t, goalId: undefined } : t));
    }, []);

    const setAllData = useCallback((newTasks: Task[], newGoals: Goal[]) => {
        const tasksWithDefaults = newTasks.map(task => ({
            ...task,
            statusChangeDate: task.statusChangeDate || task.lastModified,
            actualTimeSpent: task.actualTimeSpent || 0,
            xpAwarded: task.xpAwarded || (task.status === 'Done'),
            scheduledStartDateTime: task.scheduledStartDateTime,
            dependencies: task.dependencies || [],
            blockers: task.blockers || [],
            currentSessionStartTime: task.currentSessionStartTime || null,
            isPinned: task.isPinned || false, 
            focusOrder: task.focusOrder,
            isDeleted: task.isDeleted || false
        }));
        setTasks(tasksWithDefaults);
        setGoals(newGoals);
    }, []);

    const getTasksByStatus = (status: Status, taskList: Task[] = processedTasks) => {
        return taskList.filter(task => task.status === status);
    };
    
    const setAllTasks = useCallback((newTasks: Task[]) => {
        const tasksWithDefaults = newTasks.map(task => ({
            ...task,
            statusChangeDate: task.statusChangeDate || task.lastModified,
            actualTimeSpent: task.actualTimeSpent || 0,
            xpAwarded: task.xpAwarded || (task.status === 'Done'),
            scheduledStartDateTime: task.scheduledStartDateTime,
            dependencies: task.dependencies || [],
            blockers: task.blockers || [],
            currentSessionStartTime: task.currentSessionStartTime || null,
            isPinned: task.isPinned || false,
            isDeleted: task.isDeleted || false
        }));
        setTasks(tasksWithDefaults);
    }, []);

    const updateColumnLayout = useCallback((id: Status, newLayout: Omit<ColumnLayout, 'id'>) => {
        setColumnLayouts(prev => {
            const columnToUpdate = prev.find(c => c.id === id);
            if (!columnToUpdate) return prev;
            const otherColumns = prev.filter(c => c.id !== id);
            return [...otherColumns, { ...newLayout, id }];
        });
    }, []);

    const resetColumnLayouts = useCallback(() => {
        setColumnLayouts(getDefaultLayout());
    }, [getDefaultLayout]);

    return {
        tasks: processedTasks,
        deletedTasks, // Exposed for Trash View
        goals: processedGoals,
        columns: COLUMN_STATUSES,
        columnLayouts,
        addTask,
        updateTask,
        deleteTask, // Now Soft Delete
        restoreTask, // New
        permanentlyDeleteTask, // New
        emptyTrash, // New
        moveTask,
        toggleTaskPin,
        reorderPinnedTasks,
        getTasksByStatus,
        setAllTasks,
        setAllData, 
        addGoal,
        updateGoal,
        deleteGoal,
        updateColumnLayout,
        resetColumnLayouts,
        isLoading,
        error
    };
};