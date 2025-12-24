
/**
 * TIME SERVICE
 * Fetches accurate time from trusted internet sources to calculate local device clock offset.
 * Sources: Adafruit IO, TimeAPI.io, WorldTimeAPI.org.
 */

let timeOffset = 0; // The difference in ms: (Server Time - Local Device Time)
let userManualOffsetMs = 0; // User preference offset in ms
let isInitialized = false;

// List of APIs to try in order
const TIME_SOURCES = [
    {
        name: 'Adafruit IO',
        url: 'https://io.adafruit.com/api/v2/time/seconds', // Returns plain text seconds string
        type: 'text_seconds'
    },
    {
        name: 'WorldTimeAPI',
        url: 'https://worldtimeapi.org/api/timezone/Etc/UTC',
        type: 'json_utc'
    },
    {
        name: 'TimeAPI',
        url: 'https://timeapi.io/api/Time/current/zone?timeZone=UTC',
        type: 'json_iso'
    }
];

export const initializeTimeSync = async (): Promise<void> => {
    if (isInitialized) return;

    for (const source of TIME_SOURCES) {
        try {
            const requestStart = Date.now();
            const response = await fetch(source.url, { cache: 'no-store' });
            
            if (!response.ok) throw new Error(`Status ${response.status}`);

            const requestEnd = Date.now();
            // Network latency adjustment (assume symmetric round trip)
            const latency = (requestEnd - requestStart) / 2;
            
            let serverTimeMs = 0;

            if (source.type === 'text_seconds') {
                const text = await response.text();
                // Adafruit returns string like "2023-10-27 10:00:00" or seconds depending on endpoint
                // The endpoint /seconds returns raw seconds
                // Let's parse strictly. If it looks like a year, parse date.
                if (text.includes('-')) {
                     serverTimeMs = new Date(text).getTime();
                } else {
                     serverTimeMs = parseFloat(text) * 1000;
                }
            } else if (source.type === 'json_utc') {
                const data = await response.json();
                serverTimeMs = new Date(data.utc_datetime).getTime();
            } else if (source.type === 'json_iso') {
                const data = await response.json();
                // TimeAPI returns { dateTime: "..." }
                serverTimeMs = new Date(data.dateTime).getTime();
            }

            // Calculate offset: Real Time = Local Time + Offset
            // Server Time (approx at receive) = Local Time (at receive) + Offset
            // Offset = Server Time - Local Time
            // We add latency to serverTime to estimate "now"
            const adjustedServerTime = serverTimeMs + latency;
            timeOffset = adjustedServerTime - requestEnd;

            console.log(`[TimeService] Synced with ${source.name}. Offset: ${timeOffset}ms. Latency: ${latency}ms`);
            isInitialized = true;
            return; // Success, stop trying others

        } catch (e) {
            console.warn(`[TimeService] Failed to sync with ${source.name}:`, e);
        }
    }
    
    console.error("[TimeService] All time sources failed. Using local device time.");
};

/**
 * Sets the manual user offset in minutes.
 * @param minutes Positive or negative minutes to adjust the clock by.
 */
export const setUserTimeOffset = (minutes: number) => {
    userManualOffsetMs = minutes * 60 * 1000;
};

/**
 * Returns the current date object corrected by the network offset AND user preference.
 */
export const getAccurateCurrentDate = (): Date => {
    return new Date(Date.now() + timeOffset + userManualOffsetMs);
};

export const getTimeOffset = () => timeOffset;
