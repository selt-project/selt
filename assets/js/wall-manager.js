import { getState, mutateState } from './state.js';
import { areAdjacent, wallId, wallOrientation } from './utilities.js';

export function renderWallTools(container) {
    container.innerHTML = `
        <div class="space-y-3">
            <p class="text-sm leading-6 text-slate-600">Click the small handle between two neighboring active tiles to add or remove a wall.</p>
            <p class="rounded-md bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-600">Walls appear as "x x x x" marks and remain visible in all preview steps.</p>
        </div>
    `;
}

export function toggleWall(fromTileId, toTileId) {
    const state = getState();

    if (!state.tiles?.[fromTileId]?.active || !state.tiles?.[toTileId]?.active || !areAdjacent(fromTileId, toTileId)) {
        return;
    }

    mutateState((draft) => {
        const id = wallId(fromTileId, toTileId);

        if (draft.walls[id]) {
            delete draft.walls[id];
            return;
        }

        draft.walls[id] = {
            from: fromTileId,
            to: toTileId,
            orientation: wallOrientation(fromTileId, toTileId),
        };
    });
}
