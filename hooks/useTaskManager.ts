
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Task, Status, ColumnLayout, Goal, Priority } from '../types';
import { COLUMN_STATUSES } from '../constants';
import { storage } from '../utils/storage';

const COLUMN_WIDTH = 320; // Corresponds to w-80
const COLUMN_GAP = 24; // Increased gap for better visual separation

export const useTaskManager = (enableLoading: boolean = true) => {
    const [allTasks, setAllTasksState] = useState<Task[]>([]); // Contains Active AND Deleted
    const [goals, setGoals] = useState<Goal[]>([]);
    const [columnLayouts, setColumnLayouts] = useState<ColumnLayout[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Derived state for UI (Active tasks only)
    const activeTasks = useMemo(() => allTasks.filter(t => !t.isDeleted), [allTasks]);
    const deletedTasks = useMemo(() => allTasks.filter(t => t.isDeleted), [allTasks]);

    const getDefaultLayout = useCallback((): ColumnLayout[] => {
        return COLUMN_STATUSES.map((status, index) => ({
            id: status,
            x: index * (COLUMN_WIDTH + COLUMN_GAP),
            y: 0,
            zIndex: 10
        }));
    }, []);

    // FIX LOW-001: Memoize expensive calculation
    // Runs on activeTasks to feed the board
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
        if (!enableLoading) {
            setAllTasksState([]);
            setGoals([]);
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
                                goalId: task.goalId || undefined,
                                isPinned: task.isPinned || false,
                                focusOrder: task.focusOrder,
                                isDeleted: task.isDeleted || false // Ensure flag exists
                            };
                        });
                        loadedTasks = parsedTasks;
                    } catch (e) {
                        console.error("Failed to parse saved tasks", e);
                        loadedTasks = [];
                    }
                }
                setAllTasksState(loadedTasks);

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
                if (finalLayouts.length === 0) {
                    finalLayouts = getDefaultLayout();
                }
                setColumnLayouts(finalLayouts);

            } catch (err) {
                console.error(err);
                setError('Failed to load local data.');
                setAllTasksState([]);
                setGoals([]);
                setColumnLayouts(getDefaultLayout());
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [getDefaultLayout, enableLoading]);

    // Save ALL tasks (including deleted) to storage so deletion state persists
    useEffect(() => {
        if (!isLoading && enableLoading) {
            storage.set('tasks', JSON.stringify(allTasks));
            storage.set('goals', JSON.stringify(goals));
            storage.set('columnLayouts_v5', JSON.stringify(columnLayouts));
        }
    }, [allTasks, goals, columnLayouts, isLoading, enableLoading]);

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
        setAllTasksState(prev => [...prev, newTask]);
        return newTask;
    }, []);

    const updateTask = useCallback((updatedTask: Task) => {
        setAllTasksState(prev => {
            return prev.map(task =>
                task.id === updatedTask.id ? { ...updatedTask, lastModified: new Date().toISOString() } : task
            );
        });
    }, []);

    // SOFT DELETE: Mark as deleted instead of removing
    const deleteTask = useCallback((taskId: string) => {
        setAllTasksState(prev => prev.map(t => 
            t.id === taskId 
                ? { ...t, isDeleted: true, lastModified: new Date().toISOString() } 
                : t
        ));
    }, []);

    const restoreTask = useCallback((taskId: string) => {
        setAllTasksState(prev => prev.map(t => 
            t.id === taskId 
                ? { ...t, isDeleted: false, lastModified: new Date().toISOString() } 
                : t
        ));
    }, []);

    const permanentlyDeleteTask = useCallback((taskId: string) => {
        setAllTasksState(prev => prev.filter(t => t.id !== taskId));
    }, []);

    const emptyTrash = useCallback(() => {
        setAllTasksState(prev => prev.filter(t => !t.isDeleted));
    }, []);

    const moveTask = useCallback((taskId: string, newStatus: Status, newIndex: number) => {
        setAllTasksState(prev => {
            let taskToMove = prev.find(t => t.id === taskId);
            if (!taskToMove) return prev;
            
            // Create a copy to modify
            taskToMove = { ...taskToMove };

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

            // We only reorder within active tasks mentally, but in state we need to handle the array.
            // Simplified reorder: Remove and Insert.
            // Note: This naive reorder might put it at the end of the array if we aren't careful, 
            // but for a flat list, index management is tricky without a sort order field.
            // For now, we append to the list to update properties, as the UI sorts by itself usually.
            // To strictly support manual sort, we would need a 'order' field.
            
            return prev.map(t => t.id === taskId ? taskToMove : t);
        });
    }, []);
    
    const toggleTaskPin = useCallback((taskId: string) => {
        let result = { success: true, message: '' };
        
        setAllTasksState(prev => {
            const task = prev.find(t => t.id === taskId);
            if (!task) return prev;

            if (!task.isPinned) {
                const pinnedTasks = prev.filter(t => t.isPinned && !t.isDeleted);
                const maxOrder = pinnedTasks.reduce((max, t) => Math.max(max, t.focusOrder || 0), -1);
                
                let newStatus = task.status;
                if (task.status !== 'Blocker' && task.status !== 'Done') {
                    newStatus = 'In Progress';
                }

                return prev.map(t => 
                    t.id === taskId ? { 
                        ...t, 
                        isPinned: true, 
                        focusOrder: maxOrder + 1, 
                        status: newStatus,
                        lastModified: new Date().toISOString() 
                    } : t
                );
            }

            return prev.map(t => 
                t.id === taskId ? { ...t, isPinned: false, focusOrder: undefined, lastModified: new Date().toISOString() } : t
            );
        });
        
        return result;
    }, []);

    const reorderPinnedTasks = useCallback((activeTaskId: string, overTaskId: string) => {
        setAllTasksState(prev => {
            // Only consider Active Pinned tasks for reordering calculations
            const activePinned = prev.filter(t => t.isPinned && !t.isDeleted).sort((a, b) => {
                if (a.focusOrder !== undefined && b.focusOrder !== undefined) return a.focusOrder - b.focusOrder;
                return 0; 
            });

            const activeIndex = activePinned.findIndex(t => t.id === activeTaskId);
            const overIndex = activePinned.findIndex(t => t.id === overTaskId);

            if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return prev;

            const [moved] = activePinned.splice(activeIndex, 1);
            activePinned.splice(overIndex, 0, moved);

            const orderUpdates = new Map<string, number>();
            activePinned.forEach((t, index) => orderUpdates.set(t.id, index));

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
        setAllTasksState(prev => prev.map(t => t.goalId === goalId ? { ...t, goalId: undefined } : t));
    }, []);

    // Unified Setter for Sync: Receives ALL tasks (including deleted from remote)
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
            isDeleted: task.isDeleted || false // Ensure flag is set
        }));
        setAllTasksState(tasksWithDefaults);
        setGoals(newGoals);
    }, []);

    const getTasksByStatus = (status: Status, taskList: Task[] = processedTasks) => {
        return taskList.filter(task => task.status === status);
    };
    
    // Legacy support wrapper
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
        setAllTasksState(tasksWithDefaults);
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
        tasks: processedTasks, // UI gets Active tasks
        allTasks: allTasks,    // Sync gets All tasks (including deleted)
        deletedTasks,          // Trash UI gets Deleted tasks
        goals: processedGoals,
        columns: COLUMN_STATUSES,
        columnLayouts,
        addTask,
        updateTask,
        deleteTask,
        restoreTask,           // Exported
        permanentlyDeleteTask, // Exported
        emptyTrash,            // Exported
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
