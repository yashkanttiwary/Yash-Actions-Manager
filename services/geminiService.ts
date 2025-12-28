
import { GoogleGenAI, Type } from "@google/genai";
import { Task, Subtask } from '../types';
import { getEnvVar } from '../utils/env';

// --- CONFIGURATION ---

export const AI_MODELS = {
    GOOGLE: "gemini-1.5-flash",
    OPENAI: "gpt-4o-mini"
};

// --- PROVIDER DETECTION ---

type AIProvider = 'google' | 'openai' | 'unknown';

const detectProvider = (apiKey: string): AIProvider => {
    if (apiKey.startsWith('AIza')) return 'google';
    if (apiKey.startsWith('sk-')) return 'openai'; // Standard OpenAI key prefix
    return 'unknown';
};

// --- SCHEMA DEFINITIONS ---

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
            xpAwarded: { type: Type.BOOLEAN, description: "Whether XP has been awarded for completing this task." },
            scheduledStartDateTime: { type: Type.STRING, description: "Scheduled start date and time in full ISO 8601 format." },
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

const subtaskSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING, description: "Actionable, small step." },
        },
        required: ['title']
    }
};

const parsedTaskSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        status: { type: Type.STRING, enum: ["To Do", "In Progress", "Review", "Blocker", "Hold", "Won't Complete", "Done"] },
        priority: { type: Type.STRING, enum: ["Critical", "High", "Medium", "Low"] },
        dueDate: { type: Type.STRING },
        scheduledStartDateTime: { type: Type.STRING },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        timeEstimate: { type: Type.NUMBER },
        blockerReason: { type: Type.STRING },
        subtasks: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    isCompleted: { type: Type.BOOLEAN }
                }
            }
        }
    },
    required: ['title', 'status', 'priority']
};

const SYSTEM_INSTRUCTION_TEXT = `You are an intelligent task management assistant for an ADHD user.
- Your primary function is to manage a list of tasks provided in JSON format.
- When given a user command and a JSON object of the current tasks, you must return the COMPLETE, UPDATED list of all tasks as a valid JSON array.
- CRITICAL: Return ONLY valid JSON. No markdown formatting (like \`\`\`json), no conversation.
- CRITICAL DATE INSTRUCTION: The current date will be provided. Use this as the reference for all relative dates (e.g., 'tomorrow').
- When adding a new task: create a short, unique ID (e.g., 'task-xyz123'), set createdDate, lastModified, and statusChangeDate to the current ISO string. ALWAYS add a dueDate. Default dueDate is 7 days from now. Set actualTimeSpent to 0.
- If a task's status is changed, update statusChangeDate.
- Tasks can have subtasks.
- Be robust in interpreting dates.
- If the user provides a task list, merge changes into it.`;

const SUMMARY_SYSTEM_INSTRUCTION = `You are an intelligent task management assistant. Provide a clear, motivating summary of the user's tasks.
Format using simple markdown:
- Use '##' for headings (e.g., ## ⚠️ Lagging Tasks, ## 🚀 Current Focus).
- Use '*' for bullet points.
- Use '**text**' for bold.
- Do NOT return JSON. Return formatted text only.`;

const BREAKDOWN_SYSTEM_INSTRUCTION = `You are an ADHD-friendly task deconstructor.
Take a task title and break it down into 3-5 small, immediate steps.
Return ONLY a JSON array of objects with a 'title' property.
Example: [{"title": "Step 1"}, {"title": "Step 2"}]`;

const PARSE_TASK_INSTRUCTION = `You are an intelligent task parser. 
Your job is to analyze the user's spoken command and extract a complete, structured task object.

Extract the following fields if present or inferable:
1. **Title**: The main action or subject.
2. **Description**: Any extra details, context, or notes mentioned.
3. **Status**: The target board column (To Do, In Progress, Review, Blocker, Hold, Won't Complete, Done). Default to "To Do" if unclear.
4. **Priority**: Critical, High, Medium, or Low.
5. **Tags**: Keywords or categories (e.g., "Work", "Personal").
6. **Due Date**: ISO Date string. Infer from "tomorrow", "next friday", etc. relative to Current Date.
7. **Time Estimate**: Number of hours (e.g., "takes 2 hours").
8. **Scheduled Start**: ISO Datetime if a specific time is mentioned (e.g., "schedule for 2pm").
9. **Blocker Reason**: If the user mentions "blocked by" or "waiting for", put the reason here and set Status to "Blocker".
10. **Subtasks**: List of smaller steps if the user breaks it down.

Return ONLY valid JSON matching the schema.`;

// --- HELPER FUNCTIONS ---

const getApiKey = (userApiKey?: string): string => {
    const envKey = getEnvVar('VITE_GEMINI_API_KEY');
    const finalKey = userApiKey || envKey;
    if (!finalKey || finalKey === 'undefined') throw new Error("API Key is missing.");
    return finalKey;
};

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

// --- GOOGLE IMPLEMENTATION ---

const callGoogleAI = async (apiKey: string, model: string, systemPrompt: string, userPrompt: string, schema?: any, isJsonMode: boolean = false): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey });
    const config: any = {
        systemInstruction: systemPrompt,
    };
    
    if (isJsonMode) {
        config.responseMimeType = "application/json";
        if (schema) config.responseSchema = schema;
    }

    const response = await ai.models.generateContent({
        model: model,
        contents: userPrompt,
        config: config
    });
    
    return response.text || "";
};

// --- OPENAI IMPLEMENTATION (FETCH) ---

const callOpenAI = async (apiKey: string, model: string, systemPrompt: string, userPrompt: string, isJsonMode: boolean = false): Promise<string> => {
    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];

    const body: any = {
        model: model,
        messages: messages,
    };

    if (isJsonMode) {
        body.response_format = { type: "json_object" };
        // OpenAI requires the word "JSON" in the system prompt for JSON mode
        if (!systemPrompt.includes("JSON")) {
            messages[0].content += " You must respond with valid JSON.";
        }
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "OpenAI API Error");
    }

    const data = await response.json();
    return data.choices[0].message.content;
};

// --- MAIN PUBLIC METHODS ---

const executeAIRequest = async (userApiKey: string | undefined, type: 'manage' | 'summary' | 'breakdown' | 'parse', payload: any) => {
    const apiKey = getApiKey(userApiKey);
    const provider = detectProvider(apiKey);
    const currentDate = new Date().toISOString();

    let resultText: string | undefined = "";

    try {
        if (provider === 'google') {
            if (type === 'manage') {
                const prompt = `Current Date: ${currentDate}\n\nUser command: "${payload.command}"\n\nCurrent tasks state:\n${JSON.stringify(payload.currentTasks, null, 2)}`;
                resultText = await callGoogleAI(apiKey, AI_MODELS.GOOGLE, SYSTEM_INSTRUCTION_TEXT, prompt, responseSchema, true);
            } else if (type === 'summary') {
                const prompt = `Here is the current list of tasks:\n${JSON.stringify(payload.currentTasks, null, 2)}`;
                resultText = await callGoogleAI(apiKey, AI_MODELS.GOOGLE, SUMMARY_SYSTEM_INSTRUCTION, prompt);
            } else if (type === 'breakdown') {
                const prompt = `Task to break down: "${payload.taskTitle}"`;
                resultText = await callGoogleAI(apiKey, AI_MODELS.GOOGLE, BREAKDOWN_SYSTEM_INSTRUCTION, prompt, subtaskSchema, true);
            } else if (type === 'parse') {
                const prompt = `Current Date: ${currentDate}\n\nTranscript: "${payload.transcript}"`;
                resultText = await callGoogleAI(apiKey, AI_MODELS.GOOGLE, PARSE_TASK_INSTRUCTION, prompt, parsedTaskSchema, true);
            }
        } 
        else if (provider === 'openai') {
            if (type === 'manage') {
                const prompt = `Current Date: ${currentDate}\n\nUser command: "${payload.command}"\n\nCurrent tasks state:\n${JSON.stringify(payload.currentTasks, null, 2)}`;
                const openAISystem = `${SYSTEM_INSTRUCTION_TEXT}\n\nOutput strict JSON array.`;
                resultText = await callOpenAI(apiKey, AI_MODELS.OPENAI, openAISystem, prompt, true);
            } else if (type === 'summary') {
                const prompt = `Here is the current list of tasks:\n${JSON.stringify(payload.currentTasks, null, 2)}`;
                resultText = await callOpenAI(apiKey, AI_MODELS.OPENAI, SUMMARY_SYSTEM_INSTRUCTION, prompt, false);
            } else if (type === 'breakdown') {
                const prompt = `Task to break down: "${payload.taskTitle}"`;
                const openAISystem = `${BREAKDOWN_SYSTEM_INSTRUCTION}\n\nOutput strict JSON array.`;
                resultText = await callOpenAI(apiKey, AI_MODELS.OPENAI, openAISystem, prompt, true);
            } else if (type === 'parse') {
                const prompt = `Current Date: ${currentDate}\n\nTranscript: "${payload.transcript}"`;
                const openAISystem = `${PARSE_TASK_INSTRUCTION}\n\nOutput strict JSON object.`;
                resultText = await callOpenAI(apiKey, AI_MODELS.OPENAI, openAISystem, prompt, true);
            }
        } 
        else {
            throw new Error("Unknown API Key format. Please use a valid Google (AIza...) or OpenAI (sk-...) key.");
        }

        return resultText ? resultText.trim() : "";

    } catch (error: any) {
        console.error("AI Service Error:", error);
        // Better error message propagation for UI
        if (error.message && error.message.includes("404") && error.message.includes("NOT_FOUND")) {
             throw new Error("Model not found. Please check your API key or try a different region.");
        }
        throw new Error(error.message || "Failed to communicate with AI.");
    }
};

export const manageTasksWithAI = async (command: string, currentTasks: Task[], userApiKey?: string): Promise<Task[]> => {
    const jsonText = await executeAIRequest(userApiKey, 'manage', { command, currentTasks });
    const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '');
    const updatedTasks = JSON.parse(cleanJson);
    return updatedTasks.map(backfillNewFields);
};

export const generateTaskSummary = async (currentTasks: Task[], userApiKey?: string): Promise<string> => {
    return await executeAIRequest(userApiKey, 'summary', { currentTasks });
};

export const breakDownTask = async (taskTitle: string, userApiKey?: string): Promise<Subtask[]> => {
    const jsonText = await executeAIRequest(userApiKey, 'breakdown', { taskTitle });
    const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '');
    const steps = JSON.parse(cleanJson);
    
    const list = Array.isArray(steps) ? steps : (steps.steps || []);

    return list.map((step: any) => ({
        id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: step.title,
        isCompleted: false
    }));
};

export const parseTaskFromVoice = async (transcript: string, userApiKey?: string): Promise<any> => {
    const jsonText = await executeAIRequest(userApiKey, 'parse', { transcript });
    const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '');
    return JSON.parse(cleanJson);
};
