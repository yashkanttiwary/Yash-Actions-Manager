
import React, { useState } from 'react';
import { testAppsScriptConnection } from '../services/googleSheetService';

interface WelcomeModalProps {
    onConnect: (url: string) => void;
    onSkip: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ onConnect, onSkip }) => {
    const [url, setUrl] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConnect = async () => {
        if (!url.trim()) return;
        setIsVerifying(true);
        setError(null);
        
        try {
            const isValid = await testAppsScriptConnection(url.trim());
            if (isValid) {
                onConnect(url.trim());
            } else {
                setError("Could not connect. Please check the URL and ensure the script is deployed as 'Web App' with access 'Anyone'.");
            }
        } catch (e) {
            setError("Connection failed. Check your internet or the URL.");
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/80 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700 animate-fadeIn">
                <div className="p-8 text-center">
                    <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600 dark:text-indigo-400">
                        <i className="fas fa-rocket text-3xl"></i>
                    </div>
                    
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Welcome to Practical Order</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-8">
                        To get started, please connect your Google Sheet database. This ensures your data is backed up and accessible.
                    </p>

                    <div className="space-y-4 text-left">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 ml-1">
                                Google Apps Script URL
                            </label>
                            <input 
                                type="text" 
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://script.google.com/macros/s/..."
                                className="w-full p-4 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white"
                            />
                            {error && <p className="text-red-500 text-xs mt-2 font-bold"><i className="fas fa-exclamation-circle"></i> {error}</p>}
                        </div>

                        <button 
                            onClick={handleConnect}
                            disabled={!url.trim() || isVerifying}
                            className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 ${isVerifying ? 'bg-indigo-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-0.5'}`}
                        >
                            {isVerifying ? 'Verifying...' : 'Connect Database'}
                        </button>
                    </div>

                    <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
                        <button 
                            onClick={onSkip}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm font-medium transition-colors"
                        >
                            Skip for now (Local Mode)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
        