
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

// --- SUB-COMPONENT: Summary Message (Enhanced for Markdown) ---
const SummaryMessage: React.FC<{ text: string }> = ({ text }) => {
    // Simple parser for bold and lists to create a cleaner look
    const parseLine = (line: string, i: number) => {
        // Headers
        if (line.startsWith('## ')) 
            return <h3 key={i} className="text-indigo-600 dark:text-indigo-400 font-bold mt-3 mb-1 text-sm">{line.substring(3)}</h3>;
        if (line.startsWith('### ')) 
            return <h4 key={i} className="text-gray-800 dark:text-gray-200 font-bold mt-2 mb-1 text-xs uppercase tracking-wide">{line.substring(4)}</h4>;
        
        // List Items (Bullet points with * or -)
        let content = line;
        let isList = false;
        if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
            content = line.trim().substring(2);
            isList = true;
        }

        // Bold parsing: **text**
        const parts = content.split(/(\*\*.*?\*\*)/g);
        const parsedContent = parts.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} className="font-bold text-gray-900 dark:text-white">{part.slice(2, -2)}</strong>;
            }
            return part;
        });

        if (isList) {
            return (
                <div key={i} className="flex items-start gap-2 mb-1 ml-1">
                    <span className="text-indigo-500 mt-1">•</span>
                    <span className="flex-1">{parsedContent}</span>
                </div>
            );
        }

        if (line.trim() === '') return <div key={i} className="h-2"></div>;

        return <p key={i} className="mb-1">{parsedContent}</p>;
    };

    return (
        <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed text-gray-700 dark:text-gray-300">
            {text.split('\n').map((line, i) => parseLine(line, i))}
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
        addMessage('user', text);
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

    // Refined Suggestions - Human Readable Titles mapping to Deep Prompts
    const suggestions = [
        { label: "Analyze Workload", query: "Summarize my tasks and tell me if I'm overloaded." },
        { label: "What's Critical?", query: "How many tasks are Critical priority? List them." },
        { label: "Am I Chasing a Future Self?", query: "Review all tasks. Identify which ones are factual necessities versus 'psychological ambitions' (becoming). Explain why." },
        { label: "What Can Be Deleted?", query: "Review my 'To Do' and 'Backlog'. Identify tasks that are not factual necessities but are merely carried over from the past out of habit or fear. Propose deleting them." },
        { label: "Why am I Delaying?", query: "Look at my oldest tasks. Is the delay caused by a technical blocker, or is it the gap between the observer (me) and the observed (the task)? Tell me where I am procrastinating due to an image." },
        { label: "Find Inner Conflict", query: "Identify conflicting priorities. Where does one desire (e.g., 'Relax') friction against another desire (e.g., 'Work hard')? Show me the contradiction." },
        { label: "Order vs. Control", query: "Look at my 'In Progress' column. Am I acting out of intelligence, or am I just suppressing chaos through control? Highlight tasks where I am struggling against the fact." },
        { label: "Am I Doing This for Ego?", query: "Analyze my task descriptions. Am I doing these for the intrinsic function, or for the reward/recognition (the strengthening of the 'me')?" },
        { label: "Just The Facts", query: "Summarize my board, but strip away all adjectives, judgments, and anxiety. Just tell me the raw, chronological facts of what must be done today." },
        { label: "Mirror My Mind", query: "If my task board is a mirror of my mind right now, what does it say about my state of consciousness? Is it fragmented, cluttered, or clear?" },
        { label: "Stop Accumulating", query: "I have accumulated too much. Help me break down the 'Critical' column into immediate, atomic actions so I can act without the burden of the whole." },
        { label: "One Thing Completely", query: "Select the single most factually urgent task. Hide everything else. Tell me to do it completely, without the residue of the previous task." }
    ];

    if (!apiKey) {
        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center" onClick={e => e.stopPropagation()}>
                    <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
                        <i className="fas fa-key text-2xl"></i>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Setup AI Companion</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Enter your Google Gemini API Key to enable chat features.</p>
                    <input 
                        type="password" 
                        value={tempKey} 
                        onChange={e => setTempKey(e.target.value)}
                        placeholder="AIzaSy..." 
                        className="w-full p-3 bg-gray-100 dark:bg-gray-900 rounded-lg border border-gray-300 dark:border-gray-700 mb-4 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button onClick={() => onSaveApiKey(tempKey)} className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700">Connect</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-white/30 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-6" onClick={onClose}>
            <div 
                className="bg-white dark:bg-gray-900 w-full max-w-[500px] h-[650px] max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/20 dark:border-gray-700 animate-in zoom-in-95 duration-200 relative" 
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
                                                <p className="mb-3">{msg.content}</p>
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
