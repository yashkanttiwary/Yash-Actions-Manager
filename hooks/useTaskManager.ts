
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

    // FIX LOW-001: Memoize expensive calculation
    const processedTasks = useMemo(() => {
        const taskMap = new Map<string, Task>(tasks.map(t => [t.id, t]));
        return tasks.map(task => {
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
    }, [tasks]);

    // Calculate Goal Progress automatically
    const processedGoals = useMemo(() => {
        return goals.map(goal => {
            const goalTasks = tasks.filter(t => t.goalId === goal.id);
            const total = goalTasks.length;
            const completed = goalTasks.filter(t => t.status === 'Done').length;
            const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
            return { ...goal, progress };
        });
    }, [goals, tasks]);

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

    const deleteTask = useCallback((taskId: string) => {
        // Ensure robust comparison by converting to string, in case IDs were parsed as numbers from JSON/Sheet
        setTasks(prevTasks => prevTasks.filter(task => String(task.id) !== String(taskId)));
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
            
            const tasksInNewColumn = tasksWithoutMoved.filter(t => t.status === newStatus);
            tasksInNewColumn.splice(newIndex, 0, taskToMove);

            const otherTasks = tasksWithoutMoved.filter(t => t.status !== newStatus);
            
            const reorderedTasks = [...otherTasks, ...tasksInNewColumn];
            return reorderedTasks;
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
                // Unlimited Pinning: No check for length >= 5.
                
                const pinnedTasks = prevTasks.filter(t => t.isPinned);
                // Assign a new order index at the end
                const maxOrder = pinnedTasks.reduce((max, t) => Math.max(max, t.focusOrder || 0), -1);
                
                // ACTION: Move to 'In Progress' if not Blocked or Done
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
            // Filter and Sort existing pinned tasks
            // We use focusOrder if available, otherwise prioritize by priority/dueDate for initial sort
            const pinned = prev.filter(t => t.isPinned).sort((a, b) => {
                if (a.focusOrder !== undefined && b.focusOrder !== undefined) return a.focusOrder - b.focusOrder;
                // Fallback for migration or mixed state: Priority then ID
                return 0; 
            });

            const activeIndex = pinned.findIndex(t => t.id === activeTaskId);
            const overIndex = pinned.findIndex(t => t.id === overTaskId);

            if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return prev;

            // Move
            const [moved] = pinned.splice(activeIndex, 1);
            pinned.splice(overIndex, 0, moved);

            // Create update map with new indices
            const orderUpdates = new Map<string, number>();
            pinned.forEach((t, index) => orderUpdates.set(t.id, index));

            // Apply updates to main state
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
        return id; // Return the ID so the caller can use it
    }, []);

    const updateGoal = useCallback((updatedGoal: Goal) => {
        setGoals(prev => prev.map(g => g.id === updatedGoal.id ? updatedGoal : g));
    }, []);

    const deleteGoal = useCallback((goalId: string) => {
        setGoals(prev => prev.filter(g => g.id !== goalId));
        // Optional: Remove goalId from tasks? Or let them stay orphaned or auto-unassign?
        // Let's auto-unassign to be safe
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
            isPinned: task.isPinned || false, // Ensure isPinned is carried over
            focusOrder: task.focusOrder, // Ensure order is carried
        }));
        setTasks(tasksWithDefaults);
        setGoals(newGoals);
    }, []);

    const getTasksByStatus = (status: Status, taskList: Task[] = processedTasks) => {
        return taskList.filter(task => task.status === status);
    };
    
    const setAllTasks = useCallback((newTasks: Task[]) => {
        // Legacy support wrapper, assumes no goal changes
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
        goals: processedGoals,
        columns: COLUMN_STATUSES,
        columnLayouts,
        addTask,
        updateTask,
        deleteTask,
        moveTask,
        toggleTaskPin, // Exported logic
        reorderPinnedTasks, // Exported logic
        getTasksByStatus,
        setAllTasks,
        setAllData, // New unified setter
        addGoal,
        updateGoal,
        deleteGoal,
        updateColumnLayout,
        resetColumnLayouts,
        isLoading,
        error
    };
};
