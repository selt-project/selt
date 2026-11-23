import { getState, mutateState, mutateStateSilently } from './state.js';
import { connectedWallIds } from './utilities.js';

export const TILE_COLORS = [
    '#fef08a',
    '#fed7aa',
    '#fecdd3',
    '#fbcfe8',
    '#ddd6fe',
    '#bfdbfe',
    '#a7f3d0',
    '#bbf7d0',
    '#fde68a',
    '#e2e8f0',
    '#ffffff',
    '#c7d2fe',
];

const ROAD_COLOR = '#ffffff';
const GOOD_COLOR = '#fef08a';
const WARNING_COLOR = '#fecaca';
const CHALLENGE_COLOR = '#bfdbfe';
const SAFE_COLOR = '#bbf7d0';
const PAUSE_COLOR = '#fed7aa';
const START_COLOR = '#22c55e';
const START_TEXT_COLOR = '#ffffff';
const FINISH_COLOR = '#ef4444';
const FINISH_TEXT_COLOR = '#ffffff';

const road = (id) => ({ id, color: ROAD_COLOR });
const good = (id) => ({ id, color: GOOD_COLOR });
const warning = (id) => ({ id, color: WARNING_COLOR });
const challenge = (id) => ({ id, color: CHALLENGE_COLOR });
const safe = (id) => ({ id, color: SAFE_COLOR });
const pause = (id) => ({ id, color: PAUSE_COLOR });
const start = (id) => ({ id, type: 'start', color: START_COLOR, textColor: START_TEXT_COLOR });
const finish = (id) => ({ id, type: 'finish', color: FINISH_COLOR, textColor: FINISH_TEXT_COLOR });

const TILE_PATTERNS = [
    {
        id: 'erzin-roads',
        name: 'Erzin Roads',
        note: 'Branching roads with two starts and two finishes.',
        tiles: [
            start('r10-c2'), road('r9-c2'), road('r8-c2'), good('r8-c3'), road('r8-c4'),
            challenge('r7-c4'), road('r6-c4'), warning('r5-c4'), road('r5-c5'), good('r5-c6'),
            road('r4-c6'), challenge('r3-c6'), road('r3-c7'), finish('r3-c8'),
            start('r10-c8'), road('r9-c8'), warning('r8-c8'), road('r7-c8'), road('r7-c7'),
            safe('r7-c6'), road('r6-c6'), road('r6-c5'), road('r6-c3'), good('r6-c2'),
            finish('r6-c1'),
        ],
    },
    {
        id: 'golden-ladder',
        name: 'Golden Ladder',
        note: 'A rising classroom route with rewards and setbacks.',
        tiles: [
            start('r11-c1'), road('r10-c1'), road('r9-c1'), good('r8-c1'), road('r8-c2'),
            road('r8-c3'), warning('r7-c3'), road('r6-c3'), challenge('r5-c3'), road('r5-c4'),
            good('r5-c5'), road('r4-c5'), road('r3-c5'), warning('r3-c6'), road('r3-c7'),
            safe('r2-c7'), finish('r1-c7'),
        ],
    },
    {
        id: 'twin-rivers',
        name: 'Twin Rivers',
        note: 'Two starts merge into one shared finish.',
        tiles: [
            start('r11-c2'), road('r10-c2'), challenge('r9-c2'), road('r8-c2'), good('r7-c2'),
            road('r7-c3'), road('r7-c4'), safe('r6-c4'), road('r5-c4'), warning('r4-c4'),
            start('r11-c8'), road('r10-c8'), warning('r9-c8'), road('r8-c8'), good('r7-c8'),
            road('r7-c7'), road('r7-c6'), safe('r6-c6'), road('r5-c6'), challenge('r4-c6'),
            road('r4-c5'), good('r3-c5'), finish('r2-c5'),
        ],
    },
    {
        id: 'quiz-garden',
        name: 'Quiz Garden',
        note: 'A wide route with two possible finish spaces.',
        tiles: [
            start('r10-c5'), road('r9-c5'), safe('r8-c5'), road('r8-c4'), good('r8-c3'),
            road('r7-c3'), warning('r6-c3'), road('r5-c3'), challenge('r5-c4'), road('r5-c5'),
            good('r5-c6'), road('r5-c7'), warning('r6-c7'), road('r7-c7'), road('r8-c7'),
            safe('r8-c6'), road('r4-c5'), challenge('r3-c5'), road('r3-c4'), finish('r2-c4'),
            road('r3-c6'), finish('r2-c6'),
        ],
    },
    {
        id: 'spiral-classroom',
        name: 'Spiral Classroom',
        note: 'A compact spiral with several mood changes.',
        tiles: [
            start('r9-c3'), road('r8-c3'), road('r7-c3'), good('r6-c3'), road('r5-c3'),
            warning('r4-c3'), road('r3-c3'), road('r3-c4'), challenge('r3-c5'), road('r3-c6'),
            good('r3-c7'), road('r4-c7'), warning('r5-c7'), road('r6-c7'), safe('r7-c7'),
            road('r7-c6'), road('r7-c5'), challenge('r6-c5'), good('r5-c5'), finish('r5-c6'),
        ],
    },
];

function syncSpecialTiles(draft) {
    const entries = Object.entries(draft.tiles || {});
    draft.startTile = entries.find(([, tile]) => tile?.active && tile.type === 'start')?.[0] || null;
    draft.finishTile = entries.find(([, tile]) => tile?.active && tile.type === 'finish')?.[0] || null;
}

function hasTileProgress(state) {
    return Object.values(state.tiles || {}).some((tile) => tile?.active)
        || Object.keys(state.walls || {}).length > 0;
}

function createTileFromPattern(definition) {
    const type = definition.type || 'normal';

    return {
        active: true,
        type,
        color: definition.color || ROAD_COLOR,
        text: '',
        textColor: definition.textColor || '#111827',
        imageId: null,
    };
}

function applyTilePattern(patternId) {
    const pattern = TILE_PATTERNS.find((candidate) => candidate.id === patternId);

    if (!pattern) {
        return;
    }

    const state = getState();

    if (hasTileProgress(state)) {
        const confirmed = window.confirm('Applying a preset pattern will replace your current tiles, tile text, tile image assignments, and walls. Continue?');
        if (!confirmed) {
            return;
        }
    }

    mutateState((draft) => {
        draft.tiles = {};
        draft.walls = {};

        pattern.tiles.forEach((definition) => {
            draft.tiles[definition.id] = createTileFromPattern(definition);
        });

        draft.selectedTilePattern = pattern.id;
        syncSpecialTiles(draft);
    });
}

export function renderBuildTools(container, state) {
    const selected = state.selectedTileTool || { type: 'color', color: TILE_COLORS[0] };
    const defaultPattern = TILE_PATTERNS[0];
    const selectedPattern = TILE_PATTERNS.find((pattern) => pattern.id === state.selectedTilePattern) || defaultPattern;

    container.innerHTML = `
        <div class="space-y-4">
            <section class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 class="text-sm font-semibold text-slate-800">Preset tile patterns</h3>
                <p class="mt-1 text-sm leading-6 text-slate-600">Apply a ready-made path if you want a quick starting point. Presets place tiles only, not text or images.</p>
                <div class="mt-3 space-y-3">
                    <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500" for="tilePatternSelect">Choose a pattern</label>
                    <select id="tilePatternSelect" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                        ${TILE_PATTERNS.map((pattern) => `
                            <option value="${pattern.id}" ${pattern.id === selectedPattern.id ? 'selected' : ''}>${pattern.name}</option>
                        `).join('')}
                    </select>
                    <p id="tilePatternNote" class="text-xs leading-5 text-slate-500">${selectedPattern.note}</p>
                    <button id="applyTilePatternButton" type="button" class="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
                        Apply preset pattern
                    </button>
                </div>
            </section>
            <section class="rounded-lg border border-slate-200 bg-white p-3">
                <h3 class="text-sm font-semibold text-slate-800">Manual tile tools</h3>
                <p class="mt-1 text-sm leading-6 text-slate-600">Select a tile color, START, or FINISH, then click shadow tiles in the preview. Click an active tile again to remove it.</p>
                <div class="tool-grid mt-3" aria-label="Tile color tools">
                    ${TILE_COLORS.map((color, index) => `
                        <button type="button" class="tool-button ${selected.type === 'color' && selected.color === color ? 'is-selected' : ''}" data-tile-tool="color" data-color="${color}" style="background:${color}" title="Tile color ${index + 1}">
                            ${index + 1}
                        </button>
                    `).join('')}
                    <label class="tool-button ${selected.type === 'color' && !TILE_COLORS.includes(selected.color) ? 'is-selected' : ''} cursor-pointer bg-white" title="Custom tile color">
                        <span>Custom</span>
                        <input id="customTileColorInput" type="color" value="${selected.color || '#fef08a'}" class="sr-only">
                    </label>
                    <button type="button" class="tool-button ${selected.type === 'start' ? 'is-selected' : ''}" data-tile-tool="start" style="background:#22c55e;color:#ffffff">START</button>
                    <button type="button" class="tool-button ${selected.type === 'finish' ? 'is-selected' : ''}" data-tile-tool="finish" style="background:#ef4444;color:#ffffff">FINISH</button>
                </div>
            </section>
        </div>
    `;

    const patternSelect = container.querySelector('#tilePatternSelect');
    const patternNote = container.querySelector('#tilePatternNote');

    patternSelect?.addEventListener('change', () => {
        const pattern = TILE_PATTERNS.find((candidate) => candidate.id === patternSelect.value) || defaultPattern;
        mutateStateSilently((draft) => {
            draft.selectedTilePattern = pattern.id;
        });
        if (patternNote) {
            patternNote.textContent = pattern.note;
        }
    });

    container.querySelector('#applyTilePatternButton')?.addEventListener('click', () => {
        applyTilePattern(patternSelect?.value || defaultPattern.id);
    });

    container.querySelectorAll('[data-tile-tool]').forEach((button) => {
        button.addEventListener('click', () => {
            mutateState((draft) => {
                draft.selectedTileTool = {
                    type: button.dataset.tileTool,
                    color: button.dataset.color || draft.selectedTileTool?.color || TILE_COLORS[0],
                };
            });
        });
    });

    const customTileColorInput = container.querySelector('#customTileColorInput');
    const applyCustomTileColor = (color) => {
        mutateStateSilently((draft) => {
            draft.selectedTileTool = {
                type: 'color',
                color,
            };
        });

        container.querySelectorAll('[data-tile-tool]').forEach((button) => {
            const isMatchingPreset = button.dataset.tileTool === 'color' && button.dataset.color === color;
            button.classList.toggle('is-selected', isMatchingPreset);
        });

        const customLabel = customTileColorInput?.closest('.tool-button');
        if (customLabel) {
            customLabel.classList.toggle('is-selected', !TILE_COLORS.includes(color));
        }
    };

    customTileColorInput?.addEventListener('input', (event) => {
        applyCustomTileColor(event.target.value);
    });

    customTileColorInput?.addEventListener('change', (event) => {
        applyCustomTileColor(event.target.value);
    });
}

function removeTile(draft, tileId) {
    delete draft.tiles[tileId];

    Object.keys(draft.walls || {}).forEach((id) => {
        const wall = draft.walls[id];
        if (wall.from === tileId || wall.to === tileId) {
            delete draft.walls[id];
        }
    });

    syncSpecialTiles(draft);
}

export function handleBuildTileClick(tileId) {
    const state = getState();
    const existingTile = state.tiles?.[tileId];

    if (existingTile?.active) {
        const hasText = Boolean(existingTile.text);
        const hasImage = Boolean(existingTile.imageId);
        const hasWalls = connectedWallIds(state, tileId).length > 0;

        if (hasText || hasImage || hasWalls) {
            const confirmed = window.confirm('Removing this tile will also remove its text, image assignment, and connected walls. Continue?');
            if (!confirmed) {
                return;
            }
        }

        mutateState((draft) => removeTile(draft, tileId));
        return;
    }

    mutateState((draft) => {
        const tool = draft.selectedTileTool || { type: 'color', color: TILE_COLORS[0] };

        if (tool.type === 'start') {
            draft.tiles[tileId] = {
                active: true,
                type: 'start',
                color: START_COLOR,
                text: '',
                textColor: START_TEXT_COLOR,
                imageId: null,
            };
            syncSpecialTiles(draft);
            return;
        }

        if (tool.type === 'finish') {
            draft.tiles[tileId] = {
                active: true,
                type: 'finish',
                color: FINISH_COLOR,
                text: '',
                textColor: FINISH_TEXT_COLOR,
                imageId: null,
            };
            syncSpecialTiles(draft);
            return;
        }

        draft.tiles[tileId] = {
            active: true,
            type: 'normal',
            color: tool.color || TILE_COLORS[0],
            text: '',
            textColor: draft.selectedTextColor || '#111827',
            imageId: null,
        };
        syncSpecialTiles(draft);
    });
}
