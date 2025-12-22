
// Centralized environment variable accessor to handle Vite vs Node contexts safely.
export const getEnvVar = (key: string): string => {
    try {
        // 1. Check Vite's import.meta.env safely
        if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
            return (import.meta as any).env[key] || '';
        }
    } catch (e) {
        // Ignore errors accessing import.meta
    }

    try {
        // 2. Check global process.env (legacy/bundler support)
        // @ts-ignore
        if (typeof process !== 'undefined' && process.env) {
            // @ts-ignore
            return process.env[key] || '';
        }
    } catch (e) {
        // Ignore
    }
    return '';
};
