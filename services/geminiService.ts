
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
// Fixes "AI not giving output answer" by separating JSON data from conversational text
const extractJsonAndText = (text: string) => {
    if (!text) return { json: null, remainder: "" };

    let json: any = null;
    let cleanText = text;

    // 1. Try Code Block extraction first (Most reliable)
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        try {
            json = JSON.parse(codeBlockMatch[1]);
            // Remove code block from text to get "remainder" (conversational part)
            cleanText = text.replace(codeBlockMatch[0], '').trim();
        } catch (e) {
            // Failed to parse code block, continue
        }
    }

    // 2. Try raw Braces search if code block failed
    if (!json) {
        const firstOpenBrace = text.indexOf('{');
        const lastCloseBrace = text.lastIndexOf('}');
        
        if (firstOpenBrace !== -1 && lastCloseBrace !== -1 && lastCloseBrace > firstOpenBrace) {
            const candidate = text.substring(firstOpenBrace, lastCloseBrace + 1);
            try {
                json = JSON.parse(candidate);
                // Remove JSON from text to get remainder
                const pre = text.substring(0, firstOpenBrace);
                const post = text.substring(lastCloseBrace + 1);
                cleanText = (pre + "\n" + post).trim();
            } catch (e) {
                console.warn("Failed to parse extracted JSON candidate");
            }
        }
    }
    
    // 3. Fallback: Try parsing the whole text
    if (!json) {
        try {
            json = JSON.parse(text);
            cleanText = ""; // Entire text was JSON
        } catch (e) {
            // Not JSON
        }
    }

    return { json, remainder: cleanText };
};

const safeParseJSON = (text: string) => {
    const { json } = extractJsonAndText(text);
    if (!json) throw new Error("Failed to parse AI response. The model output was not valid JSON.");
    return json;
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
            description: "A rich markdown response. Use Bold for emphasis, Headers for structure, and bullet points." 
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

const MANAGE_SYSTEM_INSTRUCTION = `You are an elite Executive Productivity Architect and Database Manager.
Your goal is to provide high-leverage, strategic, and psychologically astute assistance.

**Role 1: The Strategist (Conversational Output)**
- Use the 'summary' field for all communication.
- **FORMATTING RULES**:
  - Use **Bold** for key insights, metrics, task titles, and totals.
  - Use \`### Headers\` to structure your analysis (e.g., ### 🛑 Bottlenecks, ### 🚀 Next Steps).
  - Use bullet points for readability.
  - Use > Blockquotes for philosophical or critical warnings.
  - Be concise but high-density. Avoid fluff.
  - When analyzing time, calculate totals. (e.g., "Total Estimate: **14.5 hours**").

**Role 2: The Operator (Database Action)**
- Modify the task database ONLY when explicitly requested or when a specific framework (like Triage) requires immediate changes.
- **Add**: Populate 'added' array.
- **Update**: Populate 'updated' array with exact 'id' and changed fields.
- **Delete**: Populate 'deletedIds' array (ONLY if explicitly requested).

**Context**:
- Current Date: ${new Date().toISOString()}

**Advanced Frameworks (Triggered by user intent)**:
1. **Strategic Audit**: Calculate capacity vs load. Identify "Fake Work" (low value, high effort). Group by Goal/Context.
2. **Triage Mode**: Ruthlessly cut. If it's not Critical, ignore it. Output a specific sequence of actions.
3. **Psychological Mirror (Krishnamurti)**:
   - Distinguish **Functional Action** (Chronological necessity) vs **Becoming** (Psychological ambition/ego).
   - If a task is "Becoming" (e.g., "Be a better leader"), flag it in 'updated' with \`isBecoming: true\` and a \`becomingWarning\`.
   - In 'summary', explain the trap of psychological time.

**Output Rule**: ALWAYS return strict JSON matching the schema.`;

const SUMMARY_SYSTEM_INSTRUCTION = `Summarize the board state in markdown. Be concise, motivating, and use bolding for key tasks.`;

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

const callGoogleAI = async (apiKey: string, model: string, systemPrompt: string, userPrompt: string, schema?: any, isJsonMode: boolean = false, allowFallback: boolean = true): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey });
    
    const config: any = {
        systemInstruction: systemPrompt,
    };
    
    if (isJsonMode) {
        config.responseMimeType = "application/json";
        if (schema) config.responseSchema = schema;
    }

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: userPrompt,
            config: config
        });
        
        return response.text || "";
    } catch (error: any) {
        // DETECT QUOTA ERRORS (429) OR OVERLOAD (503)
        // Note: Google's library might wrap the error, so we check status, code, and message.
        const isQuotaError = error.status === 429 || 
                             error.code === 429 || 
                             (error.message && (error.message.includes('429') || error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED')));
        
        // AUTOMATIC FALLBACK LOGIC
        // If we hit a limit on the "Smart" model (Pro), silently fallback to the "Fast" model (Flash).
        // Flash has significantly higher rate limits.
        if (allowFallback && isQuotaError && model !== AI_MODELS.FAST) {
            console.warn(`[AI Service] Model ${model} rate limited. Automatically falling back to ${AI_MODELS.FAST}...`);
            return callGoogleAI(apiKey, AI_MODELS.FAST, systemPrompt, userPrompt, schema, isJsonMode, false);
        }

        console.error("AI Service Error:", error);
        if (error.message && error.message.includes("404")) {
             throw new Error("Model not found. Please check your API key or use a valid model.");
        }
        throw new Error(error.message || "Failed to communicate with AI.");
    }
};

// --- PUBLIC METHODS ---

// New Validation Method for Integrations UI
export const validateGeminiKey = async (apiKey: string): Promise<boolean> => {
    // 1. Structural Check
    if (!apiKey || apiKey.length < 20) return false;

    // 2. Network Check (Direct, no wrapper)
    try {
        const ai = new GoogleGenAI({ apiKey });
        // Minimal token count request is often sufficient and faster/cheaper than generateContent
        // But for absolute certainty of chat capability, we use generateContent with a tiny prompt.
        const response = await ai.models.generateContent({
            model: AI_MODELS.FAST,
            contents: { parts: [{ text: "Test" }] },
        });
        
        // If we get here without throwing, the key is valid for this model.
        return true;
    } catch (e) {
        console.warn("API Key Validation Failed:", e);
        return false;
    }
};

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
            // Summary uses FAST by default, so it's less likely to hit limits, but fallback protects it anyway
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
        throw error;
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
        tags: t.tags,
        timeEstimate: t.timeEstimate
    }));
    
    const responseText = await executeAIRequest(userApiKey, 'manage', { command, currentTasks: enrichedTasks });
    
    // Robust Extraction: Get JSON AND potentially lost conversational text
    const { json: rawDiff, remainder } = extractJsonAndText(responseText);

    // If NO JSON at all, assume the entire response is a summary/chat message
    if (!rawDiff) {
        return {
            summary: responseText,
            added: [],
            updated: [],
            deletedIds: []
        };
    }

    // SANITIZATION FIX:
    // AI sometimes hallucinating empty objects in 'added' or 'updated' arrays.
    // We strictly filter out any task actions that don't have essential fields.
    // Also, if JSON 'summary' is empty, we fallback to the 'remainder' text found outside the JSON block.
    
    const cleanDiff: TaskDiff = {
        summary: (rawDiff.summary && rawDiff.summary.trim()) ? rawDiff.summary : remainder,
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
    const { json: steps } = extractJsonAndText(jsonText);
    const list = Array.isArray(steps) ? steps : (steps?.steps || []);
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
