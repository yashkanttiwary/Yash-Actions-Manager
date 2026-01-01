
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { Task, Priority } from '../types';
import { TaskDiff, manageTasksWithAI, generateTaskSummary } from '../services/geminiService';
import { PRIORITY_COLORS } from '../constants';

interface AIAssistantModalProps {
    onClose: () => void;
    onApplyChanges: (diff: TaskDiff) => Promise<void>;
    tasks: Task[];
    apiKey?: string;
    onSaveApiKey: (key: string) => void;
}

type MessageRole = 'user' | 'ai' | 'system';
type MessageType = 'text' | 'proposal' | 'summary';

interface Message {
    id: string;
    role: MessageRole;
    type: MessageType;
    content: string;
    data?: any; // TaskDiff for proposals, or string for summary
    isProcessing?: boolean;
}

// --- SUB-COMPONENT: Proposal Card ---
const ProposalCard: React.FC<{ diff: TaskDiff; onConfirm: () => void; onCancel: () => void; isConfirmed: boolean }> = ({ diff, onConfirm, onCancel, isConfirmed }) => {
    
    // Helper to render a mini card preview
    const renderMiniCard = (task: Partial<Task>, badge: string, badgeColor: string) => {
        const priorityColors = PRIORITY_COLORS[task.priority as Priority] || PRIORITY_COLORS['Medium'];
        return (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm mb-2 relative overflow-hidden">
                <div className={`absolute top-0 right-0 px-2 py-0.5 text-[10px] font-bold uppercase text-white ${badgeColor} rounded-bl-lg`}>
                    {badge}
                </div>
                <h4 className="font-bold text-gray-800 dark:text-gray-100 text-sm mb-1 pr-12">{task.title || 'Untitled'}</h4>
                <div className="flex flex-wrap gap-1 mb-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${priorityColors.bg} ${priorityColors.text} border border-opacity-20 border-current`}>
                        {task.priority || 'Medium'}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {task.status || 'To Do'}
                    </span>
                    {task.timeEstimate && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300">
                            {task.timeEstimate}h
                        </span>
                    )}
                </div>
                {task.description && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{task.description}</p>}
                
                {/* Special Psychological Warning Preview */}
                {task.isBecoming && (
                    <div className="mt-2 pt-2 border-t border-red-100 dark:border-red-900/30 text-xs text-red-600 dark:text-red-400 italic">
                        <i className="fas fa-biohazard mr-1"></i>
                        {task.becomingWarning || "Psychological Ambition Detected"}
                    </div>
                )}

                {task.subtasks && task.subtasks.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                        <p className="text-[10px] text-gray-400 font-semibold mb-1">SUBTASKS</p>
                        <ul className="list-disc list-inside text-xs text-gray-600 dark:text-gray-300">
                            {task.subtasks.slice(0, 3).map((st, i) => (
                                <li key={i} className="truncate">{st.title}</li>
                            ))}
                            {task.subtasks.length > 3 && <li>+{task.subtasks.length - 3} more...</li>}
                        </ul>
                    </div>
                )}
            </div>
        );
    };

    if (isConfirmed) {
        return (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold text-sm bg-green-50 dark:bg-green-900/20 p-2 rounded-lg border border-green-100 dark:border-green-800/30">
                <i className="fas fa-check-circle"></i> Changes applied successfully.
            </div>
        );
    }

    return (
        <div className="w-full max-w-sm mt-2">
            {diff.added?.map((t, i) => <div key={`add-${i}`}>{renderMiniCard(t, 'Adding', 'bg-emerald-500')}</div>)}
            {diff.updated?.map((t, i) => <div key={`upd-${i}`}>{renderMiniCard(t, 'Updating', 'bg-blue-500')}</div>)}
            {diff.deletedIds?.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-100 dark:border-red-800 mb-2">
                    <p className="text-xs text-red-600 dark:text-red-400 font-bold mb-1">DELETING TASKS:</p>
                    <ul className="list-disc list-inside text-xs text-red-500">
                        {diff.deletedIds.map(id => <li key={id}>Task ID: {id.substring(0, 8)}...</li>)}
                    </ul>
                </div>
            )}
            
            <div className="flex gap-2 mt-3">
                <button 
                    onClick={onConfirm}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                    <i className="fas fa-check"></i> Approve
                </button>
                <button 
                    onClick={onCancel}
                    className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-bold py-2 rounded-lg transition-colors"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: Summary Message (Enhanced) ---
// Enhanced markdown parser for bolding and italics
const renderFormattedText = (text: string) => {
    // 1. Split by **bold**
    const parts = text.split(/(\*\*.*?\*\*)/g);
    
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="font-black text-indigo-700 dark:text-indigo-300">{part.slice(2, -2)}</strong>;
        }
        
        // 2. Handle *italics* within non-bold parts
        // Note: This matches *word* but tries to avoid matching * bullet points at start of line (handled by parent)
        const italicParts = part.split(/(\*[^*\s].*?\*)/g);
        if (italicParts.length > 1) {
            return (
                <React.Fragment key={i}>
                    {italicParts.map((subPart, j) => {
                        if (subPart.startsWith('*') && subPart.endsWith('*') && subPart.length > 2) {
                            return <em key={j} className="italic text-gray-600 dark:text-gray-400 font-serif">{subPart.slice(1, -1)}</em>;
                        }
                        return subPart;
                    })}
                </React.Fragment>
            );
        }

        return part;
    });
};

const SummaryMessage: React.FC<{ text: string }> = ({ text }) => {
    // FIX: Robustly normalize newlines.
    // JSON responses sometimes escape newlines as "\\n", which React renders as literal text "\n".
    // We replace them with real newlines before splitting.
    const cleanText = (text || "").replace(/\\n/g, '\n').replace(/\r/g, '');

    return (
        <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {cleanText.split('\n').map((line, i) => {
                const trimmed = line.trim();
                if (trimmed === '') return <br key={i} />;
                
                // Headers
                if (trimmed.startsWith('## ')) return <h3 key={i} className="text-indigo-700 dark:text-indigo-400 font-bold mt-4 mb-2 text-sm border-b border-indigo-100 dark:border-indigo-900/30 pb-1">{renderFormattedText(trimmed.substring(3))}</h3>;
                if (trimmed.startsWith('### ')) return <h4 key={i} className="text-gray-900 dark:text-gray-100 font-bold mt-3 mb-1 text-xs uppercase tracking-wide">{renderFormattedText(trimmed.substring(4))}</h4>;
                
                // Lists
                if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
                    return (
                        <div key={i} className="flex items-start gap-2 mb-1 pl-2">
                            <span className="text-indigo-400 mt-1.5">•</span>
                            <span className="flex-1">{renderFormattedText(trimmed.substring(2))}</span>
                        </div>
                    );
                }
                
                // Numbered Lists
                if (trimmed.match(/^\d+\./)) {
                    const content = trimmed.replace(/^\d+\.\s/, '');
                    const num = trimmed.match(/^\d+/)?.[0];
                    return (
                        <div key={i} className="flex items-start gap-2 mb-1 pl-2">
                            <span className="font-mono text-indigo-500 font-bold text-[10px] mt-0.5">{num}.</span>
                            <span className="flex-1">{renderFormattedText(content)}</span>
                        </div>
                    );
                }

                // Blockquotes
                if (trimmed.startsWith('> ')) {
                    return (
                        <blockquote key={i} className="border-l-2 border-indigo-300 dark:border-indigo-700 pl-3 py-1 my-2 italic text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-r">
                            {renderFormattedText(trimmed.substring(2))}
                        </blockquote>
                    );
                }

                // Regular Paragraph
                return <p key={i} className="mb-1.5">{renderFormattedText(line)}</p>;
            })}
        </div>
    );
};

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({ 
    onClose, onApplyChanges, tasks, apiKey, onSaveApiKey
}) => {
    // Initial welcome message isn't shown in the "Hero" view logic, but kept for state consistency if needed
    const [messages, setMessages] = useState<Message[]>([
        { id: 'welcome', role: 'ai', type: 'text', content: "Hi! I'm your Task Companion. I can help you manage your tasks or just answer questions about them." }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [tempKey, setTempKey] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    const { isListening, transcript, startListening, stopListening, resetTranscript } = useSpeechRecognition({ continuous: true });

    // Auto-scroll to bottom only if we are in chat mode
    useEffect(() => {
        if (messages.length > 1 && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    // Sync Voice
    useEffect(() => {
        if (isListening) setInputValue(transcript);
    }, [transcript, isListening]);

    const addMessage = (role: MessageRole, content: string, type: MessageType = 'text', data?: any) => {
        setMessages(prev => [...prev, { id: Date.now().toString(), role, type, content, data }]);
    };

    const handleSendMessage = async (text: string = inputValue) => {
        if (!text.trim()) return;
        
        // 1. Add User Message
        // If the text matches a long query, display the short label if possible, otherwise display text
        const matchedSuggestion = suggestions.find(s => s.query === text);
        const displayLabel = matchedSuggestion ? matchedSuggestion.label : text;

        addMessage('user', displayLabel);
        setInputValue('');
        resetTranscript();
        setIsTyping(true);

        // 2. Process with AI
        try {
            // Unified AI Call: Let the AI decide if it's an action or a chat
            const diff = await manageTasksWithAI(text, tasks, apiKey);
            setIsTyping(false);
            
            const hasActions = (diff.added && diff.added.length > 0) || (diff.updated && diff.updated.length > 0) || (diff.deletedIds && diff.deletedIds.length > 0);
            
            if (hasActions) {
                // It's an Action Proposal
                addMessage('ai', diff.summary || "I've prepared the following changes:", 'proposal', diff);
            } else {
                // It's just a chat/summary response
                const responseText = diff.summary || "I processed that, but no changes were needed.";
                addMessage('ai', responseText, 'text'); // Use standard text type for chat
            }

        } catch (e: any) {
            setIsTyping(false);
            console.error("AI Error:", e);
            addMessage('system', `Error: ${e.message || "Something went wrong."}`);
        }
    };

    const handleProposalConfirm = async (messageId: string, diff: TaskDiff) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isProcessing: true } : m));
        
        await onApplyChanges(diff);
        
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, data: { ...m.data, confirmed: true }, isProcessing: false } : m));
    };

    const handleProposalCancel = (messageId: string) => {
        addMessage('system', "Action cancelled.");
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, data: { ...m.data, cancelled: true } } : m));
    };

    // Determine view state
    const hasStartedChat = messages.length > 1;

    // REFINED SUGGESTIONS: High-Fidelity Prompt Engineering
    // The query text is hidden from the user but sent to the AI.
    const suggestions = [
        { 
            label: "Analyze Workload", 
            query: "Act as a Senior Operations Director. I need a ruthless capacity audit of my board. 1) Sum the total estimated hours. 2) Compare against a realistic 8-hour workday. 3) Identify 'Fake Work' (Low Priority but High Time Estimate). 4) Group tasks by Context and tell me where my energy is leaking. Output as a Markdown report with **Bold** metrics and ### Headers." 
        },
        { 
            label: "What's Critical?", 
            query: "Act as an ER Triage Nurse. Code Red. Ignore all 'Medium' and 'Low' tasks—they do not exist. Focus ONLY on 'Critical' and 'High'. 1) Are the deadlines realistic? 2) Identify the 'Critical Path'—which task blocks the most others? 3) Rank the top 3 'Must-Do' items to prevent failure. 4) Give me a direct command on the exact first step. Be blunt." 
        },
        { 
            label: "Am I Chasing a Future Self?", 
            query: "Adopt the persona of J. Krishnamurti. Analyze my list for 'Psychological Time' vs 'Chronological Time'. \n- Functional Action: 'Pay bills', 'Write code'. \n- Becoming/Ambition: 'Become a better leader', 'Get rich', 'Improve myself'. \n\nScan the task titles. Which ones are traps of the ego trying to 'become' something in the future? Warn me about the anxiety of accumulation. Suggest 3 tasks to delete to return to the 'Now'." 
        },
        { 
            label: "What Can Be Deleted?", 
            query: "Perform a 'Zero-Based' Budgeting audit on my tasks. Assume we are bankrupt on time. The board is wiped clean. You have 4 units of energy. Which tasks would you 'buy back' onto the list? List the chosen few and explain the ROI. For the rest (the bottom 20% or old stale tasks), propose a 'Bankruptcy' action: delete them. List the specific candidates for deletion." 
        },
        { 
            label: "Why am I Delaying?", 
            query: "Analyze the 'Blocker' and 'In Progress' columns. Look for 'Rotting Tasks' (Status changed > 3 days ago). Diagnoses the root cause: \nA) External (Waiting on others) \nB) Internal (Fear/Perfectionism/Lack of Clarity). \n\nFor the top 2 stuck items, suggest a 'Micro-Action' (2 minutes or less) to break the stasis. Be a behavioral psychologist." 
        },
        { 
            label: "Find Inner Conflict", 
            query: "Analyze my tasks for competing commitments. Do I have tasks that pull in opposite directions? (e.g., 'Relax' vs 'Grind', 'Save Money' vs 'Buy X', 'Focus Deeply' vs 'Respond to all emails'). Highlight these contradictions. Show me where I am fighting myself and suggest which side of the conflict to drop." 
        },
        { 
            label: "Order vs. Control", 
            query: "Look at the list structure. Am I organizing for clarity, or just rearranging deck chairs on the Titanic? Check my WIP (Work In Progress). If I have more than 2 items in 'In Progress', demand I move the rest back to 'To Do'. Enforce a WIP limit of 1. Explain why context switching is destroying my IQ." 
        },
        { 
            label: "Am I Doing This for Ego?", 
            query: "Analyze the semantics of my task titles. Are they 'Input-focused' (e.g., 'Read book', 'Research') or 'Outcome-focused' (e.g., 'Solve problem', 'Ship feature')? Flag tasks that seem to be about maintaining a self-image ('I am a reader') rather than completing a job. Be critical." 
        },
        { 
            label: "Just The Facts", 
            query: "Strip away all emotion, hope, and anxiety. Give me a raw, chronological list of facts. No adjectives. No 'important'. Just: 'Task X due at Time Y'. 'Task Z blocked by A'. Present the board as a machine would see it. Use a Markdown table with columns: ID, Time, Dependency." 
        },
        { 
            label: "Mirror My Mind", 
            query: "If this board is a mirror of my mind, describe my current mental state. Is it fragmented? Is it ambitious? Is it fearful (hoarding tasks)? Use the distribution of priorities and the number of overdue tasks as your evidence. Be a philosophical mirror. Use > Blockquotes for the insight." 
        },
        { 
            label: "Stop Accumulating", 
            query: "I have accumulated too much. I need to subtract. Identify the 3 'High' priority tasks that effectively cancel out the need for 10 'Low' priority tasks. (Pareto Principle). Help me find the leverage point so I can do less but achieve the core result. Tell me what to ignore." 
        },
        { 
            label: "One Thing Completely", 
            query: "Select the single most factually urgent task. Hide everything else. Tell me to do it completely, without the residue of the previous task and without the anticipation of the next. Provide a breakdown of just this one task into 3 atomic steps and ask me to start step 1." 
        }
    ];

    if (!apiKey) {
        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4" onClick={onClose}>
                <div 
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200" 
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header Image/Icon */}
                    <div className="bg-indigo-600 p-6 flex justify-center items-center rounded-t-2xl relative overflow-hidden flex-shrink-0">
                        <div className="absolute inset-0 bg-gradient-to-tr from-purple-600 to-indigo-500 opacity-80"></div>
                        {/* Decorative Circles */}
                        <div className="absolute top-[-20%] right-[-20%] w-32 h-32 bg-white/20 rounded-full blur-xl"></div>
                        <div className="absolute bottom-[-10%] left-[-10%] w-20 h-20 bg-white/20 rounded-full blur-lg"></div>
                        
                        <div className="relative z-10 w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30 shadow-lg">
                            <i className="fas fa-magic text-4xl text-white drop-shadow-md"></i>
                        </div>
                        
                        <button 
                            onClick={onClose}
                            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
                        >
                            <i className="fas fa-times text-xl"></i>
                        </button>
                    </div>

                    <div className="p-6 md:p-8 space-y-6">
                        <div className="text-center">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Turn on the Magic</h2>
                            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                                To let the AI help you, it needs a special ticket called an <strong>API Key</strong>. It's free and easy!
                            </p>
                        </div>

                        {/* Step-by-Step Guide (ELI5) */}
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border border-indigo-100 dark:border-indigo-800/50 space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-indigo-200 dark:bg-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-300 text-xs font-bold flex-shrink-0 mt-0.5">1</div>
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                    <a 
                                        href="https://aistudio.google.com/app/apikey" 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1 group"
                                    >
                                        Click here to visit Google <i className="fas fa-external-link-alt text-[10px] group-hover:translate-x-0.5 transition-transform"></i>
                                    </a>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-indigo-200 dark:bg-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-300 text-xs font-bold flex-shrink-0 mt-0.5">2</div>
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                    Click the big blue <strong>"Create API Key"</strong> button.
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-indigo-200 dark:bg-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-300 text-xs font-bold flex-shrink-0 mt-0.5">3</div>
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                    Copy the long code and paste it below!
                                </div>
                            </div>
                        </div>

                        {/* Input Area */}
                        <div className="space-y-3">
                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1">
                                Paste Your Key Here
                            </label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={tempKey} 
                                    onChange={e => setTempKey(e.target.value)}
                                    placeholder="AIzaSy..." 
                                    className="w-full p-4 bg-gray-100 dark:bg-gray-900 rounded-xl border-2 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-black focus:outline-none transition-all text-gray-900 dark:text-white font-mono text-sm shadow-inner"
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                    <i className="fas fa-key"></i>
                                </div>
                            </div>
                        </div>

                        <button 
                            onClick={() => onSaveApiKey(tempKey)} 
                            disabled={!tempKey.trim()}
                            className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg hover:shadow-indigo-500/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                        >
                            Connect My Assistant 🚀
                        </button>
                        
                        <div className="text-center bg-gray-100 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1.5">
                                <i className="fas fa-lock text-green-500"></i>
                                Your key is stored locally on your device. It is safe, private, and never shared.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-white/30 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] sm:p-4" onClick={onClose}>
            <div 
                className="bg-white dark:bg-gray-900 w-full sm:max-w-[500px] h-full sm:h-[650px] sm:max-h-[85vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/20 dark:border-gray-700 animate-in zoom-in-95 duration-200 relative" 
                onClick={e => e.stopPropagation()}
            >
                {/* Background Decor */}
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
                    <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-3xl"></div>
                </div>

                {/* Header */}
                <div className="p-4 flex justify-between items-center z-10">
                    <div className="flex items-center gap-3">
                        <i className="fas fa-sparkles text-indigo-500 text-lg"></i>
                        <h3 className="font-bold text-gray-900 dark:text-white text-lg">AI Assist</h3>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <i className="fas fa-times text-gray-400"></i>
                    </button>
                </div>

                {/* Content Area */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-2 z-10 scroll-smooth custom-scrollbar">
                    
                    {!hasStartedChat ? (
                        /* HERO / EMPTY STATE */
                        <div className="h-full flex flex-col items-center justify-center text-center pb-8 animate-fadeIn">
                            <div className="relative mb-6">
                                <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full"></div>
                                <div className="relative w-20 h-20 bg-gradient-to-tr from-blue-100 to-indigo-100 dark:from-indigo-900/50 dark:to-blue-900/50 rounded-full flex items-center justify-center shadow-lg border border-white/50 dark:border-white/10">
                                    <i className="fas fa-robot text-3xl text-indigo-600 dark:text-indigo-400"></i>
                                </div>
                            </div>
                            
                            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                How can I help you today?
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-8 max-w-xs leading-relaxed">
                                I can organize your tasks, analyze your workload, or help you break down complex goals.
                            </p>

                            {/* Horizontal Scrollable Suggestions */}
                            <div className="w-full relative">
                                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-3 text-left pl-2">Suggested Inquiries</p>
                                <div className="flex flex-wrap gap-2 justify-center content-start max-h-[220px] overflow-y-auto custom-scrollbar p-1">
                                    {suggestions.map((s, i) => (
                                        <button 
                                            key={i}
                                            onClick={() => handleSendMessage(s.query)}
                                            className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700/50 text-xs font-medium text-gray-700 dark:text-gray-300 transition-all text-center shadow-sm hover:shadow-md flex-grow"
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* CHAT HISTORY */
                        <div className="space-y-6 pb-4">
                            {messages.slice(1).map((msg) => (
                                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`max-w-[90%] md:max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${
                                        msg.role === 'user' 
                                            ? 'bg-indigo-600 text-white rounded-br-none' 
                                            : msg.role === 'system' 
                                                ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800 w-full text-center italic'
                                                : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-none border border-gray-100 dark:border-gray-700'
                                    }`}>
                                        {/* Content */}
                                        {msg.type === 'text' && (
                                            msg.role === 'user' 
                                            ? <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                            : <SummaryMessage text={msg.content} />
                                        )}
                                        
                                        {/* Proposal */}
                                        {msg.type === 'proposal' && msg.data && !msg.data.cancelled && (
                                            <>
                                                {/* Use SummaryMessage here to allow markdown rendering even for proposals */}
                                                <div className="mb-4">
                                                    <SummaryMessage text={msg.content} />
                                                </div>
                                                <ProposalCard 
                                                    diff={msg.data} 
                                                    onConfirm={() => handleProposalConfirm(msg.id, msg.data)}
                                                    onCancel={() => handleProposalCancel(msg.id)}
                                                    isConfirmed={msg.data.confirmed}
                                                />
                                            </>
                                        )}
                                        {msg.data?.cancelled && <p className="text-gray-400 italic line-through text-xs mt-1">Action Cancelled</p>}
                                    </div>
                                    {msg.role === 'ai' && (
                                        <span className="text-[10px] text-gray-400 mt-1 ml-2">AI Assistant</span>
                                    )}
                                </div>
                            ))}
                            
                            {isTyping && (
                                <div className="flex justify-start animate-fadeIn w-full py-4">
                                    <div className="relative w-full flex flex-col items-center justify-center">
                                        {/* GLOW EFFECT */}
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-indigo-500/20 rounded-full blur-2xl animate-pulse"></div>
                                        
                                        {/* ORBITAL RINGS */}
                                        <div className="relative w-16 h-16 flex items-center justify-center">
                                            {/* Outer Slow Ring */}
                                            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500/80 border-r-purple-500/80 animate-[spin_3s_linear_infinite]"></div>
                                            
                                            {/* Middle Fast Ring */}
                                            <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-cyan-400/80 border-l-blue-500/80 animate-[spin_1.5s_linear_infinite_reverse]"></div>
                                            
                                            {/* Inner Core */}
                                            <div className="absolute inset-6 bg-gradient-to-tr from-indigo-400 to-purple-600 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.6)] animate-pulse flex items-center justify-center">
                                                <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping opacity-75"></div>
                                            </div>
                                        </div>
                                        
                                        {/* TEXT */}
                                        <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.25em] text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 animate-pulse">
                                            Synthesizing
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Input Area - Floating Pill */}
                <div className="p-5 pt-2 z-20">
                    <form 
                        onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} 
                        className={`relative flex items-center gap-2 bg-white dark:bg-gray-800 p-1.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-gray-700 transition-shadow hover:shadow-[0_8px_30px_rgb(0,0,0,0.16)] ${isListening ? 'ring-2 ring-red-500' : 'focus-within:ring-2 focus-within:ring-indigo-500/50'}`}
                    >
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Ask me anything..."
                            className="flex-grow pl-4 py-2 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-gray-800 dark:text-white placeholder-gray-400 text-sm"
                            disabled={isTyping}
                            autoFocus
                        />
                        
                        <div className="flex items-center gap-1 pr-1">
                            <button
                                type="button"
                                onClick={isListening ? stopListening : startListening}
                                className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600'}`}
                                title="Voice Input"
                            >
                                <i className={`fas ${isListening ? 'fa-stop' : 'fa-microphone'}`}></i>
                            </button>
                            
                            <button 
                                type="submit" 
                                disabled={!inputValue.trim() || isTyping}
                                className="w-8 h-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                            >
                                <i className="fas fa-paper-plane text-xs transform translate-x-px translate-y-px"></i>
                            </button>
                        </div>
                    </form>
                    <div className="text-center mt-2">
                        <p className="text-[9px] text-gray-400 dark:text-gray-500">
                            AI can make mistakes. Review generated actions.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
