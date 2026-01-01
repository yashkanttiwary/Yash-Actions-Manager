
// Centralized storage utility to handle window.storage (Claude environment) 
// vs localStorage (Browser environment) consistently.

const obfuscate = (str: string) => {
    try {
        return btoa(str).split('').reverse().join('');
    } catch (e) {
        return str;
    }
};

const deobfuscate = (str: string) => {
    try {
        return atob(str.split('').reverse().join(''));
    } catch (e) {
        return str;
    }
};

export const storage = (window as any).storage || {
    get: async (key: string): Promise<string | null> => {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.error("Storage Get Error:", e);
            return null;
        }
    },
    set: async (key: string, value: string): Promise<void> => {
        try {
            localStorage.setItem(key, value);
        } catch (e: any) {
            // FIX CRIT-001: Handle Quota Exceeded gracefully
            if (
                e.name === 'QuotaExceededError' || 
                e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                (e.message && e.message.toLowerCase().includes('quota'))
            ) {
                console.error("CRITICAL: Local Storage Quota Exceeded. Data could not be saved.");
                // Dispatch event for UI to catch
                window.dispatchEvent(new Event('storage-quota-exceeded'));
            } else {
                console.error("Storage Set Error:", e);
            }
        }
    },
    remove: async (key: string): Promise<void> => {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error("Storage Remove Error:", e);
        }
    },
    // SECURE METHODS (Obfuscation for API Keys)
    getSecure: async (key: string): Promise<string | null> => {
        try {
            const val = localStorage.getItem(key);
            return val ? deobfuscate(val) : null;
        } catch (e) {
            return null;
        }
    },
    setSecure: async (key: string, value: string): Promise<void> => {
        try {
            localStorage.setItem(key, obfuscate(value));
        } catch (e: any) {
            if (e.name === 'QuotaExceededError') window.dispatchEvent(new Event('storage-quota-exceeded'));
        }
    }
};
