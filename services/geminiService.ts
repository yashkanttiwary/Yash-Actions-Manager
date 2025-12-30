
import { GoogleGenAI, Type } from "@google/genai";
import { Task, Subtask, Goal, TaskDiff } from '../types'; // Import TaskDiff from types
import { getEnvVar } from '../utils/env';

// Re-export TaskDiff for consumers
export type { TaskDiff };

// --- CONFIGURATION ---

export const AI_MODELS = {
    GOOGLE: "gemini-2.0-flash-thinking-exp-01-21", // Best for complex logic/parsing
    OPENAI: "gpt-4o-mini"
};

// --- HELPER FUNCTIONS ---

const getApiKey = (userApiKey?: string): string => {
    const envKey = getEnvVar('VITE_GEMINI_API_KEY');
    const finalKey = userApiKey || envKey;
    if (!finalKey || finalKey === 'undefined') throw new Error("API Key is missing.");
    return finalKey;
};

// Robust JSON Parsing Helper
const safeParseJSON = (text: string) => {
    if (!text) throw new Error("Empty response from AI");
    
    // 1. Try direct parse
    try {
        return JSON.parse(text);
    } catch (e) {
        // 2. Try extracting from markdown code block
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match && match[1]) {
            try {
                return JSON.parse(match[1]);
            } catch (e2) {
                // fall through
            }
        }
        
        // 3. Try finding first { and last } or [ and ]
        const firstOpenBrace = text.indexOf('{');
        const lastCloseBrace = text.lastIndexOf('}');
        const firstOpenBracket = text.indexOf('[');
        const lastCloseBracket = text.lastIndexOf(']');
        
        // Determine if it's likely an object or array
        let start = -1;
        let end = -1;
        
        if (firstOpenBrace !== -1 && (firstOpenBracket === -1 || firstOpenBrace < firstOpenBracket)) {
            start = firstOpenBrace;
            end = lastCloseBrace;
        } else if (firstOpenBracket !== -1) {
            start = firstOpenBracket;
            end = lastCloseBracket;
        }

        if (start !== -1 && end !== -1) {
             try {
                return JSON.parse(text.substring(start, end + 1));
            } catch (e3) {
                // fall through
            }
        }
        
        console.error("Failed to parse JSON:", text);
        throw new Error("Failed to parse AI response as JSON. Response might be malformed.");
    }
};

// --- SCHEMA DEFINITIONS ---

// Safe Diff Schema
const manageResponseSchema = {
    type: Type.OBJECT,
    properties: {
        added: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    status: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    dueDate: { type: Type.STRING },
                    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    timeEstimate: { type: Type.NUMBER },
                    goalId: { type: Type.STRING },
                    subtasks: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: { title: { type: Type.STRING }, isCompleted: { type: Type.BOOLEAN } },
                            required: ['title', 'isCompleted']
                        }
                    }
                },
                required: ['title', 'status', 'priority']
            }
        },
        updated: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING, description: "The EXACT ID of the task to update." },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    status: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    dueDate: { type: Type.STRING },
                    goalId: { type: Type.STRING },
                    // We only include fields that might change
                },
                required: ['id']
            }
        },
        deletedIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of Task IDs to delete."
        },
        summary: { 
            type: Type.STRING, 
            description: "A conversational response to the user. If performing actions, explain them. If asked a question or for a summary, provide the answer here." 
        }
    }
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
        title: { type: Type.STRING, description: "Corrected and clear title." },
        description: { type: Type.STRING, description: "Rich description inferred from speech." },
        status: { type: Type.STRING, enum: ["To Do", "In Progress", "Review", "Blocker", "Hold", "Won't Complete", "Done"] },
        priority: { type: Type.STRING, enum: ["Critical", "High", "Medium", "Low"] },
        dueDate: { type: Type.STRING, description: "ISO 8601 Date YYYY-MM-DD" },
        scheduledStartDateTime: { type: Type.STRING, description: "ISO 8601 Datetime" },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        timeEstimate: { type: Type.NUMBER, description: "Estimated hours" },
        blockerReason: { type: Type.STRING },
        goalId: { type: Type.STRING },
        subtasks: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    isCompleted: { type: Type.BOOLEAN }
                }
            },
            description: "3-5 actionable subtasks."
        }
    },
    required: ['title', 'status', 'priority', 'description', 'subtasks', 'dueDate']
};

const MANAGE_SYSTEM_INSTRUCTION = `You are an intelligent Task Assistant and Database Manager.
You have two roles:
1. **Conversational Assistant**: Answer questions about the user's tasks, summarize content, or provide advice. Use the 'summary' field for this.
2. **Action Executor**: Modifying the task database based on user requests (Add, Update, Delete).

**Context**:
- Current Date: ${new Date().toISOString()}
- You have access to the current list of tasks.

**RULES:**
1. **Response Format**: ALWAYS return a JSON object.
2. **Chat**: If the user asks "Summarize my tasks" or "What is due today?", put the answer in the 'summary' field. Do NOT create/update tasks unless asked.
3. **Actions**:
   - **Add**: Populate 'added' array.
   - **Update**: Populate 'updated' array with exact 'id' and changed fields.
   - **Delete**: Populate 'deletedIds' array (ONLY if explicitly requested).
   - **Confirm**: When performing actions, use 'summary' to briefly describe what you are doing (e.g., "I've drafted a new task for...").
4. **Data Safety**: Never delete unless explicitly told. Never return the full list in 'added' (only new ones).

**Task Analysis**:
- If the user says "Summarize this task" and refers to a specific one by context or name, find it in the provided list and summarize its details in 'summary'.
- Use the provided task list to answer queries.

Output pure JSON matching the schema.`;

const SUMMARY_SYSTEM_INSTRUCTION = `Summarize the board state in markdown. Be concise and motivating.`;

const BREAKDOWN_SYSTEM_INSTRUCTION = `Break down a task title into 3-5 subtasks. Return JSON array of objects with 'title'.`;

const PARSE_TASK_INSTRUCTION = `You are an expert Voice-to-Project Assistant.
The user is speaking a task. The transcription might be weak, contain typos, or be fragmented.

**YOUR JOB:**
1. **Reconstruct**: Fix grammar/typos in the input. (e.g., "skedule for tmrw" -> Schedule for tomorrow).
2. **Ideate**: Fill in all missing details.
   - If description is missing, write a professional one.
   - If priority is missing, infer it from context (words like "broken", "fast", "now" = Critical/High).
   - If subtasks are missing, invent 3-5 logical steps.
   - If date is missing, pick a reasonable default (Next Friday for general tasks, Today for urgent).
3. **Structure**: Map it to the JSON schema strictly.

**Input Context**:
- Current Date is provided.
- Available Goals are provided. Map to the best Goal ID if applicable.

**Output**: Strict JSON object.`;

// --- GOOGLE IMPLEMENTATION ---

const callGoogleAI = async (apiKey: string, model: string, systemPrompt: string, userPrompt: string, schema?: any, isJsonMode: boolean = false): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey });
    
    const config: any = {
        systemInstruction: systemPrompt,
    };
    
    // Feature gating for Thinking models
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

// --- PUBLIC METHODS ---

const executeAIRequest = async (userApiKey: string | undefined, type: 'manage' | 'summary' | 'breakdown' | 'parse', payload: any) => {
    const apiKey = getApiKey(userApiKey);
    const currentDate = new Date().toISOString();

    let resultText: string | undefined = "";

    try {
        if (type === 'manage') {
            const prompt = `Current Date: ${currentDate}\n\nUser Input: "${payload.command}"\n\nCurrent Tasks Context:\n${JSON.stringify(payload.currentTasks, null, 2)}`;
            // Use gemini-2.0-flash-thinking-exp-01-21 for better reasoning on mixed chat/action tasks if available, otherwise gemini-3-flash-preview
            // Using standard model for speed, but prompting for intelligence.
            resultText = await callGoogleAI(apiKey, "gemini-3-flash-preview", MANAGE_SYSTEM_INSTRUCTION, prompt, manageResponseSchema, true);
        } else if (type === 'summary') {
            const prompt = `Here is the current list of tasks:\n${JSON.stringify(payload.currentTasks, null, 2)}`;
            resultText = await callGoogleAI(apiKey, "gemini-3-flash-preview", SUMMARY_SYSTEM_INSTRUCTION, prompt);
        } else if (type === 'breakdown') {
            const prompt = `Task to break down: "${payload.taskTitle}"`;
            resultText = await callGoogleAI(apiKey, "gemini-3-flash-preview", BREAKDOWN_SYSTEM_INSTRUCTION, prompt, subtaskSchema, true);
        } else if (type === 'parse') {
            const goalContext = payload.goals 
                ? `\n\nAvailable Goals (Use these IDs):\n${JSON.stringify(payload.goals.map((g: Goal) => ({ id: g.id, title: g.title, description: g.description })), null, 2)}` 
                : "";
            
            const prompt = `Current Date: ${currentDate}\n\nVoice Transcript: "${payload.transcript}"${goalContext}`;
            // Use Thinking model for deep reconstruction of voice
            resultText = await callGoogleAI(apiKey, AI_MODELS.GOOGLE, PARSE_TASK_INSTRUCTION, prompt, parsedTaskSchema, true);
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

export const manageTasksWithAI = async (command: string, currentTasks: Task[], userApiKey?: string): Promise<TaskDiff> => {
    // Send RICH context (Description, Due Date, Status) so AI can actually summarize
    const enrichedTasks = currentTasks.map(t => ({
        id: t.id, 
        title: t.title, 
        description: t.description, // Added Description
        status: t.status, 
        priority: t.priority,
        dueDate: t.dueDate, // Added Due Date
        tags: t.tags
    }));
    
    const jsonText = await executeAIRequest(userApiKey, 'manage', { command, currentTasks: enrichedTasks });
    return safeParseJSON(jsonText) as TaskDiff;
};

export const generateTaskSummary = async (currentTasks: Task[], userApiKey?: string): Promise<string> => {
    return await executeAIRequest(userApiKey, 'summary', { currentTasks });
};

export const breakDownTask = async (taskTitle: string, userApiKey?: string): Promise<Subtask[]> => {
    const jsonText = await executeAIRequest(userApiKey, 'breakdown', { taskTitle });
    const steps = safeParseJSON(jsonText);
    const list = Array.isArray(steps) ? steps : (steps.steps || []);
    return list.map((step: any) => ({
        id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: step.title,
        isCompleted: false
    }));
};

export const parseTaskFromVoice = async (transcript: string, userApiKey?: string, goals: Goal[] = []): Promise<any> => {
    const jsonText = await executeAIRequest(userApiKey, 'parse', { transcript, goals });
    return safeParseJSON(jsonText);
};
