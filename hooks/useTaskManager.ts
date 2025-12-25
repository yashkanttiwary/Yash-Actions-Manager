
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Task, Status, ColumnLayout } from '../types';
import { COLUMN_STATUSES } from '../constants';
import { storage } from '../utils/storage';

const COLUMN_WIDTH = 320; // Corresponds to w-80
const COLUMN_GAP = 24; // Increased gap for better visual separation

export const useTaskManager = (enableLoading: boolean = true) => {
    const [tasks, setTasks] = useState<Task[]>([]);
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

    useEffect(() => {
        // Strict Guard: If loading is not enabled (i.e. not connected), do nothing.
        // However, we MUST ensure layouts are initialized if we are going to show anything later.
        if (!enableLoading) {
            setTasks([]); 
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
                            };
                        });
                        loadedTasks = parsedTasks;
                    } catch (e) {
                        console.error("Failed to parse saved tasks", e);
                        loadedTasks = [];
                    }
                }
                setTasks(loadedTasks);

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
            storage.set('columnLayouts_v5', JSON.stringify(columnLayouts));
        }
    }, [tasks, columnLayouts, isLoading, enableLoading]);

    // TYPE FIX: Added statusChangeDate to omitted fields, allowing optional property in input
    const addTask = useCallback((taskData: Omit<Task, 'id' | 'createdDate' | 'lastModified' | 'statusChangeDate'> & { statusChangeDate?: string }) => {
        const now = new Date().toISOString();
        const newTask: Task = {
            id: `task-${Date.now()}-${Math.random()}`,
            createdDate: now,
            lastModified: now,
            priority: 'Medium',
            tags: [],
            subtasks: [],
            statusChangeDate: now,
            actualTimeSpent: 0,
            xpAwarded: false,
            dependencies: [],
            blockers: [],
            currentSessionStartTime: null,
            ...taskData,
        };
        setTasks(prevTasks => [...prevTasks, newTask]);
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
        columns: COLUMN_STATUSES,
        columnLayouts,
        addTask,
        updateTask,
        deleteTask,
        moveTask,
        getTasksByStatus,
        setAllTasks,
        updateColumnLayout,
        resetColumnLayouts,
        isLoading,
        error
    };
};
