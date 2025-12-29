
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
        <div className="prose prose-sm dark:prose-invert max-w-none text-xs bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700 whitespace-pre-wrap">
            {text.split('\n').map((line, i) => {
                if (line.startsWith('## ')) return <h3 key={i} className="text-indigo-600 dark:text-indigo-400 font-bold mt-2 mb-1">{line.substring(3)}</h3>;
                if (line.startsWith('* ')) return <li key={i} className="ml-4">{line.substring(2)}</li>;
                return <p key={i} className="mb-1">{line}</p>;
            })}
        </div>
    );
};

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({ 
    onClose, onApplyChanges, tasks, apiKey, onSaveApiKey
}) => {
    const [messages, setMessages] = useState<Message[]>([
        { id: 'welcome', role: 'ai', type: 'text', content: "Hi! I'm your Task Companion. I can help you manage your tasks or just answer questions about them. What's on your mind?" }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [tempKey, setTempKey] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    const { isListening, transcript, startListening, stopListening, resetTranscript } = useSpeechRecognition({ continuous: true });

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
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

    const suggestions = [
        "✨ Add task 'Deploy to Prod' on Friday",
        "❓ How many tasks are Critical?",
        "📝 Summarize my 'Work' tasks",
        "🧹 Clear completed tasks"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-6" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 w-full max-w-2xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg">
                            <i className="fas fa-robot"></i>
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">AI Companion</h3>
                            <p className="text-xs text-green-500 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Online
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        <i className="fas fa-times text-gray-500"></i>
                    </button>
                </div>

                {/* Chat Area */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-black/20">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'ai' && (
                                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 mr-2 mt-1 flex-shrink-0">
                                    <i className="fas fa-robot text-xs"></i>
                                </div>
                            )}
                            
                            <div className={`max-w-[85%] rounded-2xl p-3 shadow-sm text-sm ${
                                msg.role === 'user' 
                                    ? 'bg-indigo-600 text-white rounded-br-none' 
                                    : msg.role === 'system' 
                                        ? 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 italic text-xs text-center w-full shadow-none bg-transparent'
                                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-none border border-gray-100 dark:border-gray-700'
                            }`}>
                                {/* Text Message (Normal Chat) */}
                                {msg.type === 'text' && <SummaryMessage text={msg.content} />}
                                
                                {/* Summary Data (Explicit Summary) */}
                                {msg.type === 'summary' && <SummaryMessage text={msg.data} />}
                                
                                {/* Proposal Card (Actions) */}
                                {msg.type === 'proposal' && msg.data && !msg.data.cancelled && (
                                    <>
                                        <p className="mb-2">{msg.content}</p>
                                        <ProposalCard 
                                            diff={msg.data} 
                                            onConfirm={() => handleProposalConfirm(msg.id, msg.data)}
                                            onCancel={() => handleProposalCancel(msg.id)}
                                            isConfirmed={msg.data.confirmed}
                                        />
                                    </>
                                )}
                                {msg.data?.cancelled && <p className="text-gray-400 italic strike-through">Action Cancelled</p>}
                            </div>
                        </div>
                    ))}
                    
                    {isTyping && (
                        <div className="flex justify-start">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 mr-2">
                                <i className="fas fa-robot text-xs"></i>
                            </div>
                            <div className="bg-white dark:bg-gray-800 p-3 rounded-2xl rounded-bl-none border border-gray-100 dark:border-gray-700 flex gap-1 items-center">
                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Suggestions (Only if emptyish) */}
                {messages.length < 3 && !isTyping && (
                    <div className="px-4 pb-2">
                        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                            {suggestions.map((s, i) => (
                                <button 
                                    key={i} 
                                    onClick={() => handleSendMessage(s.replace(/✨ |❓ |📝 |🧹 /g, ''))}
                                    className="whitespace-nowrap px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-500 transition-colors shadow-sm"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Input Bar */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="relative flex items-center gap-2">
                        <div className="relative flex-grow">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Type a command..."
                                className="w-full pl-4 pr-10 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl border-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white placeholder-gray-500"
                                disabled={isTyping}
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={isListening ? stopListening : startListening}
                                className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-gray-400 hover:text-indigo-500'}`}
                            >
                                <i className={`fas ${isListening ? 'fa-stop' : 'fa-microphone'}`}></i>
                            </button>
                        </div>
                        <button 
                            type="submit" 
                            disabled={!inputValue.trim() || isTyping}
                            className="w-12 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-indigo-500/30"
                        >
                            <i className="fas fa-paper-plane"></i>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};
