
import { GoogleGenAI, Type } from "@google/genai";
import { Task, Subtask, Goal } from '../types';
import { getEnvVar } from '../utils/env';

// --- CONFIGURATION ---

export const AI_MODELS = {
    GOOGLE: "gemini-2.0-flash-thinking-exp-01-21", // Explicitly use thinking model
    OPENAI: "gpt-4o-mini"
};

// --- PROVIDER DETECTION ---

type AIProvider = 'google' | 'openai' | 'unknown';

const detectProvider = (apiKey: string): AIProvider => {
    if (apiKey.startsWith('AIza')) return 'google';
    if (apiKey.startsWith('sk-')) return 'openai'; 
    return 'unknown';
};

// --- SCHEMA DEFINITIONS ---

const responseSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            id: { type: Type.STRING },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            status: { type: Type.STRING },
            priority: { type: Type.STRING },
            dueDate: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            timeEstimate: { type: Type.NUMBER },
            blockerReason: { type: Type.STRING },
            createdDate: { type: Type.STRING },
            lastModified: { type: Type.STRING },
            statusChangeDate: { type: Type.STRING },
            actualTimeSpent: { type: Type.NUMBER },
            xpAwarded: { type: Type.BOOLEAN },
            scheduledStartDateTime: { type: Type.STRING },
            goalId: { type: Type.STRING },
            subtasks: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.STRING },
                        title: { type: Type.STRING },
                        isCompleted: { type: Type.BOOLEAN },
                    },
                    required: ['id', 'title', 'isCompleted'],
                },
            },
        },
        required: ['id', 'title', 'status', 'priority']
    },
};

const subtaskSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
        },
        required: ['title']
    }
};

const parsedTaskSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "A concise, action-oriented title." },
        description: { type: Type.STRING, description: "A rich description summarizing context, 'why', and 'how'." },
        status: { type: Type.STRING, enum: ["To Do", "In Progress", "Review", "Blocker", "Hold", "Won't Complete", "Done"] },
        priority: { type: Type.STRING, enum: ["Critical", "High", "Medium", "Low"] },
        dueDate: { type: Type.STRING, description: "ISO 8601 Date YYYY-MM-DD" },
        scheduledStartDateTime: { type: Type.STRING, description: "ISO 8601 Datetime" },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        timeEstimate: { type: Type.NUMBER, description: "Estimated hours (e.g. 1.5)" },
        blockerReason: { type: Type.STRING },
        goalId: { type: Type.STRING, description: "ID of the most relevant goal." },
        subtasks: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    isCompleted: { type: Type.BOOLEAN }
                }
            },
            description: "Breakdown of 3-5 actionable steps."
        }
    },
    required: ['title', 'status', 'priority', 'description', 'subtasks', 'dueDate']
};

const SYSTEM_INSTRUCTION_TEXT = `You are an expert Executive Function Assistant. 
Your goal is to parse user commands into structured JSON tasks.`;

const SUMMARY_SYSTEM_INSTRUCTION = `Summarize the board state in markdown.`;

const BREAKDOWN_SYSTEM_INSTRUCTION = `Break down a task title into 3-5 subtasks. Return JSON array of objects with 'title'.`;

const PARSE_TASK_INSTRUCTION = `You are a highly intelligent Project Manager and Interviewer.
The user is speaking a "stream of consciousness" task request. 
Your job is to **THINK DEEPLY** about what they mean, fill in the gaps, and structure a complete project plan.

**YOUR PROCESS:**
1. **Analyze**: Read the entire transcript. Identify the core objective.
2. **Ideate**: 
   - If the user didn't say a description, WRITE ONE based on the title. What does "doing this task" actually entail?
   - If the user didn't say a priority, INFER it. "Urgent", "Broken", "Immediately" = Critical.
   - If the user didn't say a time estimate, GUESS reasonable hours based on task complexity.
   - If the user didn't list subtasks, CREATE 3-5 logical steps to complete the task.
3. **Map**: Connect the task to the most relevant Goal ID provided in the context.
4. **Output**: Return a single, valid JSON object matching the schema.

**RULES:**
- **Title**: specific and actionable (Start with a verb).
- **Description**: MUST be populated. If input is short, expand it with professional details.
- **Subtasks**: MUST generate at least 3 if none provided.
- **Due Date**: Default to 'Today' if urgent, otherwise 'Next Friday' (calculate relative to Current Date).
- **Status**: Default to 'To Do'.

**JSON ONLY.** No markdown fencing.`;

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
        scheduledStartDateTime: task.scheduledStartDateTime,
        goalId: task.goalId
    };
};

// --- GOOGLE IMPLEMENTATION ---

const callGoogleAI = async (apiKey: string, model: string, systemPrompt: string, userPrompt: string, schema?: any, isJsonMode: boolean = false): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey });
    
    // For Thinking models, we use specific config
    const config: any = {
        systemInstruction: systemPrompt,
    };
    
    // Only apply thinking budget if supported (Gemini 2.0 Flash Thinking supports it implicitly via model name usually, 
    // but explicit config is good practice if using preview SDK).
    // Note: 'thinkingConfig' is feature-gated.
    if (model.includes('thinking')) {
         config.thinkingConfig = { thinkingBudget: 2048 }; 
    }
    
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
                resultText = await callGoogleAI(apiKey, "gemini-3-flash-preview", SYSTEM_INSTRUCTION_TEXT, prompt, responseSchema, true);
            } else if (type === 'summary') {
                const prompt = `Here is the current list of tasks:\n${JSON.stringify(payload.currentTasks, null, 2)}`;
                resultText = await callGoogleAI(apiKey, "gemini-3-flash-preview", SUMMARY_SYSTEM_INSTRUCTION, prompt);
            } else if (type === 'breakdown') {
                const prompt = `Task to break down: "${payload.taskTitle}"`;
                resultText = await callGoogleAI(apiKey, "gemini-3-flash-preview", BREAKDOWN_SYSTEM_INSTRUCTION, prompt, subtaskSchema, true);
            } else if (type === 'parse') {
                // GOAL AWARENESS PROMPT
                const goalContext = payload.goals 
                    ? `\n\nAvailable Goals (Use these IDs if relevant):\n${JSON.stringify(payload.goals.map((g: Goal) => ({ id: g.id, title: g.title, description: g.description })), null, 2)}` 
                    : "";
                
                const prompt = `Current Date: ${currentDate}\n\nTranscript of user speech: "${payload.transcript}"${goalContext}\n\nInstructions: Ideate and fill the task form completely.`;
                // Use the Thinking Model for parsing voice to task
                resultText = await callGoogleAI(apiKey, AI_MODELS.GOOGLE, PARSE_TASK_INSTRUCTION, prompt, parsedTaskSchema, true);
            }
        } 
        else if (provider === 'openai') {
            // OpenAI implementation remains similar...
            if (type === 'parse') {
                 const goalContext = payload.goals 
                    ? `\n\nAvailable Goals:\n${JSON.stringify(payload.goals.map((g: Goal) => ({ id: g.id, title: g.title })), null, 2)}` 
                    : "";
                const prompt = `Current Date: ${currentDate}\n\nTranscript: "${payload.transcript}"${goalContext}`;
                resultText = await callOpenAI(apiKey, AI_MODELS.OPENAI, PARSE_TASK_INSTRUCTION, prompt, true);
            } else {
                // Fallbacks for other types
                const prompt = JSON.stringify(payload);
                resultText = await callOpenAI(apiKey, AI_MODELS.OPENAI, "Process request", prompt, true);
            }
        } 
        else {
            throw new Error("Unknown API Key format.");
        }

        return resultText ? resultText.trim() : "";

    } catch (error: any) {
        console.error("AI Service Error:", error);
        if (error.message && error.message.includes("404")) {
             throw new Error("Model not found. Please check your API key.");
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

export const parseTaskFromVoice = async (transcript: string, userApiKey?: string, goals: Goal[] = []): Promise<any> => {
    const jsonText = await executeAIRequest(userApiKey, 'parse', { transcript, goals });
    const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '');
    return JSON.parse(cleanJson);
};
