
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Settings, SettingsTab } from '../types';
import { initGoogleClient } from '../services/googleAuthService';
import { initializeSheetHeaders, testAppsScriptConnection } from '../services/googleSheetService';

const timezones = [
    'UTC', 'GMT',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney'
];

interface IntegrationsModalProps {
    settings: Settings;
    onUpdateSettings: (newSettings: Partial<Settings>) => void;
    onClose: () => void;
    googleAuthState: {
        gapiLoaded: boolean;
        gisLoaded: boolean;
        isSignedIn: boolean;
        error?: Error;
        disabled?: boolean;
    };
    onGoogleSignIn: () => void;
    onGoogleSignOut: () => void;
    initialTab?: SettingsTab; // New Prop
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

// --- Helper Components ---

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button 
            onClick={handleCopy}
            className="group flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg border border-gray-200 dark:border-gray-700 transition-all"
            title="Copy to clipboard"
        >
            <i className={`fas ${copied ? 'fa-check text-green-500' : 'fa-copy'}`}></i>
            {label && <span>{copied ? 'Copied!' : label}</span>}
        </button>
    );
};

const ExternalLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
    <a 
        href={href} 
        target="_blank" 
        rel="noreferrer" 
        className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium hover:underline"
    >
        {children}
        <i className="fas fa-external-link-alt text-[10px]"></i>
    </a>
);

const Step: React.FC<{ num: number; title: string; children: React.ReactNode }> = ({ num, title, children }) => (
    <div className="flex gap-4">
        <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center font-bold text-sm border border-indigo-200 dark:border-indigo-800">
            {num}
        </div>
        {/* Added min-w-0 to prevent flex item from overflowing parent */}
        <div className="flex-grow min-w-0 pb-6 border-l-2 border-gray-100 dark:border-gray-800 ml-[-20px] pl-9 last:border-0 last:pb-0">
            <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h4>
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                {children}
            </div>
        </div>
    </div>
);

const CodeBlock: React.FC<{ code: string }> = ({ code }) => (
    <div className="relative group rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 mt-2 w-full max-w-full">
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <CopyButton text={code} label="Copy Code" />
        </div>
        <pre className="p-4 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap break-words">
            {code}
        </pre>
    </div>
);

// --- NEW: Info Tooltip Component (Portal Version) ---
const ModeComparisonTooltip: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, alignLeft: false, alignRight: false });

    // Calculate position on open
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const tooltipWidth = 500; // Approx Max width on desktop
            const windowWidth = window.innerWidth;
            
            let top = rect.bottom + 10;
            let left = rect.left + (rect.width / 2);
            let alignLeft = false;
            let alignRight = false;

            // Check left boundary (prevent going off screen left)
            if (left - (tooltipWidth / 2) < 20) {
                left = Math.max(20, rect.left); 
                alignLeft = true;
            } 
            // Check right boundary (prevent going off screen right)
            else if (left + (tooltipWidth / 2) > windowWidth - 20) {
                left = windowWidth - 20; 
                alignRight = true;
            }

            setCoords({ top, left, alignLeft, alignRight });
        }
    }, [isOpen]);

    // Close on scroll/resize to prevent detached UI
    useEffect(() => {
        if (!isOpen) return;
        const handleScroll = () => setIsOpen(false);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleScroll);
        return () => {
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleScroll);
        };
    }, [isOpen]);

    const tooltipContent = (
        <div className="fixed inset-0 z-[99999]" onClick={() => setIsOpen(false)}>
             {/* Invisible backdrop to handle click-outside */}
            <div 
                className="absolute bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-w-[90vw] w-[340px] md:w-[500px]"
                style={{ 
                    top: coords.top, 
                    left: coords.left,
                    transform: coords.alignLeft ? 'none' : (coords.alignRight ? 'translateX(-100%)' : 'translateX(-50%)')
                }}
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-gray-50 dark:bg-gray-800 p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h4 className="font-bold text-gray-800 dark:text-white text-sm">Integration Modes Compared</h4>
                    <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"><i className="fas fa-times"></i></button>
                </div>
                
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    {/* Easy Mode Column */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="p-1.5 bg-indigo-100 text-indigo-600 rounded-md"><i className="fas fa-magic"></i></span>
                            <strong className="text-gray-800 dark:text-white text-sm">Easy Mode</strong>
                        </div>
                        <p className="text-gray-500 italic mb-2">Best for quick backup without technical setup.</p>
                        
                        <ul className="space-y-1.5">
                            <li className="flex items-start gap-2 text-green-600 dark:text-green-400">
                                <i className="fas fa-check mt-0.5"></i>
                                <span>No Setup (Copy-Paste)</span>
                            </li>
                            <li className="flex items-start gap-2 text-green-600 dark:text-green-400">
                                <i className="fas fa-check mt-0.5"></i>
                                <span>No Client ID Needed</span>
                            </li>
                            <li className="flex items-start gap-2 text-red-500 dark:text-red-400">
                                <i className="fas fa-times mt-0.5"></i>
                                <span>No Calendar Sync</span>
                            </li>
                            <li className="flex items-start gap-2 text-red-500 dark:text-red-400">
                                <i className="fas fa-times mt-0.5"></i>
                                <span>Slower Sync (Via Proxy)</span>
                            </li>
                        </ul>
                    </div>

                    {/* Advanced Mode Column */}
                    <div className="space-y-2 border-t sm:border-t-0 sm:border-l border-gray-100 dark:border-gray-700 pt-4 sm:pt-0 sm:pl-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="p-1.5 bg-gray-100 text-gray-600 rounded-md"><i className="fas fa-code"></i></span>
                            <strong className="text-gray-800 dark:text-white text-sm">Advanced Mode</strong>
                        </div>
                        <p className="text-gray-500 italic mb-2">For power users wanting full Google integration.</p>

                        <ul className="space-y-1.5">
                            <li className="flex items-start gap-2 text-green-600 dark:text-green-400">
                                <i className="fas fa-check mt-0.5"></i>
                                <span>Google Calendar Sync</span>
                            </li>
                            <li className="flex items-start gap-2 text-green-600 dark:text-green-400">
                                <i className="fas fa-check mt-0.5"></i>
                                <span>Instant Two-Way Sync</span>
                            </li>
                            <li className="flex items-start gap-2 text-green-600 dark:text-green-400">
                                <i className="fas fa-check mt-0.5"></i>
                                <span>Smart Auto-Refresh</span>
                            </li>
                            <li className="flex items-start gap-2 text-amber-500 dark:text-amber-400">
                                <i className="fas fa-exclamation-triangle mt-0.5"></i>
                                <span>Complex Setup (Cloud Console)</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <>
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(true)}
                className="ml-2 text-indigo-500 hover:text-indigo-600 transition-colors focus:outline-none"
                title="Click for comparison details"
            >
                <i className="fas fa-info-circle text-lg"></i>
            </button>
            {isOpen && createPortal(tooltipContent, document.body)}
        </>
    );
};

// --- Content Constants ---

const APPS_SCRIPT_CODE = `
// 🚀 TASK MANAGER DATABASE SCRIPT (ULTIMATE EDITION v7)
// This script provides a professional-grade database interface for your task manager.
// Includes strict column alignment, crash prevention, and robust formatting.

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000); // Prevent concurrent write collisions

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var params = e.parameter || {};
    var postData = e.postData ? JSON.parse(e.postData.contents) : {};
    
    var action = params.action || postData.action || 'sync_down';

    // 1. Connection Check
    if (action === 'check') {
       return jsonResponse({status: 'ok'});
    }

    // 2. Sync Up (App -> Sheet) - Overwrite Sheet
    if (action === 'sync_up') {
      sheet.clear(); // Clear EVERYTHING to prevent data mismatch
      
      // STRICT HEADER DEFINITION (15 Columns)
      var headers = [
          'ID', 'Title', 'Status', 'Priority', 'Due Date', 
          'Time Est (h)', 'Actual Time (s)', 'Tags', 'Scheduled Start', 
          'Blockers', 'Dependencies', 'Subtasks', 'Description', 
          'Last Modified', 'JSON_DATA'
      ];
      sheet.appendRow(headers);
      
      var rows = postData.rows;
      if (rows && rows.length > 0) {
        // Write data in bulk
        // CRITICAL: Use setValues with exact dimensions to avoid errors
        sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
      }
      
      // APPLY PROFESSIONAL FORMATTING
      // We wrap this in a try-catch so it doesn't break the data sync if it fails
      try {
        applyFormatting(sheet);
      } catch (fmtError) {
        // Log error but continue
        console.error("Formatting failed: " + fmtError);
      }

      return jsonResponse({status: 'success', written: rows ? rows.length : 0});
    }
    
    // 3. Sync Down (Sheet -> App) - Read Database
    var data = sheet.getDataRange().getValues();
    
    // Remove header row if exists
    if (data.length > 0 && data[0][0] === 'ID') {
      data.shift();
    }
    
    return jsonResponse(data);
    
  } catch (err) {
    return jsonResponse({status: 'error', message: err.toString()});
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// 🎨 APPLY PROFESSIONAL VISUAL FORMATTING
function applyFormatting(sheet) {
  // 1. ENSURE GRID SIZE
  // Prevents "Range not found" errors if sheet is too small
  var requiredRows = Math.max(sheet.getLastRow(), 50); 
  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
  }
  
  var lastRow = sheet.getMaxRows();
  var lastCol = 15; // Column O

  // 2. HEADER STYLING
  var headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground("#1e293b") // Dark Slate
             .setFontColor("#f8fafc")  // White-ish
             .setFontWeight("bold")
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle")
             .setWrap(true);
  
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 45); 

  // 3. DATA VALIDATION (DROPDOWNS)
  // Ensure ranges are valid (Row 2 to lastRow)
  if (lastRow > 1) {
      // Status (Column C / Index 3)
      var statusRange = sheet.getRange(2, 3, lastRow - 1, 1);
      var statusRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['To Do', 'In Progress', 'Review', 'Blocker', 'Hold', "Won't Complete", 'Done'])
        .setAllowInvalid(true)
        .build();
      statusRange.setDataValidation(statusRule);
      
      // Priority (Column D / Index 4)
      var priorityRange = sheet.getRange(2, 4, lastRow - 1, 1);
      var priorityRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['Critical', 'High', 'Medium', 'Low'])
        .setAllowInvalid(true)
        .build();
      priorityRange.setDataValidation(priorityRule);

      // 4. CONDITIONAL FORMATTING
      sheet.clearConditionalFormatRules(); 
      var rules = [];
      
      // Helper to make rules easier
      function addColorRule(text, bg, color, range) {
         rules.push(SpreadsheetApp.newConditionalFormatRule()
            .whenTextEqualTo(text)
            .setBackground(bg)
            .setFontColor(color)
            .setRanges([range])
            .build());
      }

      // Status Colors
      addColorRule("Done", "#dcfce7", "#14532d", statusRange);       // Green
      addColorRule("In Progress", "#dbeafe", "#1e3a8a", statusRange); // Blue
      addColorRule("Blocker", "#fee2e2", "#7f1d1d", statusRange);     // Red
      addColorRule("To Do", "#f1f5f9", "#334155", statusRange);       // Slate
      addColorRule("Review", "#f3e8ff", "#581c87", statusRange);      // Purple
      
      // Priority Colors
      addColorRule("Critical", "#fee2e2", "#7f1d1d", priorityRange);  // Red
      addColorRule("High", "#ffedd5", "#7c2d12", priorityRange);      // Orange
      addColorRule("Medium", "#fef9c3", "#713f12", priorityRange);    // Yellow

      sheet.setConditionalFormatRules(rules);
  }

  // 5. COLUMN SIZING (Precise)
  sheet.setColumnWidth(1, 100);  // ID
  sheet.setColumnWidth(2, 250);  // Title
  sheet.setColumnWidth(3, 130);  // Status
  sheet.setColumnWidth(4, 100);  // Priority
  sheet.setColumnWidth(5, 100);  // Due Date
  sheet.setColumnWidth(6, 80);   // Time Est
  sheet.setColumnWidth(7, 80);   // Actual Time
  sheet.setColumnWidth(8, 150);  // Tags
  sheet.setColumnWidth(9, 140);  // Scheduled
  sheet.setColumnWidth(10, 200); // Blockers
  sheet.setColumnWidth(11, 150); // Deps
  sheet.setColumnWidth(12, 200); // Subtasks
  sheet.setColumnWidth(13, 300); // Desc
  sheet.setColumnWidth(14, 140); // Last Mod
  sheet.setColumnWidth(15, 50);  // JSON (Minimize)

  // 6. CLEANUP
  sheet.hideColumns(15); // Hide JSON Column
  
  // Apply Banding (safe check)
  var range = sheet.getRange(2, 1, Math.max(1, lastRow - 1), 14);
  if (range.getNumRows() > 0) {
      // Remove old banding first to avoid collision
      try { range.getBandings().forEach(b => b.remove()); } catch(e) {} 
      try { range.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY); } catch(e) {}
  }
}

// ⚡ AUTOMATIC UPDATE TRIGGER
function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var row = range.getRow();
  var col = range.getColumn();
  
  if (row <= 1) return;
  // 14 = Last Modified Column (N)
  if (col === 14 || col === 15) return; 

  var timestamp = new Date().toISOString();
  sheet.getRange(row, 14).setValue(timestamp);
}
`;


export const IntegrationsModal: React.FC<IntegrationsModalProps> = ({
    settings,
    onUpdateSettings,
    onClose,
    googleAuthState,
    onGoogleSignIn,
    onGoogleSignOut,
    initialTab = 'general'
}) => {
    const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
    const [sheetMethod, setSheetMethod] = useState<'script' | 'api'>(settings.googleAppsScriptUrl ? 'script' : 'api');
    
    const [apiKeys, setApiKeys] = useState({
        apiKey: settings.googleApiKey || '',
        clientId: settings.googleClientId || ''
    });
    
    // Sheet ID Local State
    const [sheetIdInput, setSheetIdInput] = useState(settings.googleSheetId || '');
    const [scriptUrlInput, setScriptUrlInput] = useState(settings.googleAppsScriptUrl || '');
    const [sheetStatus, setSheetStatus] = useState<ConnectionStatus>('idle');
    const [sheetErrorDetail, setSheetErrorDetail] = useState('');

    const labelClass = "block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1";
    const inputClass = "w-full p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-gray-800 dark:text-white";
    const sectionClass = "bg-white dark:bg-gray-900/50 rounded-xl p-4 md:p-6 border border-gray-200 dark:border-gray-700 shadow-sm";

    // Update active tab if prop changes (allows deep linking)
    useEffect(() => {
        if(initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    // Update local state if settings change externally
    useEffect(() => {
        if (settings.googleSheetId) {
            setSheetIdInput(settings.googleSheetId);
            if (sheetMethod === 'api') setSheetStatus('success');
        }
        if (settings.googleAppsScriptUrl) {
            setScriptUrlInput(settings.googleAppsScriptUrl);
            if (sheetMethod === 'script') setSheetStatus('success');
        }
    }, [settings.googleSheetId, settings.googleAppsScriptUrl]);

    // Ensure sheetStatus is updated when switching methods if a connection exists
    useEffect(() => {
        if (sheetMethod === 'script' && settings.googleAppsScriptUrl) {
            setSheetStatus('success');
        } else if (sheetMethod === 'api' && settings.googleSheetId) {
            setSheetStatus('success');
        } else {
            setSheetStatus('idle');
        }
    }, [sheetMethod, settings.googleAppsScriptUrl, settings.googleSheetId]);


    const handleSaveApiKeys = async () => {
        onUpdateSettings({
            googleApiKey: apiKeys.apiKey,
            googleClientId: apiKeys.clientId
        });
        if (apiKeys.apiKey && apiKeys.clientId) {
            try {
                await initGoogleClient(apiKeys.apiKey, apiKeys.clientId);
                alert("✅ API Configuration updated successfully. Please click 'Connect Google' to finish.");
            } catch (e) {
                alert("⚠️ Saved, but failed to initialize. Please check if the keys are correct.");
            }
        }
    };

    const handleDisconnect = () => {
        if (window.confirm("Are you sure you want to disconnect? This will stop syncing, but your data on the sheet remains safe.")) {
            if (sheetMethod === 'script') {
                 onUpdateSettings({ googleAppsScriptUrl: '' });
                 setScriptUrlInput('');
            } else {
                 onUpdateSettings({ googleSheetId: '' });
                 setSheetIdInput('');
            }
            setSheetStatus('idle');
        }
    };
    
    const handleConnectSheet = async () => {
        setSheetStatus('testing');
        setSheetErrorDetail('');

        if (sheetMethod === 'api') {
            // ORIGINAL METHOD (CLIENT ID)
            if (!sheetIdInput.trim()) {
                setSheetStatus('error');
                setSheetErrorDetail('Please enter a Sheet ID.');
                return;
            }
            if (!googleAuthState.isSignedIn) {
                setSheetStatus('error');
                setSheetErrorDetail('Please connect your Google Account first.');
                return;
            }
            try {
                await initializeSheetHeaders(sheetIdInput.trim());
                onUpdateSettings({ googleSheetId: sheetIdInput.trim(), googleAppsScriptUrl: '' }); // Clear other method
                setSheetStatus('success');
            } catch (error: any) {
                console.error("Sheet connection failed:", error);
                setSheetStatus('error');
                if (error.result?.error?.code === 403) setSheetErrorDetail("Permission Denied.");
                else setSheetErrorDetail("Connection failed. Check ID.");
            }
        } else {
            // NEW METHOD (APPS SCRIPT)
            if (!scriptUrlInput.trim()) {
                setSheetStatus('error');
                setSheetErrorDetail('Please enter the Web App URL.');
                return;
            }
            try {
                const isValid = await testAppsScriptConnection(scriptUrlInput.trim());
                if (isValid) {
                    onUpdateSettings({ googleAppsScriptUrl: scriptUrlInput.trim(), googleSheetId: '' }); // Clear other method
                    setSheetStatus('success');
                } else {
                    setSheetStatus('error');
                    setSheetErrorDetail("Script test failed. Ensure 'Who has access' is 'Anyone'.");
                }
            } catch (error) {
                setSheetStatus('error');
                setSheetErrorDetail("Connection failed. Check URL.");
            }
        }
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'general':
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className={sectionClass}>
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                                <i className="fas fa-sliders-h text-indigo-500"></i> General Preferences
                            </h3>
                            <div className="grid gap-6">
                                <div>
                                    <label htmlFor="dailyBudget" className={labelClass}>Daily Time Budget (hours)</label>
                                    <input
                                        id="dailyBudget"
                                        type="number"
                                        value={settings.dailyBudget}
                                        onChange={(e) => onUpdateSettings({ dailyBudget: parseInt(e.target.value) || 16 })}
                                        className={inputClass}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Goal for productive hours per day (affects progress bar).</p>
                                </div>
                                <div>
                                    <label htmlFor="timezone" className={labelClass}>Timezone</label>
                                    <select
                                        id="timezone"
                                        value={settings.timezone}
                                        onChange={(e) => onUpdateSettings({ timezone: e.target.value })}
                                        className={inputClass}
                                    >
                                        {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'sheets':
                return (
                    <div className="space-y-6 animate-fadeIn">
                        {/* Method Selection Toggle */}
                        <div className="flex items-center gap-2 mb-2">
                             <div className="flex-grow flex p-1 bg-gray-200 dark:bg-gray-800 rounded-lg">
                                <button
                                    onClick={() => { setSheetMethod('script'); setSheetStatus('idle'); }}
                                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${sheetMethod === 'script' ? 'bg-white dark:bg-gray-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}
                                >
                                    <i className="fas fa-magic mr-2"></i> Easy Mode
                                </button>
                                <button
                                    onClick={() => { setSheetMethod('api'); setSheetStatus('idle'); }}
                                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${sheetMethod === 'api' ? 'bg-white dark:bg-gray-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}
                                >
                                    <i className="fas fa-code mr-2"></i> Advanced Mode
                                </button>
                            </div>
                            {/* Comparison Tooltip in Sheets Tab */}
                            <ModeComparisonTooltip />
                        </div>


                        {sheetMethod === 'script' ? (
                            // APPS SCRIPT UI
                            <div className="animate-fadeIn space-y-6">
                                
                                {/* RE-DEPLOYMENT WARNING */}
                                <div className="p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3">
                                    <div className="mt-1">
                                        <i className="fas fa-exclamation-triangle text-amber-500 text-xl animate-pulse"></i>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 dark:text-white">Action Required: Update Script! (v7)</h4>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                                            If your sheet columns are mismatched or look weird, you MUST re-deploy the script. 
                                            We updated the code to fix column alignment issues.
                                        </p>
                                    </div>
                                </div>

                                <div className={sectionClass}>
                                    <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white mb-4">
                                        <i className="fas fa-link text-green-500"></i> No Client ID Required
                                    </h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                                        This method uses a small script inside your Google Sheet to create a secure link. 
                                        You do <strong>not</strong> need to set up Google Cloud Console or Client IDs.
                                    </p>
                                    
                                    <div>
                                        <label className={labelClass}>Web App URL</label>
                                        
                                        {/* CONDITIONAL RENDER: Show Connected State or Input Field */}
                                        {sheetStatus === 'success' ? (
                                            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center justify-between animate-fadeIn">
                                                <div className="flex items-center gap-3">
                                                     <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-800 flex items-center justify-center text-green-600 dark:text-green-300">
                                                        <i className="fas fa-link"></i>
                                                     </div>
                                                     <div>
                                                         <h4 className="font-bold text-gray-900 dark:text-white">Connected via Script</h4>
                                                         <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-[200px] md:max-w-[300px]">
                                                            {settings.googleAppsScriptUrl ? settings.googleAppsScriptUrl.substring(0, 40) + '...' : 'URL Saved'}
                                                         </p>
                                                     </div>
                                                </div>
                                                <button 
                                                    onClick={handleDisconnect}
                                                    className="px-4 py-2 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-bold rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors shadow-sm"
                                                >
                                                    Disconnect
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex flex-col sm:flex-row gap-3">
                                                    <div className="flex-grow w-full">
                                                        <input
                                                            type="text"
                                                            value={scriptUrlInput}
                                                            onChange={(e) => setScriptUrlInput(e.target.value)}
                                                            placeholder="https://script.google.com/macros/s/..."
                                                            className={inputClass}
                                                            disabled={sheetStatus === 'testing'}
                                                        />
                                                    </div>
                                                    <button 
                                                        onClick={handleConnectSheet}
                                                        disabled={sheetStatus === 'testing' || !scriptUrlInput.trim()}
                                                        className={`w-full sm:w-auto px-6 py-2.5 rounded-lg font-medium transition-colors whitespace-nowrap text-white shadow-md flex items-center justify-center gap-2 ${
                                                            sheetStatus === 'testing' ? 'bg-indigo-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700'
                                                        }`}
                                                    >
                                                        {sheetStatus === 'testing' ? 'Verifying...' : 'Connect'}
                                                    </button>
                                                </div>
                                                {sheetStatus === 'error' && (
                                                    <div className="mt-2 text-sm text-red-500 font-bold animate-fadeIn">
                                                        <i className="fas fa-exclamation-circle mr-1"></i> {sheetErrorDetail}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 border border-gray-200 dark:border-gray-700 w-full overflow-hidden">
                                    <h4 className="font-bold mb-4 text-gray-900 dark:text-white">Setup Instructions (Do this once)</h4>
                                    
                                    <Step num={1} title="Create a Sheet & Open Script Editor">
                                        <p>Create a new Google Sheet. Go to <strong>Extensions &gt; Apps Script</strong>.</p>
                                    </Step>
                                    <Step num={2} title="Paste the Magic Code">
                                        <p>Delete any code there and paste this exactly:</p>
                                        <CodeBlock code={APPS_SCRIPT_CODE} />
                                    </Step>
                                    <Step num={3} title="Deploy as Web App (Crucial Step!)">
                                        <div className="space-y-3">
                                            <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                                                <strong className="block text-gray-800 dark:text-gray-200 mb-1">A. Open Deployment Menu</strong>
                                                <p>At the top right, click the blue button <strong>Deploy</strong>, then select <strong>New deployment</strong>.</p>
                                            </div>
                                            
                                            <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                                                <strong className="block text-gray-800 dark:text-gray-200 mb-1">B. Configure Settings</strong>
                                                <ul className="list-disc list-inside pl-1 space-y-1">
                                                    <li>Click the gear icon <i className="fas fa-cog"></i> next to "Select type" and choose <strong>Web app</strong>.</li>
                                                    <li><strong>Execute as:</strong> Select <strong>"Me"</strong> (your email).</li>
                                                    <li>
                                                        <strong>Who has access:</strong> Select <strong>"Anyone"</strong>.
                                                        <span className="block text-xs text-amber-600 dark:text-amber-400 mt-0.5 bg-amber-50 dark:bg-amber-900/20 p-1 rounded">
                                                            <i className="fas fa-exclamation-triangle mr-1"></i>
                                                            IMPORTANT: If you don't choose "Anyone", the sync will fail!
                                                        </span>
                                                    </li>
                                                </ul>
                                            </div>

                                            <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                                                <strong className="block text-gray-800 dark:text-gray-200 mb-1">C. Authorize & Copy</strong>
                                                <ol className="list-decimal list-inside pl-1 space-y-1">
                                                    <li>Click <strong>Deploy</strong>.</li>
                                                    <li>Click <strong>Authorize access</strong> → Select your Google Account.</li>
                                                    <li>If you see "Google hasn't verified this app":
                                                        <ul className="pl-5 text-xs text-gray-500 mt-1">
                                                             <li>Click <strong>Advanced</strong> (bottom left).</li>
                                                             <li>Click <strong>Go to (Untitled project) (unsafe)</strong>.</li>
                                                             <li>Click <strong>Allow</strong>.</li>
                                                        </ul>
                                                    </li>
                                                    <li>Copy the <strong>Web App URL</strong> and paste it above.</li>
                                                </ol>
                                            </div>
                                        </div>
                                    </Step>
                                </div>
                            </div>
                        ) : (
                            // API UI (LEGACY)
                            <div className="animate-fadeIn space-y-6">
                                <div className={sectionClass}>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                                            <i className="fas fa-table text-indigo-500"></i> Direct API Connection
                                        </h3>
                                        {renderAuthButton()}
                                    </div>
                                    <p className="text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded mb-4">
                                        <strong>Note:</strong> This method requires a Google Client ID in the "API & Keys" tab and for you to log in.
                                    </p>
                                    
                                    <label className={labelClass}>Google Sheet ID</label>
                                    
                                    {/* CONDITIONAL RENDER FOR API MODE */}
                                    {sheetStatus === 'success' ? (
                                        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center justify-between animate-fadeIn">
                                            <div className="flex items-center gap-3">
                                                 <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-800 flex items-center justify-center text-green-600 dark:text-green-300">
                                                    <i className="fas fa-check-circle"></i>
                                                 </div>
                                                 <div>
                                                     <h4 className="font-bold text-gray-900 dark:text-white">API Connected</h4>
                                                     <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-[200px]">
                                                        ID: {settings.googleSheetId}
                                                     </p>
                                                 </div>
                                            </div>
                                            <button 
                                                onClick={handleDisconnect}
                                                className="px-4 py-2 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-bold rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors shadow-sm"
                                            >
                                                Disconnect
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex flex-col sm:flex-row gap-3">
                                                <div className="flex-grow w-full">
                                                    <input
                                                        type="text"
                                                        value={sheetIdInput}
                                                        onChange={(e) => setSheetIdInput(e.target.value)}
                                                        placeholder="1BxiMVs0..."
                                                        className={inputClass}
                                                    />
                                                </div>
                                                <button 
                                                    onClick={handleConnectSheet}
                                                    className="w-full sm:w-auto px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center justify-center"
                                                >
                                                    Connect
                                                </button>
                                            </div>
                                            {sheetStatus === 'error' && <p className="text-red-500 text-sm mt-2 font-bold">{sheetErrorDetail}</p>}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                );

            case 'api':
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className={sectionClass}>
                             <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    API Configuration 
                                    {/* Comparison Tooltip in API Tab */}
                                    <ModeComparisonTooltip />
                                </h3>
                            </div>
                            
                            <p className="text-sm text-gray-500 mb-4">
                                <strong>Only needed for Advanced Mode.</strong> 
                                If you use Easy Mode for Sheets, you can leave this blank.
                            </p>
                            
                             <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800 mb-6">
                                <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-2">
                                    <i className="fas fa-star mr-2"></i> Features Enabled by Advanced Mode:
                                </h4>
                                <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1.5 ml-1">
                                    <li className="flex items-start gap-2">
                                        <i className="fas fa-check-circle text-green-500 mt-0.5"></i>
                                        <span><strong>Google Calendar Sync:</strong> Push tasks to your real calendar.</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <i className="fas fa-check-circle text-green-500 mt-0.5"></i>
                                        <span><strong>Smart Sheet Polling:</strong> Detects changes made in the sheet instantly via Drive API.</span>
                                    </li>
                                     <li className="flex items-start gap-2">
                                        <i className="fas fa-check-circle text-green-500 mt-0.5"></i>
                                        <span><strong>Secure OAuth:</strong> Authenticate directly with Google.</span>
                                    </li>
                                </ul>
                            </div>

                            <div className="grid gap-4">
                                <div>
                                    <label className={labelClass}>Google API Key</label>
                                    <input type="password" value={apiKeys.apiKey} onChange={(e) => setApiKeys({ ...apiKeys, apiKey: e.target.value })} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Google Client ID</label>
                                    <input type="text" value={apiKeys.clientId} onChange={(e) => setApiKeys({ ...apiKeys, clientId: e.target.value })} className={inputClass} />
                                </div>
                                <button onClick={handleSaveApiKeys} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold w-full sm:w-auto">Save Keys</button>
                            </div>
                        </div>
                    </div>
                );

            case 'calendar':
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className={sectionClass}>
                            <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Google Calendar</h3>
                            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mb-4">
                                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                    <i className="fas fa-exclamation-triangle mr-2"></i>
                                    Calendar integration requires <strong>Advanced Mode</strong> (Client ID & API Key).
                                </p>
                            </div>
                             <div className="flex justify-between items-center mb-4">
                                <span>Status: {googleAuthState.isSignedIn ? <span className="text-green-500 font-bold">Connected</span> : <span className="text-red-500">Not Connected</span>}</span>
                                {renderAuthButton()}
                            </div>
                            <label className={labelClass}>Calendar ID (Default: primary)</label>
                            <input
                                type="text"
                                value={settings.googleCalendarId || 'primary'}
                                onChange={(e) => onUpdateSettings({ googleCalendarId: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                    </div>
                );
        }
    };

    const renderAuthButton = () => {
        if (!googleAuthState.gapiLoaded) return <span className="text-xs text-gray-500">API Loading...</span>;
        
        if (googleAuthState.isSignedIn) {
            return (
                <button onClick={onGoogleSignOut} className="px-3 py-1.5 text-xs font-bold bg-red-100 text-red-600 rounded-lg">
                    Sign Out
                </button>
            );
        }
        return (
            <button onClick={onGoogleSignIn} className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg">
                Connect Google Account
            </button>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 w-full max-w-5xl max-h-[85vh] h-full rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                
                {/* Sidebar */}
                <div className="w-full md:w-64 bg-gray-50 dark:bg-gray-800/50 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 flex flex-col flex-shrink-0">
                    <div className="p-4 md:p-6 border-b border-gray-200 dark:border-gray-700 hidden md:block">
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            <i className="fas fa-cog text-gray-400"></i> Settings
                        </h2>
                    </div>
                    
                    <nav className="flex md:flex-col p-2 md:p-4 gap-1 md:gap-2 overflow-x-auto md:overflow-visible no-scrollbar">
                        {[
                            { id: 'general', icon: 'fas fa-sliders-h', label: 'General' },
                            { id: 'sheets', icon: 'fas fa-table', label: 'Sheets' },
                            { id: 'calendar', icon: 'far fa-calendar-alt', label: 'Calendar' },
                            { id: 'api', icon: 'fas fa-code', label: 'API & Keys' },
                        ].map(item => (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id as SettingsTab)}
                                className={`flex items-center gap-3 px-4 py-2 md:py-3 text-sm font-medium rounded-xl transition-all whitespace-nowrap flex-shrink-0 ${
                                    activeTab === item.id 
                                        ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-black/5 dark:ring-white/5' 
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                                }`}
                            >
                                <i className={`${item.icon} w-5 text-center`}></i>
                                {item.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Content Area */}
                {/* Added min-w-0 to prevent overflow caused by large flex items inside (like CodeBlock) */}
                <div className="flex-grow flex flex-col bg-gray-100/50 dark:bg-black/20 min-h-0 min-w-0">
                    <div className="flex justify-between items-center p-4 md:p-6 pb-2 flex-shrink-0">
                        <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white capitalize truncate pr-4">
                             {activeTab === 'api' ? 'API Configuration' : activeTab} <span className="md:hidden">Settings</span>
                        </h2>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex-shrink-0">
                            <i className="fas fa-times text-gray-600 dark:text-gray-300"></i>
                        </button>
                    </div>
                    
                    <div className="flex-grow overflow-y-auto p-4 md:p-6 scroll-smooth">
                        {renderTabContent()}
                    </div>
                </div>
            </div>
        </div>
    );
};
