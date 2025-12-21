
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface AIAssistantModalProps {
    onClose: () => void;
    onProcessCommand: (command: string) => void;
    isLoading: boolean;
    error: string | null;
    onGenerateSummary: () => void;
    summary: string | null;
}

// A global type definition for SpeechRecognition which may be vendor-prefixed
interface IWindow extends Window {
  SpeechRecognition: any;
  webkitSpeechRecognition: any;
}
declare const window: IWindow;

// Safe markdown renderer to avoid XSS (Fix MED-001)
const SafeSummaryRenderer: React.FC<{ text: string }> = ({ text }) => {
    if (!text) return null;

    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];
    let listKey = 0;

    const parseLine = (line: string, index: number) => {
        // Parse bold text **text**
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={`${index}-${i}`} className="font-semibold text-indigo-500 dark:text-indigo-400">{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    lines.forEach((line, index) => {
        if (line.startsWith('## ')) {
            // Flush any pending list items
            if (listItems.length > 0) {
                elements.push(<ul key={`list-${listKey++}`} className="space-y-1 mb-4">{listItems}</ul>);
                listItems = [];
            }
            elements.push(<h3 key={`h3-${index}`} className="text-lg font-semibold mt-4 mb-2 text-gray-800 dark:text-gray-200">{parseLine(line.substring(3), index)}</h3>);
        } else if (line.startsWith('* ')) {
            listItems.push(
                <li key={`li-${index}`} className="flex items-start">
                    <span className="mr-2 mt-1 text-indigo-400">&bull;</span>
                    <span>{parseLine(line.substring(2), index)}</span>
                </li>
            );
        } else {
            // Flush any pending list items
            if (listItems.length > 0) {
                elements.push(<ul key={`list-${listKey++}`} className="space-y-1 mb-4">{listItems}</ul>);
                listItems = [];
            }
            if (line.trim() !== '') {
                elements.push(<p key={`p-${index}`} className="text-gray-600 dark:text-gray-300 mt-2">{parseLine(line, index)}</p>);
            }
        }
    });

    if (listItems.length > 0) {
        elements.push(<ul key={`list-${listKey++}`} className="space-y-1 mb-4">{listItems}</ul>);
    }

    return <div>{elements}</div>;
};

const commandCategories = {
    "✨ Add Task": "Add 'Deploy to production' to To Do with critical priority, due Friday at 5pm.",
    "🔄 Update Task": "Move task 'Develop API' to In Progress.",
    "📅 Set Date": "Set the due date for 'Test payment gateway' to next Monday.",
    "✅ Complete Task": "Mark 'Update user profile page' as complete.",
    "➕ Add Subtask": "Add a subtask 'Research color palettes' to 'Design new logo'.",
    "🚫 Set Blocker": "Add a blocker to 'Deploy to production' with reason 'Waiting for approval'.",
};

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({ onClose, onProcessCommand, isLoading, error, onGenerateSummary, summary }) => {
    const [command, setCommand] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [speechError, setSpeechError] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);

    // Setup Speech Recognition
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setSpeechError("Voice recognition is not supported in this browser.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true; // Prevents cutting off on pauses
        recognition.lang = 'en-US';
        recognition.interimResults = true; // Show results as they are spoken

        recognition.onstart = () => {
            setIsListening(true);
            setSpeechError(null);
        };

        // Update text input with live transcript
        recognition.onresult = (event: any) => {
            const transcript = Array.from(event.results)
                .map((result: any) => result[0])
                .map((result: any) => result.transcript)
                .join('');
            setCommand(transcript);
        };

        recognition.onerror = (event: any) => {
            if (event.error === 'no-speech') {
                setSpeechError('No speech was detected. Please try again.');
            } else if (event.error === 'audio-capture') {
                setSpeechError('Microphone not found. Please ensure it is enabled.');
            } else if (event.error === 'not-allowed') {
                setSpeechError('Permission to use microphone was denied.');
            } else {
                 setSpeechError(`An error occurred: ${event.error}`);
            }
        };
        
        // Simply update listening state on end
        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;
        
        // Cleanup on unmount
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);
    
    const handleSubmitLogic = useCallback(() => {
        if (command.trim() && !isLoading) {
            onProcessCommand(command);
            setCommand('');
        }
    }, [command, isLoading, onProcessCommand]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSubmitLogic();
    };
    
    // Shortcut for submitting the command
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSubmitLogic();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSubmitLogic]);


    const handleToggleListening = () => {
        if (!recognitionRef.current) return;

        if (isListening) {
            recognitionRef.current.stop();
        } else {
            setCommand(''); // Clear previous command before starting
            setSpeechError(null);
            recognitionRef.current.start();
        }
    };
    
    const handleExampleClick = (exampleCommand: string) => {
        setCommand(exampleCommand);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800/80 border border-gray-300 dark:border-gray-600 rounded-2xl shadow-2xl w-full max-w-2xl p-6 sm:p-8 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                 <div className="flex-shrink-0">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
                            <i className="fas fa-magic-sparkles text-indigo-500 dark:text-indigo-400 mr-3"></i>
                            AI Assistant
                        </h2>
                        <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white text-2xl leading-none">&times;</button>
                    </div>

                    <p className="text-gray-600 dark:text-gray-400 mb-4">Manage your tasks with natural language or get a summary of your board.</p>
                </div>
                
                <div className="flex-grow overflow-y-auto pr-4 -mr-4 mb-4">
                    {/* Summary Section */}
                    <div className="bg-gray-100 dark:bg-gray-900/50 p-4 rounded-lg">
                        {!summary && !isLoading && (
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Need an overview?</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-4">Get a summary of your progress and AI-powered advice on what to tackle next.</p>
                                <button
                                    onClick={onGenerateSummary}
                                    disabled={isLoading}
                                    className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors font-semibold disabled:bg-indigo-500/50 disabled:cursor-not-allowed"
                                >
                                    Generate Summary & Advice
                                </button>
                            </div>
                        )}
                        
                        {isLoading && !summary && (
                             <div className="flex flex-col items-center justify-center p-8">
                                <i className="fas fa-spinner fa-spin text-3xl text-indigo-500 dark:text-indigo-400"></i>
                                <p className="mt-4 text-gray-600 dark:text-gray-400">Generating your summary...</p>
                            </div>
                        )}

                        {summary && (
                             <div>
                                <SafeSummaryRenderer text={summary} />
                                <button
                                     onClick={onGenerateSummary}
                                     disabled={isLoading}
                                     className="mt-4 w-full text-center px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm"
                                 >
                                    {isLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-sync-alt mr-2"></i>Regenerate Summary</>}
                                </button>
                             </div>
                        )}
                    </div>

                    {(speechError || error) && (
                        <div className="mt-4 text-center">
                            {speechError && <p className="text-yellow-500 dark:text-yellow-400">{speechError}</p>}
                            {error && <p className="text-red-500 dark:text-red-400">{error}</p>}
                        </div>
                    )}
                </div>

                <div className="flex-shrink-0 pt-4 border-t border-gray-300 dark:border-gray-600">
                     <div className="text-center text-sm text-gray-600 dark:text-gray-400 mb-4">
                        <p className="font-semibold text-gray-700 dark:text-gray-300">Or, give a direct command</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">Click an example or use the microphone to start.</p>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-left">
                            {Object.entries(commandCategories).map(([title, example]) => (
                                <button 
                                    key={title}
                                    onClick={() => handleExampleClick(example)}
                                    className="p-2 rounded-md bg-gray-200 dark:bg-gray-700/50 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-xs w-full"
                                    title={example}
                                >
                                    <p className="font-bold text-gray-800 dark:text-gray-200">{title}</p>
                                    <p className="text-gray-500 dark:text-gray-400 truncate mt-1">"{example}"</p>
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <form onSubmit={handleSubmit}>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={command}
                                onChange={(e) => setCommand(e.target.value)}
                                placeholder={isListening ? "Listening..." : "Type or click the mic to talk..."}
                                className="w-full p-3 bg-gray-100 dark:bg-gray-900/50 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                autoFocus
                                disabled={isLoading}
                            />
                            <button
                                type="button"
                                onClick={handleToggleListening}
                                className={`w-14 px-3 py-2 rounded-lg transition-colors font-semibold flex items-center justify-center ${
                                    isListening 
                                        ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' 
                                        : 'bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                                disabled={!recognitionRef.current || isLoading}
                                title={isListening ? "Stop listening" : "Start listening"}
                                aria-label={isListening ? "Stop voice input" : "Start voice input"}
                            >
                                <i className={`fas fa-fw ${isListening ? 'fa-stop' : 'fa-microphone'}`}></i>
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors font-semibold disabled:bg-indigo-500/50 dark:disabled:bg-indigo-900/50 disabled:cursor-not-allowed"
                                disabled={isLoading || !command.trim()}
                            >
                                {isLoading ? <i className="fas fa-spinner fa-spin"></i> : 'Send'}
                            </button>
                        </div>
                    </form>
                </div>

            </div>
        </div>
    );
};
