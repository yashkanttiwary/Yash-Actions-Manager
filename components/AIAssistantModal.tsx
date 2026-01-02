
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

// --- SUB-COMPONENT: Summary Message ---
const SummaryMessage: React.FC<{ text: string }> = ({ text }) => {
    return (
        <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {text.split('\n').map((line, i) => {
                if (line.startsWith('## ')) return <h3 key={i} className="text-indigo-600 dark:text-indigo-400 font-bold mt-2 mb-1 text-sm">{line.substring(3)}</h3>;
                if (line.startsWith('* ')) return <li key={i} className="ml-4">{line.substring(2)}</li>;
                return <p key={i} className="mb-1">{line}</p>;
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

    const suggestions = [
        { label: "Analyze my workload", query: "Summarize my tasks and tell me if I'm overloaded." },
        { label: "Add 'Deploy' on Friday", query: "Add a high priority task 'Deploy to Prod' for next Friday" },
        { label: "What's critical?", query: "How many tasks are Critical priority?" },
        { label: "Clear completed", query: "Delete all tasks that are marked as Done" }
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
                className="bg-white dark:bg-gray-900 w-full max-w-2xl h-[85vh] md:h-[800px] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-white/20 dark:border-gray-700 animate-in zoom-in-95 duration-200 relative" 
                onClick={e => e.stopPropagation()}
            >
                {/* Background Decor */}
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
                    <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-3xl"></div>
                </div>

                {/* Header */}
                <div className="p-5 flex justify-between items-center z-10">
                    <div className="flex items-center gap-3">
                        <i className="fas fa-sparkles text-indigo-500 text-lg"></i>
                        <h3 className="font-bold text-gray-900 dark:text-white text-lg">AI Assist</h3>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <i className="fas fa-times text-gray-400"></i>
                    </button>
                </div>

                {/* Content Area */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 z-10 scroll-smooth custom-scrollbar">
                    
                    {!hasStartedChat ? (
                        /* HERO / EMPTY STATE */
                        <div className="h-full flex flex-col items-center justify-center text-center pb-20 animate-fadeIn">
                            <div className="relative mb-8">
                                <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full"></div>
                                <div className="relative w-24 h-24 bg-gradient-to-tr from-blue-100 to-indigo-100 dark:from-indigo-900/50 dark:to-blue-900/50 rounded-full flex items-center justify-center shadow-lg border border-white/50 dark:border-white/10">
                                    <i className="fas fa-robot text-4xl text-indigo-600 dark:text-indigo-400"></i>
                                </div>
                            </div>
                            
                            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-3">
                                How can I help you today?
                            </h2>
                            <p className="text-gray-500 dark:text-gray-400 mb-10 max-w-sm">
                                I can organize your tasks, analyze your workload, or help you break down complex goals.
                            </p>

                            <div className="w-full max-w-md space-y-3">
                                {suggestions.map((s, i) => (
                                    <button 
                                        key={i}
                                        onClick={() => handleSendMessage(s.query)}
                                        className="w-full text-left p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800 hover:shadow-md transition-all group flex items-center justify-between"
                                    >
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{s.label}</span>
                                        <i className="fas fa-arrow-right text-gray-300 group-hover:text-indigo-500 transition-colors opacity-0 group-hover:opacity-100 transform -translate-x-2 group-hover:translate-x-0 duration-200"></i>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* CHAT HISTORY */
                        <div className="space-y-6 pb-4">
                            {messages.slice(1).map((msg) => (
                                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`max-w-[90%] md:max-w-[80%] rounded-2xl p-4 text-sm shadow-sm ${
                                        msg.role === 'user' 
                                            ? 'bg-indigo-600 text-white rounded-br-none' 
                                            : msg.role === 'system' 
                                                ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800 w-full text-center italic'
                                                : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-none border border-gray-100 dark:border-gray-700'
                                    }`}>
                                        {/* Content */}
                                        {msg.type === 'text' && <SummaryMessage text={msg.content} />}
                                        
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
                                <div className="flex justify-start">
                                    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl rounded-bl-none border border-gray-100 dark:border-gray-700 flex gap-1.5 items-center w-16 h-10 shadow-sm">
                                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Input Area - Floating Pill */}
                <div className="p-6 pt-2 z-20">
                    <form 
                        onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} 
                        className={`relative flex items-center gap-2 bg-white dark:bg-gray-800 p-2 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-gray-700 transition-shadow hover:shadow-[0_8px_30px_rgb(0,0,0,0.16)] ${isListening ? 'ring-2 ring-red-500' : 'focus-within:ring-2 focus-within:ring-indigo-500/50'}`}
                    >
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Ask me anything..."
                            className="flex-grow pl-4 py-2 bg-transparent border-none focus:ring-0 text-gray-800 dark:text-white placeholder-gray-400"
                            disabled={isTyping}
                            autoFocus
                        />
                        
                        <div className="flex items-center gap-1 pr-1">
                            <button
                                type="button"
                                onClick={isListening ? stopListening : startListening}
                                className={`w-9 h-9 flex items-center justify-center rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600'}`}
                                title="Voice Input"
                            >
                                <i className={`fas ${isListening ? 'fa-stop' : 'fa-microphone'}`}></i>
                            </button>
                            
                            <button 
                                type="submit" 
                                disabled={!inputValue.trim() || isTyping}
                                className="w-9 h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                            >
                                <i className="fas fa-paper-plane text-xs transform translate-x-px translate-y-px"></i>
                            </button>
                        </div>
                    </form>
                    <div className="text-center mt-2">
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                            AI can make mistakes. Review generated actions.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
