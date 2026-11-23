const STATE_KEY = 'printableBoardGameCreator.state';
const DB_NAME = 'printableBoardGameCreator.assets';
const DB_VERSION = 1;
const IMAGE_STORE = 'images';
const BACKGROUND_STORE = 'backgrounds';

let dbPromise = null;

function openDatabase() {
    if (dbPromise) {
        return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(IMAGE_STORE)) {
                db.createObjectStore(IMAGE_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(BACKGROUND_STORE)) {
                db.createObjectStore(BACKGROUND_STORE, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB could not be opened.'));
    });

    return dbPromise;
}

async function withStore(storeName, mode, callback) {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = callback(store);

        transaction.oncomplete = () => resolve(request?.result);
        transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
    });
}

export function loadState() {
    try {
        const rawState = localStorage.getItem(STATE_KEY);
        return rawState ? JSON.parse(rawState) : null;
    } catch (error) {
        console.warn('Stored board state could not be loaded.', error);
        return null;
    }
}

export function saveState(state) {
    const stateCopy = JSON.parse(JSON.stringify(state));
    localStorage.setItem(STATE_KEY, JSON.stringify(stateCopy));
}

export async function clearAllStorage() {
    localStorage.removeItem(STATE_KEY);

    try {
        await withStore(IMAGE_STORE, 'readwrite', (store) => store.clear());
        await withStore(BACKGROUND_STORE, 'readwrite', (store) => store.clear());
    } catch (error) {
        console.warn('Stored assets could not be cleared.', error);
    }
}

export async function storeImageAsset(asset) {
    await withStore(IMAGE_STORE, 'readwrite', (store) => store.put(asset));
}

export async function getImageAsset(id) {
    if (!id) {
        return null;
    }

    return await withStore(IMAGE_STORE, 'readonly', (store) => store.get(id));
}

export async function deleteImageAsset(id) {
    await withStore(IMAGE_STORE, 'readwrite', (store) => store.delete(id));
}

export async function storeBackgroundAsset(asset) {
    await withStore(BACKGROUND_STORE, 'readwrite', (store) => store.put(asset));
}

export async function getBackgroundAsset(id) {
    if (!id) {
        return null;
    }

    return await withStore(BACKGROUND_STORE, 'readonly', (store) => store.get(id));
}
