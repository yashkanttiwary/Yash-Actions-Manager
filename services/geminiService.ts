
import { GoogleGenAI, Type } from "@google/genai";
import { Task, Subtask, Goal, TaskDiff } from '../types'; 
import { getEnvVar } from '../utils/env';
import { AI_MODELS } from '../constants';

export type { TaskDiff };

// --- HELPER FUNCTIONS ---

const getApiKey = (userApiKey?: string): string => {
    const envKey = getEnvVar('VITE_GEMINI_API_KEY');
    const finalKey = userApiKey || envKey;
    if (!finalKey || finalKey === 'undefined') throw new Error("API Key is missing.");
    return finalKey;
};

// Robust JSON Parsing Helper
// MED-002 FIX: Better extraction logic
const safeParseJSON = (text: string) => {
    if (!text) throw new Error("Empty response from AI");
    
    // 1. Try direct parse (Best Case)
    try {
        return JSON.parse(text);
    } catch (e) {
        // Continue to fallback strategies
    }

    // 2. Try extracting from markdown code block (Common AI pattern)
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
        try {
            return JSON.parse(match[1]);
        } catch (e2) {
            // Fallback
        }
    }
    
    // 3. Robust Search for JSON object or array
    // Find the first '{' or '['
    const firstOpenBrace = text.indexOf('{');
    const firstOpenBracket = text.indexOf('[');
    
    let start = -1;
    let end = -1;
    
    // Determine if we are looking for object or array
    if (firstOpenBrace !== -1 && (firstOpenBracket === -1 || firstOpenBrace < firstOpenBracket)) {
        start = firstOpenBrace;
        end = text.lastIndexOf('}');
    } else if (firstOpenBracket !== -1) {
        start = firstOpenBracket;
        end = text.lastIndexOf(']');
    }

    if (start !== -1 && end !== -1 && end > start) {
         const jsonCandidate = text.substring(start, end + 1);
         try {
            return JSON.parse(jsonCandidate);
        } catch (e3) {
            console.error("Failed to parse extracted JSON candidate:", jsonCandidate);
        }
    }
    
    console.error("Critical JSON Parsing Failure. Raw Text:", text);
    throw new Error("Failed to parse AI response. The model output was not valid JSON.");
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
                    isBecoming: { type: Type.BOOLEAN },
                    becomingWarning: { type: Type.STRING }
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
            description: "A detailed, rich markdown response to the user. Use bolding, lists, and clear structure." 
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

const psychologySchema = {
    type: Type.OBJECT,
    properties: {
        isBecoming: { type: Type.BOOLEAN, description: "True if the task implies 'becoming' (psychological time, ego ambition, future status) rather than simple functional action." },
        warning: { type: Type.STRING, description: "A strict, philosophical warning about why this is a trap of the mind." }
    },
    required: ['isBecoming', 'warning']
};

const MANAGE_SYSTEM_INSTRUCTION = `You are an elite Executive Productivity Architect and Philosophical Guide (J. Krishnamurti aligned).
Your goal is to provide **comprehensive, insightful, and structurally beautiful** responses.

**CORE DIRECTIVE:**
Do NOT be brief. Be thorough. Think deeply before responding.
Act as a proactive partner, not just a passive tool.

**ROLES & BEHAVIORS:**

1.  **THE STRATEGIST (Chat/Analysis)**
    -   **Context**: When asked "Analyze my workload", "What's important?", or general advice.
    -   **Action**: Provide a detailed Markdown summary in the \`summary\` field.
    -   **Structure**:
        -   Use **Bold** for emphasis.
        -   Use Lists for clarity.
        -   Group thoughts logically (e.g., "Critical Bottlenecks", "Quick Wins", "Long-term Strategy").
    -   **Tone**: Professional, direct, encouraging, yet factual.

2.  **THE MIRROR (Psychological/K-Mode)**
    -   **Context**: When asked about "ambition", "stress", "future", "becoming", or "meaning".
    -   **Philosophy**: Distinguish *Chronological Time* (fact) from *Psychological Time* (illusion/becoming).
    -   **Analysis**: Identify tasks that are purely ego-driven "becoming" vs functional "doing".
    -   **Output**:
        -   A deep philosophical reflection in \`summary\`.
        -   Flag specific "becoming" tasks in \`updated\` with \`isBecoming: true\` and a strict \`becomingWarning\`.

3.  **THE EXECUTOR (Database Actions)**
    -   **Context**: Explicit commands ("Add task", "Delete X").
    -   **Action**: Populate \`added\`, \`updated\`, \`deletedIds\`.
    -   **Constraint**: Only modify if explicitly asked.

**RESPONSE FORMAT:**
-   ALWAYS return valid JSON matching the schema.
-   If purely chatting, keep action arrays empty.
-   The \`summary\` field is your voice. Make it count.

**CONTEXT:**
-   Current Date: ${new Date().toISOString()}
-   Tasks are provided in JSON.

Output pure JSON.`;

const SUMMARY_SYSTEM_INSTRUCTION = `Summarize the board state in markdown. 
Be detailed, insightful, and strategic. 
Analyze the balance of the workload.
Identify bottlenecks.
Provide a high-level executive summary.`;

const BREAKDOWN_SYSTEM_INSTRUCTION = `Break down a task title into 3-5 subtasks. Return JSON array of objects with 'title'.`;

const PSYCHOLOGY_SYSTEM_INSTRUCTION = `You are "The Mirror". You reflect the user's mind back to them.
Your job is to detect "Becoming" vs "Action".

**Becoming (True):**
- Ambition, Self-Improvement, Ego-Projection.
- "I want to be X". "Get fit". "Be richer". "Learn French (to be smart)".
- Implies a gap between "what is" and "what should be".
- Abstract attributes.

**Action (False):**
- Functional, Logistical, Factual.
- "Run 5km". "Deposit check". "Read textbook". "Buy groceries".
- Immediate physical steps.

If it is "Becoming", warn the user sternly but philosophically.
If it is "Action", return isBecoming: false.`;

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

const executeAIRequest = async (userApiKey: string | undefined, type: 'manage' | 'summary' | 'breakdown' | 'parse' | 'psychology', payload: any) => {
    const apiKey = getApiKey(userApiKey);
    const currentDate = new Date().toISOString();

    let resultText: string | undefined = "";

    try {
        if (type === 'manage') {
            const prompt = `Current Date: ${currentDate}\n\nUser Input: "${payload.command}"\n\nCurrent Tasks Context:\n${JSON.stringify(payload.currentTasks, null, 2)}`;
            resultText = await callGoogleAI(apiKey, AI_MODELS.SMART, MANAGE_SYSTEM_INSTRUCTION, prompt, manageResponseSchema, true);
        } else if (type === 'summary') {
            const prompt = `Here is the current list of tasks:\n${JSON.stringify(payload.currentTasks, null, 2)}`;
            resultText = await callGoogleAI(apiKey, AI_MODELS.FAST, SUMMARY_SYSTEM_INSTRUCTION, prompt);
        } else if (type === 'breakdown') {
            const prompt = `Task to break down: "${payload.taskTitle}"`;
            resultText = await callGoogleAI(apiKey, AI_MODELS.FAST, BREAKDOWN_SYSTEM_INSTRUCTION, prompt, subtaskSchema, true);
        } else if (type === 'parse') {
            const goalContext = payload.goals 
                ? `\n\nAvailable Goals (Use these IDs):\n${JSON.stringify(payload.goals.map((g: Goal) => ({ id: g.id, title: g.title, description: g.description })), null, 2)}` 
                : "";
            
            const prompt = `Current Date: ${currentDate}\n\nVoice Transcript: "${payload.transcript}"${goalContext}`;
            // Use Smart model for deep reconstruction of voice
            resultText = await callGoogleAI(apiKey, AI_MODELS.SMART, PARSE_TASK_INSTRUCTION, prompt, parsedTaskSchema, true);
        } else if (type === 'psychology') {
            const prompt = `Analyze this task:\nTitle: "${payload.title}"\nDescription: "${payload.description || ''}"`;
            resultText = await callGoogleAI(apiKey, AI_MODELS.FAST, PSYCHOLOGY_SYSTEM_INSTRUCTION, prompt, psychologySchema, true);
        }

        return resultText ? resultText.trim() : "";

    } catch (error: any) {
        console.error("AI Service Error:", error);
        if (error.message && error.message.includes("404")) {
             throw new Error("Model not found. Please check your API key or use a valid model.");
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
    const rawDiff = safeParseJSON(jsonText) as TaskDiff;

    // SANITIZATION FIX:
    // AI sometimes hallucinating empty objects in 'added' or 'updated' arrays when it only means to reply conversationally.
    // We strictly filter out any task actions that don't have essential fields (title for added, id for updated).
    const cleanDiff: TaskDiff = {
        summary: rawDiff.summary,
        added: Array.isArray(rawDiff.added) 
            ? rawDiff.added.filter(t => t && typeof t === 'object' && t.title && t.title.trim() !== '') 
            : [],
        updated: Array.isArray(rawDiff.updated) 
            ? rawDiff.updated.filter(t => t && typeof t === 'object' && t.id && t.id.trim() !== '') 
            : [],
        deletedIds: Array.isArray(rawDiff.deletedIds) 
            ? rawDiff.deletedIds.filter(id => id && typeof id === 'string' && id.trim() !== '') 
            : []
    };

    return cleanDiff;
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

export const analyzeTaskPsychology = async (task: Task, userApiKey?: string): Promise<{ isBecoming: boolean; warning: string }> => {
    const jsonText = await executeAIRequest(userApiKey, 'psychology', { title: task.title, description: task.description });
    return safeParseJSON(jsonText);
};
