
// Centralized storage utility to handle window.storage (Claude environment) 
// vs localStorage (Browser environment) consistently.

export const storage = (window as any).storage || {
    get: async (key: string): Promise<string | null> => {
        return localStorage.getItem(key);
    },
    set: async (key: string, value: string): Promise<void> => {
        localStorage.setItem(key, value);
    },
    remove: async (key: string): Promise<void> => {
        localStorage.removeItem(key);
    }
};
