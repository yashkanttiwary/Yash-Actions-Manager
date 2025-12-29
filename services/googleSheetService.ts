
import { Task, Status, Priority, Goal } from '../types';

// UPDATED HEADERS: Added 'Goal Title' at index 15
const TASK_HEADERS = [
    'ID', 'Title', 'Status', 'Priority', 'Due Date', 'Time Est (h)', 'Actual Time (s)', 'Tags', 'Scheduled Start', 'Blockers', 'Dependencies', 'Subtasks', 'Description', 'Last Modified', 'Goal ID', 'Goal Title', 'JSON_DATA'
];

// Added Text Color at index 5 (Column F)
const GOAL_HEADERS = [
    'ID', 'Title', 'Color', 'Description', 'Created Date', 'Text Color'
];

const METADATA_ROW_ID = '__METADATA__';

// Helper to strictly safeguard against null/undefined values
const safeString = (val: any) => (val === null || val === undefined) ? '' : String(val);
const safeNumber = (val: any) => (val === null || val === undefined || isNaN(Number(val))) ? 0 : Number(val);

// Updated to accept goals map for title lookup
const taskToRow = (task: Task, goalsMap?: Map<string, Goal>): any[] => {
    const blockersStr = task.blockers?.filter(b => !b.resolved).map(b => b.reason).join('; ') || '';
    const depsStr = task.dependencies?.join(', ') || '';
    const subtasksStr = task.subtasks?.map(s => `${s.isCompleted ? '[x]' : '[ ]'} ${s.title}`).join('\n') || '';
    
    // Lookup Goal Title - Default to 'Unassigned' if missing
    let goalTitle = 'Unassigned';
    if (task.goalId && goalsMap) {
        const foundGoal = goalsMap.get(task.goalId);
        if (foundGoal) {
            goalTitle = foundGoal.title;
        }
    }

    return [
        safeString(task.id),
        safeString(task.title),
        safeString(task.status),
        safeString(task.priority),
        safeString(task.dueDate),
        safeNumber(task.timeEstimate),
        safeNumber(task.actualTimeSpent),
        safeString(task.tags?.join(', ')),
        safeString(task.scheduledStartDateTime),
        safeString(blockersStr),
        safeString(depsStr),
        safeString(subtasksStr),
        safeString(task.description),
        safeString(task.lastModified),
        safeString(task.goalId), 
        safeString(goalTitle), // New Column 15: Goal Title (Defaults to Unassigned)
        JSON.stringify(task) || '' // Shifted to Index 16
    ];
};

const rowToTask = (row: any[]): Task | null => {
    if (!row || row.length < 1) return null;
    
    // Check for Metadata row
    if (row[0] === METADATA_ROW_ID) return null;

    // JSON is now at index 16 due to added Goal Title column
    const jsonColIndex = 16;
    
    if (row[jsonColIndex]) {
        try {
            const parsed = JSON.parse(row[jsonColIndex]);
            // Merge cell data over JSON to respect manual edits
            if (row[1]) parsed.title = row[1];
            if (row[2]) parsed.status = row[2];
            if (row[3]) parsed.priority = row[3];
            if (row[4]) parsed.dueDate = row[4];
            if (row[5] !== undefined && row[5] !== '') parsed.timeEstimate = Number(row[5]);
            if (row[8]) parsed.scheduledStartDateTime = row[8];
            if (row[12]) parsed.description = row[12];
            if (row[13] && new Date(row[13]).getTime() > new Date(parsed.lastModified).getTime()) {
                parsed.lastModified = row[13];
            }
            if (row[14]) parsed.goalId = row[14];
            return parsed;
        } catch (e) {
            console.warn("Failed to parse JSON column", e);
        }
    }

    // Fallback: Legacy/Manual row parsing
    // Note: This might need adjustment if using old sheet format, but JSON usually handles it.
    const rawBlocker = row[9];
    const isLikelyJson = typeof rawBlocker === 'string' && rawBlocker.trim().startsWith('{');

    return {
        id: row[0],
        title: row[1] || 'Untitled Task',
        status: (row[2] as Status) || 'To Do',
        priority: (row[3] as Priority) || 'Medium',
        dueDate: row[4] || new Date().toISOString().split('T')[0],
        timeEstimate: Number(row[5]) || 0,
        actualTimeSpent: Number(row[6]) || 0,
        tags: row[7] ? row[7].split(',').map((t: string) => t.trim()) : [],
        scheduledStartDateTime: row[8] || undefined,
        blockers: (rawBlocker && !isLikelyJson) ? [{ id: 'restored-'+Date.now(), reason: rawBlocker, createdDate: new Date().toISOString(), resolved: false }] : [],
        dependencies: row[10] ? row[10].split(',').map((s: string) => s.trim()) : [],
        subtasks: [],
        description: row[12] || '',
        lastModified: row[13] || new Date().toISOString(),
        createdDate: new Date().toISOString(),
        statusChangeDate: new Date().toISOString(),
        xpAwarded: false,
        goalId: row[14] || undefined
    };
};

const goalToRow = (goal: Goal): any[] => {
    return [
        safeString(goal.id),
        safeString(goal.title),
        safeString(goal.color),
        safeString(goal.description),
        safeString(goal.createdDate),
        safeString(goal.textColor) // Added
    ];
};

const rowToGoal = (row: any[]): Goal | null => {
    if (!row || row.length < 2) return null;
    return {
        id: row[0],
        title: row[1],
        color: row[2] || '#6366f1',
        description: row[3] || '',
        createdDate: row[4] || new Date().toISOString(),
        textColor: row[5] || undefined // Added
    };
};

const createMetadataRow = (metadata: any) => {
    return [
        METADATA_ROW_ID,
        'APP_METADATA_DO_NOT_DELETE', 
        'Done', 'Low', '', '', 0, '', '', '', '', '', '', '', '', '',
        JSON.stringify(metadata) // JSON Column shifted
    ];
};

export const checkSheetModifiedTime = async (sheetId: string): Promise<string | null> => {
    try {
        const response = await gapi.client.drive.files.get({
            fileId: sheetId,
            fields: 'modifiedTime'
        });
        return response.result.modifiedTime;
    } catch (error) {
        console.error("Error checking sheet modified time:", error);
        return null;
    }
};

export const initializeSheetHeaders = async (sheetId: string) => {
    try {
        // Init Sheet 1 (Tasks)
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: 'Sheet1!A1:Q1' // Extended range for new column
        });
        const values = response.result.values;
        if (!values || values.length === 0 || values[0].length < TASK_HEADERS.length) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: 'Sheet1!A1:Q1',
                valueInputOption: 'RAW',
                resource: { values: [TASK_HEADERS] }
            });
        }
    } catch (error) {
        console.error("Error initializing sheet:", error);
        throw error;
    }
};

// --- SYNC WITH METADATA SUPPORT ---

export const syncDataToSheet = async (sheetId: string, tasks: Task[], goals: Goal[], metadata?: any) => {
    try {
        const goalsMap = new Map(goals.map(g => [g.id, g]));

        // 1. Prepare Tasks
        const taskRows = tasks.map(t => taskToRow(t, goalsMap));
        if (metadata) {
            taskRows.unshift(createMetadataRow(metadata));
        }
        const tasksData = [TASK_HEADERS, ...taskRows];
        
        // 2. Prepare Goals
        const goalRows = goals.map(goalToRow);
        const goalsData = [GOAL_HEADERS, ...goalRows];

        // 3. Write Tasks
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: 'Sheet1!A1', 
            valueInputOption: 'RAW',
            resource: { values: tasksData }
        });
        
        // Clear excess tasks
        const nextTaskRow = tasksData.length + 1;
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: sheetId,
            range: `Sheet1!A${nextTaskRow}:Q`,
        });

        // 4. Write Goals (Attempt)
        try {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: 'Goals!A1',
                valueInputOption: 'RAW',
                resource: { values: goalsData }
            });
             // Clear excess goals
            const nextGoalRow = goalsData.length + 1;
            await gapi.client.sheets.spreadsheets.values.clear({
                spreadsheetId: sheetId,
                range: `Goals!A${nextGoalRow}:F`, // Extended to F for Text Color
            });
        } catch (e) {
            console.warn("Could not write to 'Goals' tab. It might not exist.", e);
        }

    } catch (error) {
        console.error("Error writing to sheet:", error);
        throw error;
    }
};

export const syncDataFromSheet = async (sheetId: string): Promise<{ tasks: Task[], goals: Goal[], metadata: any | null }> => {
    try {
        // Fetch Tasks (Updated Range for Q column)
        const tasksResponse = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: 'Sheet1!A2:Q'
        });
        
        const taskRows = tasksResponse.result.values;
        const tasks: Task[] = [];
        let metadata: any = null;

        if (taskRows && taskRows.length > 0) {
            taskRows.forEach((row: any[]) => {
                if (row[0] === METADATA_ROW_ID) {
                    try {
                        // Check index 16 for metadata JSON
                        if (row[16]) metadata = JSON.parse(row[16]);
                    } catch (e) { console.error("Failed to parse metadata", e); }
                } else {
                    const task = rowToTask(row);
                    if (task) tasks.push(task);
                }
            });
        }

        // Fetch Goals
        let goals: Goal[] = [];
        try {
            const goalsResponse = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: 'Goals!A2:F' // Extended to F
            });
            const goalRows = goalsResponse.result.values;
            if (goalRows && goalRows.length > 0) {
                goalRows.forEach((row: any[]) => {
                    const goal = rowToGoal(row);
                    if (goal) goals.push(goal);
                });
            }
        } catch (e) {
            console.warn("Could not read 'Goals' tab.");
        }
        
        return { tasks, goals, metadata };
    } catch (error) {
        console.error("Error reading from sheet:", error);
        throw error;
    }
};

// --- APPS SCRIPT SYNC ---

export const testAppsScriptConnection = async (url: string): Promise<boolean> => {
    try {
        const separator = url.includes('?') ? '&' : '?';
        const fetchUrl = `${url}${separator}action=check&t=${Date.now()}`;
        const response = await fetch(fetchUrl, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit' // Fix for "Failed to fetch" on some environments
        });
        if (!response.ok) return false;
        
        const data = await response.json();
        return data.status === 'ok';
    } catch (error) {
        // Suppress logging here as this is expected during input typing/testing
        return false;
    }
};

export const syncDataToAppsScript = async (url: string, tasks: Task[], goals: Goal[], metadata?: any) => {
    try {
        const goalsMap = new Map(goals.map(g => [g.id, g]));
        
        // Pass map to taskToRow
        const taskRows = tasks.map(t => taskToRow(t, goalsMap));
        
        if (metadata) {
            taskRows.unshift(createMetadataRow(metadata));
        }
        
        const goalRows = goals.map(goalToRow);

        await fetch(url, {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit', // Fix for "Failed to fetch"
            body: JSON.stringify({ 
                action: 'sync_up',
                rows: taskRows,
                goals: goalRows
            })
        });
    } catch (error) {
        // Let the hook handle the error logging
        throw error;
    }
};

export const syncDataFromAppsScript = async (url: string): Promise<{ tasks: Task[], goals: Goal[], metadata: any | null }> => {
    try {
        const timestamp = Date.now();
        const separator = url.includes('?') ? '&' : '?';
        const fetchUrl = `${url}${separator}action=sync_down&t=${timestamp}`;

        const response = await fetch(fetchUrl, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit' // Fix for "Failed to fetch"
        }); 
        
        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}`);
        }

        const data = await response.json();
        
        const taskRows = data.tasks || [];
        const goalRows = data.goals || [];
        
        const tasks: Task[] = [];
        const goals: Goal[] = [];
        let metadata: any = null;

        if (Array.isArray(taskRows)) {
            taskRows.forEach((row: any[]) => {
                if (row[0] === 'ID') return; // Header check
                
                if (row[0] === METADATA_ROW_ID) {
                    try {
                        if (row[16]) metadata = JSON.parse(row[16]);
                    } catch (e) { console.error("Failed to parse metadata", e); }
                } else {
                    const task = rowToTask(row);
                    if (task) tasks.push(task);
                }
            });
        }
        
        if (Array.isArray(goalRows)) {
            goalRows.forEach((row: any[]) => {
                if (row[0] === 'ID') return;
                const goal = rowToGoal(row);
                if (goal) goals.push(goal);
            });
        }
        
        return { tasks, goals, metadata };
    } catch (error) {
        // Let the hook handle the error logging
        throw error;
    }
};
