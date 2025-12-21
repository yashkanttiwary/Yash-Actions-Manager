
import { Task, Status, Priority } from '../types';

/**
 * LOGIC SPECIFICATION:
 * 1. Data Mapping:
 *    - Row 1: Headers
 *    - Columns: ID, Title, Status, Priority, Due Date, Time Est, Actual Time, Tags, Scheduled Start, Blockers, Dependencies, Subtasks, Description, Last Modified, JSON_DATA
 * 2. Sync Logic:
 *    - checkSheetLastModified(): Low-cost poll to Drive API.
 *    - fetchFromSheet(): Reads all rows, maps to Task objects.
 *    - pushToSheet(): Overwrites entire sheet (safest for data consistency vs row-drift).
 */

const SPREADSHEET_HEADERS = [
    'ID', 'Title', 'Status', 'Priority', 'Due Date', 'Time Est (h)', 'Actual Time (s)', 'Tags', 'Scheduled Start', 'Blockers', 'Dependencies', 'Subtasks', 'Description', 'Last Modified', 'JSON_DATA'
];

// Helper to strictly safeguard against null/undefined values shifting the array
const safeString = (val: any) => (val === null || val === undefined) ? '' : String(val);
const safeNumber = (val: any) => (val === null || val === undefined || isNaN(Number(val))) ? 0 : Number(val);

// Helper to convert Task to Row Array
const taskToRow = (task: Task): any[] => {
    // Format complex objects for readability in sheet cells
    const blockersStr = task.blockers?.filter(b => !b.resolved).map(b => b.reason).join('; ') || '';
    const depsStr = task.dependencies?.join(', ') || '';
    
    // Format subtasks as a checklist string
    const subtasksStr = task.subtasks?.map(s => `${s.isCompleted ? '[x]' : '[ ]'} ${s.title}`).join('\n') || '';

    // STRICT ORDER: 15 Columns matching SPREADSHEET_HEADERS
    return [
        safeString(task.id),                                // 0: ID
        safeString(task.title),                             // 1: Title
        safeString(task.status),                            // 2: Status
        safeString(task.priority),                          // 3: Priority
        safeString(task.dueDate),                           // 4: Due Date
        safeNumber(task.timeEstimate),                      // 5: Time Est
        safeNumber(task.actualTimeSpent),                   // 6: Actual Time
        safeString(task.tags?.join(', ')),                  // 7: Tags
        safeString(task.scheduledStartDateTime),            // 8: Scheduled Start
        safeString(blockersStr),                            // 9: Blockers
        safeString(depsStr),                                // 10: Dependencies
        safeString(subtasksStr),                            // 11: Subtasks
        safeString(task.description),                       // 12: Description
        safeString(task.lastModified),                      // 13: Last Modified
        JSON.stringify(task) || ''                          // 14: JSON_DATA
    ];
};

// Helper to convert Row Array to Task
const rowToTask = (row: any[]): Task | null => {
    if (!row || row.length < 1) return null;
    
    // Indices based on SPREADSHEET_HEADERS:
    // 0: ID, 1: Title, 2: Status, 3: Priority, 4: DueDate, 5: TimeEst, 6: ActualTime, 
    // 7: Tags, 8: Scheduled, 9: Blockers, 10: Deps, 11: Subtasks, 12: Desc, 13: LastMod, 14: JSON
    
    const jsonColIndex = 14;

    // If we have the JSON backup column, prefer that for fidelity
    if (row[jsonColIndex]) {
        try {
            const parsed = JSON.parse(row[jsonColIndex]);
            
            // Overwrite JSON data with specific column values if they exist (allows manual sheet edits)
            if (row[1]) parsed.title = row[1];
            if (row[2] && ['To Do', 'In Progress', 'Review', 'Blocker', 'Hold', "Won't Complete", 'Done'].includes(row[2])) {
                parsed.status = row[2];
            }
            if (row[3]) parsed.priority = row[3];
            if (row[4]) parsed.dueDate = row[4];
            if (row[5] !== undefined && row[5] !== '') parsed.timeEstimate = Number(row[5]);
            // We typically trust the JSON for actualTime (row[6]) unless manually edited, which is rare.
            // Tags (row[7])
            if (typeof row[7] === 'string') {
                parsed.tags = row[7].split(',').map((t: string) => t.trim()).filter(Boolean);
            }
            // Scheduled Start (row[8])
            if (row[8]) parsed.scheduledStartDateTime = row[8];
            
            // Description (row[12])
            if (row[12] !== undefined) parsed.description = row[12];

            // Last Modified (row[13]) - Critical for conflict resolution
            if (row[13] && new Date(row[13]).getTime() > new Date(parsed.lastModified).getTime()) {
                parsed.lastModified = row[13];
            }
            
            return parsed;
        } catch (e) {
            console.warn("Failed to parse JSON column, falling back to cell data", e);
        }
    }

    // Fallback: Construct entirely from cells if JSON is missing/corrupt
    
    // Safety Guard: Check if the blocker column (index 9) accidentally contains the JSON backup data.
    // This happens if the sheet layout is from an older version (10 columns) where JSON was at index 9.
    const rawBlocker = row[9];
    const isLikelyJson = typeof rawBlocker === 'string' && rawBlocker.trim().startsWith('{') && rawBlocker.trim().endsWith('}');

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
        // We cannot easily reconstruct complex Blockers/Subtasks objects from simple strings without IDs.
        // We will initialize them empty or with basic data if creating from raw row.
        blockers: (rawBlocker && !isLikelyJson) ? [{ id: 'restored-'+Date.now(), reason: rawBlocker, createdDate: new Date().toISOString(), resolved: false }] : [],
        dependencies: row[10] ? row[10].split(',').map((s: string) => s.trim()) : [],
        subtasks: [], // Hard to parse back from string representation perfectly
        description: row[12] || '',
        lastModified: row[13] || new Date().toISOString(),
        createdDate: new Date().toISOString(),
        statusChangeDate: new Date().toISOString(),
        xpAwarded: false
    };
};

// --- GAPI METHOD (REQUIRES CLIENT ID) ---

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
        // Read first row to check if it matches our expected headers
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: 'Sheet1!A1:O1' 
        });

        const values = response.result.values;
        // If empty or length doesn't match our current schema (15 columns), overwrite headers
        if (!values || values.length === 0 || values[0].length !== SPREADSHEET_HEADERS.length) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: 'Sheet1!A1:O1',
                valueInputOption: 'RAW',
                resource: {
                    values: [SPREADSHEET_HEADERS]
                }
            });
            console.log("Initialized/Updated Sheet Headers");
        }
    } catch (error) {
        console.error("Error initializing sheet:", error);
        throw error;
    }
};

export const syncTasksToSheet = async (sheetId: string, tasks: Task[]) => {
    try {
        const rows = tasks.map(taskToRow);
        const dataWithHeaders = [SPREADSHEET_HEADERS, ...rows];
        
        // Step 1: Clear existing data entirely to remove ghost rows/columns
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: sheetId,
            range: 'Sheet1', // Clear the whole sheet content
        });
        
        // Step 2: Write Headers AND Data starting at A1
        // This forces alignment of columns.
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: 'Sheet1!A1', 
            valueInputOption: 'RAW',
            resource: {
                values: dataWithHeaders
            }
        });
        
    } catch (error) {
        console.error("Error writing to sheet:", error);
        throw error;
    }
};

export const syncTasksFromSheet = async (sheetId: string): Promise<Task[]> => {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: 'Sheet1!A2:O'
        });
        
        const rows = response.result.values;
        if (!rows || rows.length === 0) return [];
        
        const tasks: Task[] = [];
        rows.forEach((row: any[]) => {
            const task = rowToTask(row);
            if (task) tasks.push(task);
        });
        
        return tasks;
    } catch (error) {
        console.error("Error reading from sheet:", error);
        throw error;
    }
};


// --- APPS SCRIPT METHOD (NO CLIENT ID REQUIRED) ---

export const testAppsScriptConnection = async (url: string): Promise<boolean> => {
    try {
        // Send a ping action
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ action: 'check' }),
             // No-cors mode is not used here because we need to read the response. 
             // The Apps Script must return valid JSON with CORS headers.
        });
        const data = await response.json();
        return data.status === 'ok' || data.status === 'success';
    } catch (error) {
        console.error("Apps Script test failed:", error);
        return false;
    }
};

export const syncTasksToAppsScript = async (url: string, tasks: Task[]) => {
    try {
        const rows = tasks.map(taskToRow);
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

export const syncTasksFromAppsScript = async (url: string): Promise<Task[]> => {
    try {
        // Cache-busting: Add timestamp to prevent browser from serving old JSON
        const timestamp = Date.now();
        const separator = url.includes('?') ? '&' : '?';
        const fetchUrl = `${url}${separator}action=sync_down&t=${timestamp}`;

        const response = await fetch(fetchUrl); 
        const rows = await response.json();
        
        if (!Array.isArray(rows) || rows.length === 0) return [];
        
        const tasks: Task[] = [];
        // Rows from Apps Script likely include the header if using getDataRange().getValues()
        // We assume the script handles removing headers, or we check here.
        rows.forEach((row: any[]) => {
            // Basic validation to check if it's a header row (ID column check)
            if (row[0] === 'ID') return;
            
            const task = rowToTask(row);
            if (task) tasks.push(task);
        });
        
        return tasks;
    } catch (error) {
        console.error("Error reading from Apps Script:", error);
        throw error;
    }
};
