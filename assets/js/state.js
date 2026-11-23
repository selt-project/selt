import { clearAllStorage, loadState, saveState } from './storage.js';
import { appUrl, generateId } from './utilities.js';

export const STEPS = [
    { id: 'orientation', label: 'Choose board format', number: '1' },
    { id: 'background', label: 'Choose background', number: '2' },
    { id: 'build', label: 'Build your board', number: '3' },
    { id: 'text', label: 'Add text', number: '4' },
    { id: 'images', label: 'Add images', number: '5' },
    { id: 'walls', label: 'Add walls', number: '6' },
    { id: 'finalize', label: 'Name and finalize your board', number: '7' },
];

const DEFAULT_IMAGE_ID = 'sample-apple';

const defaultImage = {
    id: DEFAULT_IMAGE_ID,
    name: 'Sample apple',
    mimeType: 'image/png',
    sourceType: 'builtin',
    url: appUrl('/assets/images/samples/apple.png'),
};

let state = createDefaultState();
const listeners = new Set();

export function createDefaultState() {
    return {
        sessionId: generateId('session'),
        currentStep: 'orientation',
        orientation: 'portrait',
        grid: {
            columns: 9,
            rows: 11,
        },
        background: {
            type: 'none',
            source: '',
            fit: 'cover',
        },
        tiles: {},
        walls: {},
        images: {
            [DEFAULT_IMAGE_ID]: { ...defaultImage },
        },
        startTile: null,
        finishTile: null,
        boardTitle: '',
        boardTitleColor: '#0f172a',
        creatorName: '',
        creatorNameColor: '#0f172a',
        selectedTileTool: {
            type: 'color',
            color: '#fef08a',
        },
        selectedTilePattern: 'erzin-roads',
        selectedTextColor: '#111827',
        selectedTextCustomColor: '#111827',
        aiSuggestions: [],
    };
}

function normalizeState(candidate) {
    const nextState = {
        ...createDefaultState(),
        ...(candidate && typeof candidate === 'object' ? candidate : {}),
    };

    nextState.orientation = 'portrait';
    nextState.grid = {
        columns: 9,
        rows: 11,
    };

    nextState.background = {
        type: nextState.background?.type || 'none',
        source: nextState.background?.source || '',
        fit: nextState.background?.fit || 'cover',
    };

    nextState.tiles = nextState.tiles && typeof nextState.tiles === 'object' ? nextState.tiles : {};
    nextState.walls = nextState.walls && typeof nextState.walls === 'object' ? nextState.walls : {};
    nextState.images = nextState.images && typeof nextState.images === 'object' ? nextState.images : {};
    Object.values(nextState.tiles).forEach((tile) => {
        if (!tile || typeof tile !== 'object') {
            return;
        }

        if (tile.type === 'start' || tile.type === 'finish') {
            tile.textColor = '#ffffff';
            tile.imageId = null;
            return;
        }

        if (tile.imageId && String(tile.text || '').trim()) {
            tile.imageId = null;
        }
    });
    nextState.images[DEFAULT_IMAGE_ID] = { ...defaultImage };
    nextState.selectedTileTool = nextState.selectedTileTool || { type: 'color', color: '#fef08a' };
    nextState.selectedTilePattern = nextState.selectedTilePattern || 'erzin-roads';
    nextState.selectedTextColor = nextState.selectedTextColor || '#111827';
    nextState.selectedTextCustomColor = nextState.selectedTextCustomColor || (
        nextState.selectedTextColor && ![
            '#111827',
            '#ffffff',
            '#dc2626',
            '#ea580c',
            '#ca8a04',
            '#16a34a',
            '#059669',
            '#0284c7',
            '#2563eb',
            '#7c3aed',
            '#be185d',
            '#475569',
        ].includes(nextState.selectedTextColor)
            ? nextState.selectedTextColor
            : '#111827'
    );
    nextState.boardTitleColor = nextState.boardTitleColor || '#0f172a';
    nextState.boardTitle = String(nextState.boardTitle || '').slice(0, 90);
    nextState.creatorNameColor = nextState.creatorNameColor || '#0f172a';
    nextState.creatorName = String(nextState.creatorName || '').slice(0, 70);
    nextState.aiSuggestions = Array.isArray(nextState.aiSuggestions)
        ? nextState.aiSuggestions.map((suggestion) => String(suggestion || '').trim()).filter(Boolean).slice(0, 40)
        : [];

    if (!STEPS.some((step) => step.id === nextState.currentStep)) {
        nextState.currentStep = 'orientation';
    }

    return nextState;
}

export function initializeState() {
    state = normalizeState(loadState());
    saveState(state);
    notify();
}

export function getState() {
    return state;
}

export function subscribe(callback) {
    listeners.add(callback);
    callback(state);

    return () => listeners.delete(callback);
}

function notify() {
    listeners.forEach((callback) => callback(state));
}

export function persistState() {
    saveState(state);
    notify();
}

export function mutateState(mutator) {
    mutator(state);
    saveState(state);
    notify();
}

export function mutateStateSilently(mutator) {
    mutator(state);
    saveState(state);
}

export async function startNewBoardSession() {
    await clearAllStorage();
    state = createDefaultState();
    saveState(state);
    notify();
}

export function setCurrentStep(stepId) {
    if (!STEPS.some((step) => step.id === stepId)) {
        return;
    }

    mutateState((draft) => {
        draft.currentStep = stepId;
    });
}

export function getCurrentStepIndex() {
    return STEPS.findIndex((step) => step.id === state.currentStep);
}

export function canGoToStep(stepId) {
    return STEPS.some((step) => step.id === stepId);
}

export function resetPortraitBoard() {
    mutateState((draft) => {
        draft.orientation = 'portrait';
        draft.grid = { columns: 9, rows: 11 };
        draft.background = {
            type: 'none',
            source: '',
            fit: 'cover',
        };
        draft.tiles = {};
        draft.walls = {};
        draft.startTile = null;
        draft.finishTile = null;
        draft.boardTitle = '';
        draft.boardTitleColor = '#0f172a';
        draft.creatorName = '';
        draft.creatorNameColor = '#0f172a';
        draft.selectedTilePattern = 'erzin-roads';
        draft.selectedTextColor = '#111827';
        draft.selectedTextCustomColor = '#111827';
        draft.aiSuggestions = [];
        draft.currentStep = 'background';
    });
}
