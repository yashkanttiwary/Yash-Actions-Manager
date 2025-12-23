
// Utility to handle storing large audio files in IndexedDB
// LocalStorage is limited to 5MB, which is insufficient for music.

const DB_NAME = 'TaskManagerAudioDB';
const STORE_NAME = 'audio_tracks';
const DB_VERSION = 1;

export interface AudioTrack {
    id: string;
    name: string;
    blob: Blob;
    type: string;
    size: number;
}

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => reject('IndexedDB error: ' + (event.target as any).error);

        request.onsuccess = (event) => resolve((event.target as any).result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as any).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
};

export const saveAudioTrack = async (file: File): Promise<AudioTrack> => {
    const db = await openDB();
    const id = `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const track: AudioTrack = {
        id,
        name: file.name,
        blob: file,
        type: file.type,
        size: file.size
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(track);

        request.onsuccess = () => resolve(track);
        request.onerror = () => reject('Failed to save track');
    });
};

export const getAllAudioTracks = async (): Promise<AudioTrack[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject('Failed to fetch tracks');
    });
};

export const deleteAudioTrack = async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject('Failed to delete track');
    });
};

export const getAudioTrack = async (id: string): Promise<AudioTrack | undefined> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject('Failed to get track');
    });
};
