
import { Task, Status, Priority } from '../types';

const SPREADSHEET_HEADERS = [
    'ID', 'Title', 'Status', 'Priority', 'Due Date', 'Time Est (h)', 'Actual Time (s)', 'Tags', 'Scheduled Start', 'Blockers', 'Dependencies', 'Subtasks', 'Description', 'Last Modified', 'JSON_DATA'
];

const METADATA_ROW_ID = '__METADATA__';

// Helper to strictly safeguard against null/undefined values
const safeString = (val: any) => (val === null || val === undefined) ? '' : String(val);
const safeNumber = (val: any) => (val === null || val === undefined || isNaN(Number(val))) ? 0 : Number(val);

const taskToRow = (task: Task): any[] => {
    const blockersStr = task.blockers?.filter(b => !b.resolved).map(b => b.reason).join('; ') || '';
    const depsStr = task.dependencies?.join(', ') || '';
    const subtasksStr = task.subtasks?.map(s => `${s.isCompleted ? '[x]' : '[ ]'} ${s.title}`).join('\n') || '';

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
        JSON.stringify(task) || ''
    ];
};

const rowToTask = (row: any[]): Task | null => {
    if (!row || row.length < 1) return null;
    
    // Check for Metadata row
    if (row[0] === METADATA_ROW_ID) return null;

    const jsonColIndex = 14;
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
            return parsed;
        } catch (e) {
            console.warn("Failed to parse JSON column", e);
        }
    }

    // Fallback: Construct from cells
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
        xpAwarded: false
    };
};

const createMetadataRow = (metadata: any) => {
    return [
        METADATA_ROW_ID,
        'APP_METADATA_DO_NOT_DELETE', // Title
        'Done', // Status (to keep it clean)
        'Low', // Priority
        '', '', 0, '', '', '', '', '', 
        'Stores Gamification and Settings', // Description
        new Date().toISOString(),
        JSON.stringify(metadata) // JSON Column
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
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: 'Sheet1!A1:O1' 
        });
        const values = response.result.values;
        if (!values || values.length === 0 || values[0].length !== SPREADSHEET_HEADERS.length) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: 'Sheet1!A1:O1',
                valueInputOption: 'RAW',
                resource: { values: [SPREADSHEET_HEADERS] }
            });
        }
    } catch (error) {
        console.error("Error initializing sheet:", error);
        throw error;
    }
};

// --- SYNC WITH METADATA SUPPORT ---

export const syncDataToSheet = async (sheetId: string, tasks: Task[], metadata?: any) => {
    try {
        const rows = tasks.map(taskToRow);
        
        // Prepend Metadata Row
        if (metadata) {
            rows.unshift(createMetadataRow(metadata));
        }

        const dataWithHeaders = [SPREADSHEET_HEADERS, ...rows];
        
        // 1. Write Data
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: 'Sheet1!A1', 
            valueInputOption: 'RAW',
            resource: { values: dataWithHeaders }
        });

        // 2. Clear Excess
        const nextRow = dataWithHeaders.length + 1;
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: sheetId,
            range: `Sheet1!A${nextRow}:O`,
        });
    } catch (error) {
        console.error("Error writing to sheet:", error);
        throw error;
    }
};

export const syncDataFromSheet = async (sheetId: string): Promise<{ tasks: Task[], metadata: any | null }> => {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: 'Sheet1!A2:O'
        });
        
        const rows = response.result.values;
        if (!rows || rows.length === 0) return { tasks: [], metadata: null };
        
        const tasks: Task[] = [];
        let metadata: any = null;

        rows.forEach((row: any[]) => {
            if (row[0] === METADATA_ROW_ID) {
                // Parse Metadata
                try {
                    if (row[14]) metadata = JSON.parse(row[14]);
                } catch (e) { console.error("Failed to parse metadata", e); }
            } else {
                const task = rowToTask(row);
                if (task) tasks.push(task);
            }
        });
        
        return { tasks, metadata };
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
        const response = await fetch(fetchUrl);
        if (!response.ok) return false;
        
        const data = await response.json();
        return data.status === 'ok';
    } catch (error) {
        console.error("Apps Script test failed:", error);
        return false;
    }
};

export const syncDataToAppsScript = async (url: string, tasks: Task[], metadata?: any) => {
    try {
        const rows = tasks.map(taskToRow);
        if (metadata) {
            rows.unshift(createMetadataRow(metadata));
        }

        await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'sync_up',
                rows: rows 
            })
        });
    } catch (error) {
        console.error("Error writing to Apps Script:", error);
        throw error;
    }
};

export const syncDataFromAppsScript = async (url: string): Promise<{ tasks: Task[], metadata: any | null }> => {
    try {
        const timestamp = Date.now();
        const separator = url.includes('?') ? '&' : '?';
        const fetchUrl = `${url}${separator}action=sync_down&t=${timestamp}`;

        const response = await fetch(fetchUrl); 
        const rows = await response.json();
        
        if (!Array.isArray(rows) || rows.length === 0) return { tasks: [], metadata: null };
        
        const tasks: Task[] = [];
        let metadata: any = null;

        rows.forEach((row: any[]) => {
            if (row[0] === 'ID') return; // Header check
            
            if (row[0] === METADATA_ROW_ID) {
                try {
                    if (row[14]) metadata = JSON.parse(row[14]);
                } catch (e) { console.error("Failed to parse metadata", e); }
            } else {
                const task = rowToTask(row);
                if (task) tasks.push(task);
            }
        });
        
        return { tasks, metadata };
    } catch (error) {
        console.error("Error reading from Apps Script:", error);
        throw error;
    }
};

// Re-export legacy signatures for compatibility if needed (but we updated hooks)
export const syncTasksFromSheet = async (id: string) => (await syncDataFromSheet(id)).tasks;
export const syncTasksFromAppsScript = async (url: string) => (await syncDataFromAppsScript(url)).tasks;
