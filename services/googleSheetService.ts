
import { Task, Status, Priority, Goal } from '../types';

// Standard Headers
const TASK_HEADERS = [
    'ID', 'Title', 'Status', 'Priority', 'Due Date', 'Time Est (h)', 'Actual Time (s)', 'Tags', 'Scheduled Start', 'Blockers', 'Dependencies', 'Subtasks', 'Description', 'Last Modified', 'Goal ID', 'Goal Title', 'JSON_DATA'
];

const GOAL_HEADERS = [
    'ID', 'Title', 'Color', 'Description', 'Created Date', 'Text Color'
];

const METADATA_ROW_ID = '__METADATA__';

// Helper to strictly safeguard against null/undefined values
const safeString = (val: any) => (val === null || val === undefined) ? '' : String(val);
const safeNumber = (val: any) => (val === null || val === undefined || isNaN(Number(val))) ? 0 : Number(val);

// Map column name to index
const getHeaderMap = (headerRow: any[]): Map<string, number> => {
    const map = new Map<string, number>();
    headerRow.forEach((cell, index) => {
        if (cell) map.set(String(cell).trim(), index);
    });
    return map;
};

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

const rowToTask = (row: any[], headerMap?: Map<string, number>): Task | null => {
    if (!row || row.length < 1) return null;
    
    // Check for Metadata row
    if (row[0] === METADATA_ROW_ID) return null;

    // Use dynamic index if available, else default to 16
    let jsonColIndex = 16;
    if (headerMap && headerMap.has('JSON_DATA')) {
        jsonColIndex = headerMap.get('JSON_DATA')!;
    }
    
    if (row[jsonColIndex]) {
        try {
            const parsed = JSON.parse(row[jsonColIndex]);
            
            // Migration: Check if status is "Won't Complete" and normalize to "Won't Do"
            if (parsed.status === "Won't Complete") {
                parsed.status = "Won't Do";
            }
            
            return parsed;
        } catch (e) {
            console.warn("Failed to parse JSON column", e);
        }
    }

    // Fallback: Legacy/Manual row parsing
    // NOTE: This assumes standard column order if JSON fails.
    // If the user moved columns AND corrupted JSON, this might fail, but that's an edge case.
    const rawBlocker = row[9];
    const isLikelyJson = typeof rawBlocker === 'string' && rawBlocker.trim().startsWith('{');
    
    let status = (row[2] as Status) || 'To Do';
    if (status === "Won't Complete" as any) {
        status = "Won't Do";
    }

    return {
        id: row[0],
        title: row[1] || 'Untitled Task',
        status: status,
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
            range: 'Sheet1!A1:Q' // START FROM A1 to get headers!
        });
        
        const allRows = tasksResponse.result.values;
        const tasks: Task[] = [];
        let metadata: any = null;

        if (allRows && allRows.length > 0) {
            // Extract headers
            const headerRow = allRows[0];
            const headerMap = getHeaderMap(headerRow);
            const dataRows = allRows.slice(1);

            dataRows.forEach((row: any[]) => {
                if (row[0] === METADATA_ROW_ID) {
                    try {
                        // Check index for metadata JSON based on map or default
                        const jsonIdx = headerMap.has('JSON_DATA') ? headerMap.get('JSON_DATA')! : 16;
                        if (row[jsonIdx]) metadata = JSON.parse(row[jsonIdx]);
                    } catch (e) { console.error("Failed to parse metadata", e); }
                } else {
                    const task = rowToTask(row, headerMap);
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
        
        if (data.status === 'error') {
            throw new Error(data.message || 'Script error');
        }
        
        const taskRows = data.tasks || [];
        const goalRows = data.goals || [];
        
        const tasks: Task[] = [];
        const goals: Goal[] = [];
        let metadata: any = null;

        // Apps Script returns values array. If it has headers, we should map them.
        // The script returns `taskSheet.getDataRange().getValues()`.
        // If row 0 is headers, map them.
        
        if (Array.isArray(taskRows) && taskRows.length > 0) {
            // Check if first row is header
            const firstRow = taskRows[0];
            let startIdx = 0;
            let headerMap = new Map<string, number>();
            
            if (firstRow[0] === 'ID' || firstRow[0] === 'Title') {
                headerMap = getHeaderMap(firstRow);
                startIdx = 1; // Skip header
            }

            for (let i = startIdx; i < taskRows.length; i++) {
                const row = taskRows[i];
                if (row[0] === 'ID') continue; // Extra safety
                
                if (row[0] === METADATA_ROW_ID) {
                    try {
                        const jsonIdx = headerMap.has('JSON_DATA') ? headerMap.get('JSON_DATA')! : 16;
                        if (row[jsonIdx]) metadata = JSON.parse(row[jsonIdx]);
                    } catch (e) { console.error("Failed to parse metadata", e); }
                } else {
                    const task = rowToTask(row, headerMap);
                    if (task) tasks.push(task);
                }
            }
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
