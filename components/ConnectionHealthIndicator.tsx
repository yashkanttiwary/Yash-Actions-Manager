import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ConnectionHealth, SettingsTab } from '../types';

interface ConnectionHealthIndicatorProps {
    health: ConnectionHealth;
    onOpenSettings: (tab: SettingsTab) => void;
    onManualPull?: () => Promise<void>;
    onManualPush?: () => Promise<void>;
}

type ItemStatus = 'ok' | 'error' | 'warning' | 'loading' | 'neutral';

const HealthItem: React.FC<{ 
    label: string; 
    status: ItemStatus; 
    message?: string; 
    icon: string;
    onClick?: () => void;
    actionLabel?: string;
}> = ({ label, status, message, icon, onClick, actionLabel }) => {
    let iconColor = "text-gray-400";
    let statusIcon = "fa-circle"; // Default dot
    let bgColor = "bg-gray-50 dark:bg-gray-800/50";
    let borderColor = "border-transparent";

    if (status === 'ok') {
        iconColor = "text-green-500";
        statusIcon = "fa-check-circle";
        bgColor = "bg-green-50 dark:bg-green-900/10";
        borderColor = "border-green-200 dark:border-green-800/30";
    } else if (status === 'error') {
        iconColor = "text-red-500";
        statusIcon = "fa-times-circle";
        bgColor = "bg-red-50 dark:bg-red-900/10";
        borderColor = "border-red-200 dark:border-red-800/30";
    } else if (status === 'warning') {
        iconColor = "text-amber-500";
        statusIcon = "fa-exclamation-circle";
        bgColor = "bg-amber-50 dark:bg-amber-900/10";
        borderColor = "border-amber-200 dark:border-amber-800/30";
    } else if (status === 'loading') {
        iconColor = "text-blue-500";
        statusIcon = "fa-spinner fa-spin";
    }

    return (
        <div 
            className={`flex items-start gap-3 p-3 rounded-xl border ${borderColor} ${bgColor} transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.01]' : ''}`}
            onClick={onClick}
        >
            <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm`}>
                <i className={`${icon} ${status === 'error' ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}></i>
            </div>
            <div className="flex-grow min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                    <span className={`text-sm font-bold ${status === 'neutral' ? 'text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                        {label}
                    </span>
                    <i className={`fas ${statusIcon} ${iconColor} text-base`}></i>
                </div>
                <div className="flex justify-between items-end">
                    <p className={`text-xs ${status === 'error' ? 'text-red-600 dark:text-red-300 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                        {message}
                    </p>
                    {actionLabel && onClick && (
                         <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800">
                            {actionLabel} <i className="fas fa-arrow-right ml-1"></i>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export const ConnectionHealthIndicator: React.FC<ConnectionHealthIndicatorProps> = ({ health, onOpenSettings, onManualPull, onManualPush }) => {
    const [isOpen, setIsOpen] = useState(false);

    // --- LOGIC: Determine Overall System Status ---
    let overallState: 'healthy' | 'warning' | 'critical' | 'syncing' = 'healthy';
    let summaryText = 'System Ready';
    let iconClass = "fas fa-check-circle";

    const isSheetConnected = health.sheet.status === 'connected';
    const isSheetSyncing = isSheetConnected && health.sheet.message?.toLowerCase().includes('syncing');
    const isSheetError = health.sheet.status === 'error';
    
    // Check Auth/API only if we are NOT using script mode (inferred by sheet method or explicit auth status)
    // If auth is optional, we don't treat missing auth as a warning.
    const isAuthRequired = health.auth.status !== 'optional';
    const isAuthMissing = isAuthRequired && health.auth.status !== 'connected';
    const isApiMissing = health.api.status === 'missing' && isAuthRequired;

    if (isSheetError) {
        overallState = 'critical';
        summaryText = 'Sync Failed';
        iconClass = "fas fa-exclamation-triangle";
    } else if (isSheetSyncing) {
        overallState = 'syncing';
        summaryText = 'Syncing...';
        iconClass = "fas fa-sync fa-spin";
    } else if (isSheetConnected) {
        overallState = 'healthy';
        summaryText = 'Sheet Synced';
        iconClass = "fas fa-link";
    } else if (isApiMissing) {
        overallState = 'critical';
        summaryText = 'Setup Required';
        iconClass = "fas fa-tools";
    } else if (isAuthMissing) {
        overallState = 'warning';
        summaryText = 'Disconnected';
        iconClass = "fas fa-plug-circle-xmark";
    } else {
        // Fallback for idle/fresh state
        summaryText = 'Not Connected';
        overallState = 'warning';
        iconClass = "fas fa-circle-notch";
    }

    // Styles for the main trigger button
    const triggerStyles = {
        healthy: "bg-green-100 text-green-700 border-green-200 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
        syncing: "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
        warning: "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
        critical: "bg-red-100 text-red-700 border-red-200 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 animate-pulse-slow"
    };
    
    const handleDeepLink = (tab: SettingsTab) => {
        setIsOpen(false);
        onOpenSettings(tab);
    }

    const modalContent = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsOpen(false)}>
            <div 
                className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden transform transition-all animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                
                {/* Header */}
                <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                    <div>
                        <h3 className="font-bold text-xl text-gray-900 dark:text-white flex items-center gap-2">
                            <i className="fas fa-server text-indigo-500"></i> System Status
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Real-time connection monitoring</p>
                    </div>
                    <button 
                        onClick={() => setIsOpen(false)}
                        className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                        <i className="fas fa-times text-gray-500 dark:text-gray-400"></i>
                    </button>
                </div>
                
                {/* List */}
                <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
                    
                    {/* Manual Sync Controls - New Section */}
                    {health.sheet.status === 'connected' && (onManualPull || onManualPush) && (
                        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/30 mb-3 animate-fadeIn">
                             <h4 className="text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-2 uppercase tracking-wide flex items-center justify-between">
                                <span>Manual Sync</span>
                                <i className="fas fa-sync text-indigo-400"></i>
                             </h4>
                             <div className="flex gap-2">
                                {onManualPull && (
                                    <button 
                                        onClick={() => { onManualPull(); setIsOpen(false); }}
                                        className="flex-1 py-2 px-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center justify-center gap-2 group"
                                        title="Pull latest data from Sheet (Restores remote state)"
                                    >
                                        <i className="fas fa-cloud-download-alt text-gray-400 group-hover:text-indigo-500 transition-colors"></i> Pull
                                    </button>
                                )}
                                {onManualPush && (
                                    <button 
                                        onClick={() => { onManualPush(); setIsOpen(false); }}
                                        className="flex-1 py-2 px-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-green-600 dark:hover:text-green-400 transition-colors flex items-center justify-center gap-2 group"
                                        title="Push local data to Sheet (Overwrites remote)"
                                    >
                                        <i className="fas fa-cloud-upload-alt text-gray-400 group-hover:text-green-500 transition-colors"></i> Push
                                    </button>
                                )}
                             </div>
                        </div>
                    )}

                    {/* Google Sheet Status - Most Important */}
                    <HealthItem 
                        label="Google Sheet Sync" 
                        status={
                            health.sheet.status === 'connected' ? 'ok' : 
                            (health.sheet.status === 'error' ? 'error' : 'neutral')
                        } 
                        message={health.sheet.message || "Not configured"}
                        icon="fas fa-table"
                        onClick={() => handleDeepLink('sheets')}
                        actionLabel="Configure"
                    />

                    {/* Auth Status - Only relevant if NOT optional */}
                    <HealthItem 
                        label="Google Account" 
                        status={
                            health.auth.status === 'connected' ? 'ok' : 
                            (health.auth.status === 'optional' ? 'neutral' : (health.auth.status === 'loading' ? 'loading' : 'warning'))
                        } 
                        message={health.auth.message}
                        icon="fab fa-google"
                        onClick={() => handleDeepLink('api')}
                        actionLabel={health.auth.status === 'optional' ? undefined : "Manage"}
                    />

                    {/* Calendar Status */}
                    <HealthItem 
                        label="Calendar Sync" 
                        status={
                            isApiMissing || isAuthMissing ? 'neutral' : 
                            (health.calendar.status === 'connected' ? 'ok' : (health.calendar.status === 'error' ? 'error' : 'neutral'))
                        }
                        message={health.calendar.message}
                        icon="far fa-calendar-alt"
                        onClick={() => handleDeepLink('calendar')}
                        actionLabel="Configure"
                    />
                    
                    {/* API Key Status - Hide if optional/script mode to reduce noise */}
                    {health.auth.status !== 'optional' && (
                        <HealthItem 
                            label="API Configuration" 
                            status={health.api.status === 'configured' ? 'ok' : 'error'} 
                            message={health.api.message}
                            icon="fas fa-key"
                            onClick={() => handleDeepLink('api')}
                            actionLabel={health.api.status === 'configured' ? 'Edit' : 'Fix'}
                        />
                    )}
                </div>

                {/* Footer Action */}
                <div className="p-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
                    <button 
                        onClick={() => {
                            handleDeepLink('general');
                        }} 
                        className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-indigo-500/30 flex items-center justify-center gap-2 group"
                    >
                        <i className="fas fa-cog group-hover:rotate-90 transition-transform duration-300"></i> 
                        Open All Settings
                    </button>
                    {overallState === 'critical' && (
                        <p className="text-center text-xs text-red-500 mt-3 font-medium">
                            * Required settings are missing or incorrect
                        </p>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <>
            {/* Main Trigger Button */}
            <button 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm border ${triggerStyles[overallState]}`}
                onClick={() => setIsOpen(true)}
                title={`System Status: ${summaryText}`}
            >
                <i className={iconClass}></i>
                <span className="hidden sm:inline">{summaryText}</span>
            </button>

            {/* Render Modal via Portal to escape stacking contexts */}
            {isOpen && createPortal(modalContent, document.body)}
        </>
    );
};