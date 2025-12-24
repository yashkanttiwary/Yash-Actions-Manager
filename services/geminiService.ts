
import { GoogleGenAI, Type } from "@google/genai";
import { Task } from '../types';
import { getEnvVar } from '../utils/env';

// Create a local shim for process.env to satisfy the initialization pattern
// utilizing the centralized safe accessor
const process = {
    env: {
        API_KEY: getEnvVar('VITE_GEMINI_API_KEY')
    }
};

// Check for API Key immediately
const hasApiKey = !!process.env.API_KEY && process.env.API_KEY !== 'undefined';

// The API key must be obtained exclusively from the environment variable process.env.API_KEY.
// We only initialize if the key exists to avoid immediate errors, but we handle missing keys in the methods.
const ai = hasApiKey ? new GoogleGenAI({ apiKey: process.env.API_KEY }) : null;

const responseSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            id: { type: Type.STRING, description: "Unique identifier for the task." },
            title: { type: Type.STRING, description: "The title of the task." },
            description: { type: Type.STRING, description: "A detailed description of the task." },
            status: { type: Type.STRING, description: "Current status. Must be one of: To Do, In Progress, Review, Blocker, Hold, Won't Complete, Done." },
            priority: { type: Type.STRING, description: "Priority level. Must be one of: Critical, High, Medium, Low." },
            dueDate: { type: Type.STRING, description: "Due date in ISO 8601 format (YYYY-MM-DD)." },
            tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of tags for categorization." },
            assignedTo: { type: Type.STRING, description: "Person assigned to the task." },
            timeEstimate: { type: Type.NUMBER, description: "Estimated time to complete in hours." },
            blockerReason: { type: Type.STRING, description: "Reason if the task status is 'Blocker'." },
            createdDate: { type: Type.STRING, description: "Creation date in ISO format." },
            lastModified: { type: Type.STRING, description: "Last modification date in ISO format." },
            statusChangeDate: { type: Type.STRING, description: "The date the status was last changed, in ISO format." },
            actualTimeSpent: { type: Type.NUMBER, description: "Actual time spent on the task in seconds." },
            xpAwarded: { type: Type.BOOLEAN, description: "Whether XP has been awarded for completing this task. Should be set to true only on the first time a task is marked 'Done'." },
            scheduledStartDateTime: { type: Type.STRING, description: "Scheduled start date and time in full ISO 8601 format. Used for calendar view." },
            subtasks: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.STRING, description: "Unique identifier for the subtask." },
                        title: { type: Type.STRING, description: "The title of the subtask." },
                        isCompleted: { type: Type.BOOLEAN, description: "Whether the subtask is completed." },
                    },
                    required: ['id', 'title', 'isCompleted'],
                },
                description: "A list of sub-tasks."
            },
        },
        required: ['id', 'title', 'status', 'priority', 'createdDate', 'lastModified', 'dueDate', 'statusChangeDate']
    },
};

const systemInstruction = `You are an intelligent task management assistant for an ADHD user.
- Your primary function is to manage a list of tasks provided in JSON format.
- When given a user command and a JSON object of the current tasks, you must return the COMPLETE, UPDATED list of all tasks as a valid JSON array that conforms to the provided schema.
- NEVER respond with conversational text, only the JSON array. Your entire response must be the JSON.
- CRITICAL DATE INSTRUCTION: The current date will be provided at the beginning of every prompt. You MUST use this date as the reference for all relative date calculations (e.g., 'tomorrow', 'next week').
- When adding a new task: create a short, random, unique ID (e.g., 'task-xyz123'), set createdDate, lastModified, and statusChangeDate to the current ISO string, and ALWAYS add a dueDate. If not specified, default to one week from the provided current date. Set actualTimeSpent to 0 and xpAwarded to false.
- When updating an existing task: always update the lastModified field to the current ISO string.
- If a task's status is changed, you MUST update the statusChangeDate to the current ISO string.
- If a task's status changes to 'Done' for the very first time, you MUST set xpAwarded to true. If it was already true, it should remain true.
- Tasks can have subtasks. When a user asks to add subtasks, add them to the 'subtasks' array of the correct parent task.
- When adding a new subtask, give it a unique ID (e.g., 'sub-abc456'), its title, and set 'isCompleted' to false.
- When a user asks to complete a subtask, find it and set 'isCompleted' to true.
- Be robust in interpreting dates from natural language (e.g., 'tomorrow', 'next Friday at 5pm', 'end of the month', 'August 15th'). Always resolve them to a strict 'YYYY-MM-DD' format for the 'dueDate' field based on the provided current date.
- Keep descriptions concise unless specified otherwise.
- Be encouraging and positive in the task descriptions if you add them.
- If a user wants to add a blocker, ensure the status is 'Blocker' and blockerReason has content.
- If a user removes a blocker, clear the blockerReason and move the task to 'In Progress' unless specified otherwise.
`;

const summarySystemInstruction = `You are an intelligent task management assistant for an ADHD user. Your goal is to provide a clear, concise, and motivating summary of the user's current tasks. The user will provide their task list as a JSON string. Based on this, you must generate a summary that includes:
1.  **Lagging Tasks:** Identify tasks that are overdue or approaching their due date (due today or tomorrow) and are not 'Done'. Mention them specifically. Use a heading like "## ⚠️ Lagging Tasks".
2.  **Progress Overview:** Give a brief summary of how many tasks are in each stage (To Do, In Progress, Done, etc.). Use a heading like "## 📊 Progress Overview".
3.  **Current Focus:** List the tasks currently in the 'In Progress' status. Use a heading like "## 🚀 Current Focus".
4.  **On Hold:** List any tasks that are 'On Hold'. If there are none, say so. Use a heading like "## ⏸️ On Hold".
5.  **Prioritization Advice:** Based on priorities and due dates, give actionable advice on what to focus on next. Be encouraging and direct. Use a heading like "## ✨ What's Next?".

Your response should be friendly, easy to read, and formatted using simple markdown:
- Use '##' for main headings.
- Use '*' for bullet points.
- Use '**text**' for bold text.
- Do NOT return JSON, only the formatted text summary.
`;

const backfillNewFields = (task: any): Task => {
    return {
        ...task,
        tags: task.tags || [],
        subtasks: task.subtasks || [],
        statusChangeDate: task.statusChangeDate || task.lastModified || new Date().toISOString(),
        actualTimeSpent: task.actualTimeSpent || 0,
        xpAwarded: task.xpAwarded || task.status === 'Done',
        scheduledStartDateTime: task.scheduledStartDateTime
    };
};

export const generateInitialTasks = async (): Promise<Task[]> => {
    if (!ai) throw new Error("Gemini API Key is missing. Please check your environment variables (VITE_GEMINI_API_KEY).");
    try {
        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const prompt = `Current Date: ${currentDate}\n\nGenerate 5 diverse example tasks for a software developer using this kanban board for the first time. Include different priorities, statuses, and a due date for every single task. One task should be due tomorrow. Add a few subtasks to at least two of the main tasks.`;
        
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: responseSchema,
          },
        });

        const jsonText = response.text;
        const tasks = JSON.parse(jsonText);
        return tasks.map(backfillNewFields);
    } catch (error) {
        console.error("Error generating initial tasks:", error);
        throw new Error("Failed to connect with the AI to generate tasks.");
    }
};

export const manageTasksWithAI = async (command: string, currentTasks: Task[]): Promise<Task[]> => {
    if (!ai) throw new Error("Gemini API Key is missing. Please configuration your environment.");
    try {
        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const prompt = `Current Date: ${currentDate}\n\nUser command: "${command}"\n\nCurrent tasks state:\n${JSON.stringify(currentTasks, null, 2)}`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });
        
        const jsonText = response.text.trim();
        const updatedTasks = JSON.parse(jsonText);
        return updatedTasks.map(backfillNewFields);

    } catch (error: any) {
        console.error("Error managing tasks with AI:", error);
        if (error.message && error.message.includes("API_KEY")) {
             throw new Error("Invalid or missing API Key.");
        }
        throw new Error("The AI assistant had trouble understanding that. Please try rephrasing your command.");
    }
};

export const generateTaskSummary = async (currentTasks: Task[]): Promise<string> => {
    if (!ai) throw new Error("Gemini API Key is missing. The AI assistant cannot function without it.");
    try {
        const prompt = `Here is the current list of tasks:\n${JSON.stringify(currentTasks, null, 2)}`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction: summarySystemInstruction,
            },
        });
        
        return response.text.trim();

    } catch (error: any) {
        console.error("Error generating task summary with AI:", error);
        if (error.message && error.message.includes("API_KEY")) {
             throw new Error("Invalid or missing API Key.");
        }
        throw new Error("The AI assistant had trouble generating a summary. Please try again later.");
    }
};
