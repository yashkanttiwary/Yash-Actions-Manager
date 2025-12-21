
/**
 * Service to handle Google Calendar checks.
 */

export const checkCalendarConnection = async (calendarId: string): Promise<boolean> => {
    try {
        // A lightweight call to get the calendar metadata
        await gapi.client.calendar.calendars.get({
            calendarId: calendarId
        });
        return true;
    } catch (error) {
        console.error("Calendar connection check failed:", error);
        throw error;
    }
};
