
// This service handles the Google API and Identity Services initialization and authentication.
// IMPORTANT: For production, you must provide GOOGLE_API_KEY and GOOGLE_CLIENT_ID as environment variables.
let API_KEY = process.env.GOOGLE_API_KEY;
let CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// Added Drive Metadata scope for polling file changes efficienty
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.metadata.readonly';

let tokenClient: any = null;
let gapiInitialized = false;
let gisInitialized = false;
let scriptsLoaded = false;
let currentInitPromise: Promise<any> | null = null;

// Helper to dynamically load a script and return a promise, preventing duplicate loads.
const loadScript = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            return resolve();
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    });
};


export const initGoogleClient = async (customApiKey?: string, customClientId?: string) => {
    // If a request is already in progress, return that promise to prevent race conditions
    if (currentInitPromise) {
        return currentInitPromise;
    }

    currentInitPromise = (async () => {
        // Override with custom keys if provided
        if (customApiKey) API_KEY = customApiKey;
        if (customClientId) CLIENT_ID = customClientId;

        // Gracefully disable the feature if the API key or Client ID are missing or incomplete.
        if (!API_KEY || !CLIENT_ID) {
            console.warn("Google API Key or Client ID is missing. Integrations disabled.");
            return { gapiLoaded: false, gisLoaded: false, disabled: true };
        }

        // Fix MED-002: If already initialized with the same keys, don't re-initialize.
        // Note: The Google Client library doesn't easily support switching API keys without reload.
        if (gapiInitialized && gisInitialized) {
            return { gapiLoaded: true, gisLoaded: true, disabled: false };
        }

        try {
            // Load scripts dynamically only once to prevent race conditions and duplicate script tags.
            if (!scriptsLoaded) {
                await loadScript('https://apis.google.com/js/api.js');
                await loadScript('https://accounts.google.com/gsi/client');
                scriptsLoaded = true;
            }

            // Initialize gapi client
            if (!gapiInitialized) {
                await new Promise<void>((resolve, reject) => {
                    gapi.load('client', {
                        callback: resolve,
                        onerror: reject,
                    });
                });
                
                // Initialize with multiple discovery docs including Drive
                await gapi.client.init({
                    apiKey: API_KEY,
                    discoveryDocs: [
                        'https://sheets.googleapis.com/$discovery/rest?version=v4',
                        'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
                        'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
                    ],
                });
                gapiInitialized = true;
            }

            // Initialize gis client
            if (!gisInitialized) {
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID!,
                    scope: SCOPES,
                    callback: () => {}, // Callback is handled by the promise in signIn
                });
                gisInitialized = true;
            }
            
            return { gapiLoaded: gapiInitialized, gisLoaded: gisInitialized, disabled: false };
        } catch(error) {
            console.error("Error during Google Client initialization:", error);
            throw new Error("Failed to initialize Google services.");
        } finally {
            currentInitPromise = null;
        }
    })();

    return currentInitPromise;
};

export const signIn = (): Promise<any> => {
    return new Promise((resolve, reject) => {
        if (!gisInitialized || !tokenClient) {
            return reject("Google Auth is not initialized or is disabled.");
        }
        
        const callback = (resp: any) => {
            if (resp.error) {
                return reject(resp);
            }
            gapi.client.setToken(resp);
            resolve(resp);
        };
        
        tokenClient.callback = callback;

        if (gapi.client.getToken() === null) {
            // Prompt the user to select an account and grant consent for scopes
            tokenClient.requestAccessToken({prompt: 'consent'});
        } else {
            // Skip display of account chooser and consent dialog
            tokenClient.requestAccessToken({prompt: ''});
        }
    });
};

export const signOut = () => {
    if (!gapiInitialized || !gisInitialized) {
        return;
    }
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken(null);
        });
    }
};
