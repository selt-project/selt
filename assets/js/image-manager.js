import { getState, mutateState } from './state.js';
import { storeImageAsset } from './storage.js';
import { fileToDataUrl, generateId } from './utilities.js';
import { resolveImageUrl } from './board-renderer.js';

const MAX_IMAGE_SIZE = 3 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const COMPACT_PLACEMENT_QUERY = '(max-width: 1023.98px)';

let selectedPlacementImageId = null;
let selectedPlacementImageName = '';

function isCompactImagePlacementMode() {
    return window.matchMedia(COMPACT_PLACEMENT_QUERY).matches;
}

function updatePlacementSelectionUi(message = '') {
    const shouldShowSelection = isCompactImagePlacementMode();

    document.querySelectorAll('[data-image-id]').forEach((item) => {
        item.classList.toggle('is-selected', shouldShowSelection && item.dataset.imageId === selectedPlacementImageId);
    });

    const messageElement = document.querySelector('#imageManagerMessage');
    if (!messageElement || !shouldShowSelection) {
        return;
    }

    messageElement.textContent = message || (
        selectedPlacementImageId
            ? `Selected: ${selectedPlacementImageName}. Tap an active tile to place it.`
            : 'Tap an image first, then tap an active tile to place it.'
    );
    messageElement.className = selectedPlacementImageId
        ? 'text-sm font-semibold text-blue-700'
        : 'text-sm text-slate-500';
}

function selectImageForPlacement(image) {
    selectedPlacementImageId = image.id;
    selectedPlacementImageName = image.name || 'Selected image';
    updatePlacementSelectionUi();
}

export function getSelectedImageForPlacement() {
    return isCompactImagePlacementMode() ? selectedPlacementImageId : null;
}

export function clearSelectedImageForPlacement(message = 'Image placed. Select another image to place it on a tile.') {
    selectedPlacementImageId = null;
    selectedPlacementImageName = '';
    updatePlacementSelectionUi(message);
}

export async function renderImageTools(container, state) {
    container.innerHTML = `
        <div class="space-y-4">
            <div class="space-y-2">
                <p class="text-sm leading-6 text-slate-600">Add images to active tiles. Each tile can hold either one image or text.</p>
                <p class="hidden text-sm leading-6 text-slate-600 lg:block">Drag an image onto an active tile to place it.</p>
                <p class="rounded-md bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 lg:hidden">On screens under 1024px, tap an image first, then tap an active tile to place it.</p>
            </div>
            <label class="block rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">
                <span class="font-semibold text-slate-700">Upload images</span>
                <span class="mt-1 block text-xs text-slate-500">JPG, PNG, or WebP. Max 3 MB each.</span>
                <input id="tileImageUploadInput" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple class="mt-3 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-700">
            </label>
            <p id="imageManagerMessage" class="text-sm text-slate-500"></p>
            <div id="imageLibrary" class="image-library"></div>
        </div>
    `;

    const library = container.querySelector('#imageLibrary');

    await Promise.all(Object.values(state.images || {}).map(async (image) => {
        const item = document.createElement('div');
        item.className = 'image-library-item';
        item.draggable = true;
        item.dataset.imageId = image.id;
        item.title = image.name;

        const imageElement = document.createElement('img');
        imageElement.alt = image.name || 'Tile image';
        imageElement.src = await resolveImageUrl(state, image.id);
        item.appendChild(imageElement);

        item.addEventListener('dragstart', (event) => {
            if (isCompactImagePlacementMode()) {
                event.preventDefault();
                selectImageForPlacement(image);
                return;
            }

            event.dataTransfer.setData('text/plain', image.id);
            event.dataTransfer.effectAllowed = 'copy';
        });

        item.addEventListener('click', () => {
            if (!isCompactImagePlacementMode()) {
                return;
            }

            selectImageForPlacement(image);
        });

        library.appendChild(item);
    }));

    updatePlacementSelectionUi();

    container.querySelector('#tileImageUploadInput')?.addEventListener('change', async (event) => {
        const files = Array.from(event.target.files || []);
        const message = container.querySelector('#imageManagerMessage');

        if (!files.length) {
            return;
        }

        for (const file of files) {
            if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
                message.textContent = 'Please upload JPG, PNG, or WebP images only.';
                message.className = 'text-sm text-rose-600';
                continue;
            }

            if (file.size > MAX_IMAGE_SIZE) {
                message.textContent = 'Each image must be 3 MB or smaller.';
                message.className = 'text-sm text-rose-600';
                continue;
            }

            const dataUrl = await fileToDataUrl(file);
            const id = generateId('image');

            await storeImageAsset({
                id,
                name: file.name,
                mimeType: file.type,
                dataUrl,
                createdAt: new Date().toISOString(),
            });

            mutateState((draft) => {
                draft.images[id] = {
                    id,
                    name: file.name,
                    mimeType: file.type,
                    sourceType: 'uploaded',
                };
            });
        }

        event.target.value = '';
    });
}

export function assignImageToTile(tileId, imageId) {
    const state = getState();
    const tile = state.tiles?.[tileId];

    if (!tile?.active || !state.images?.[imageId]) {
        return false;
    }

    if (tile.type === 'start' || tile.type === 'finish') {
        window.alert('START and FINISH tiles use fixed labels and cannot hold images.');
        return false;
    }

    if (String(tile.text || '').trim()) {
        const confirmed = window.confirm('This tile already has text. Adding an image will remove the tile text. Continue?');
        if (!confirmed) {
            return false;
        }
    }

    if (tile.imageId === imageId && !String(tile.text || '').trim()) {
        return true;
    }

    mutateState((draft) => {
        draft.tiles[tileId].text = '';
        draft.tiles[tileId].imageId = imageId;
    });

    return true;
}

export function removeImageFromTile(tileId) {
    const state = getState();

    if (!state.tiles?.[tileId]?.active) {
        return;
    }

    mutateState((draft) => {
        draft.tiles[tileId].imageId = null;
    });
}
