import { getBackgroundAsset, getImageAsset } from './storage.js';
import { appUrl, tileId, wallId, wallOrientation } from './utilities.js';
import { scheduleTextFit } from './text-fit.js';

const imageUrlCache = new Map();
const backgroundUrlCache = new Map();

export async function resolveImageUrl(state, imageId) {
    if (!imageId || !state.images?.[imageId]) {
        return '';
    }

    const image = state.images[imageId];

    if (image.sourceType === 'builtin') {
        return image.url;
    }

    if (imageUrlCache.has(imageId)) {
        return imageUrlCache.get(imageId);
    }

    const asset = await getImageAsset(imageId);
    const url = asset?.dataUrl || '';
    imageUrlCache.set(imageId, url);
    return url;
}

export async function resolveBackgroundUrl(state) {
    const background = state.background || {};

    if (background.type === 'none' || !background.source) {
        return '';
    }

    if (background.type === 'preset') {
        return appUrl(background.source);
    }

    if (backgroundUrlCache.has(background.source)) {
        return backgroundUrlCache.get(background.source);
    }

    const asset = await getBackgroundAsset(background.source);
    const url = asset?.dataUrl || '';
    backgroundUrlCache.set(background.source, url);
    return url;
}

function applyBackground(page, state, backgroundUrl) {
    const fit = state.background?.fit || 'cover';

    page.style.backgroundImage = backgroundUrl ? `url("${backgroundUrl}")` : '';
    page.style.backgroundColor = '#ffffff';

    if (fit === 'stretch') {
        page.style.backgroundSize = '100% 100%';
    } else if (fit === 'contain') {
        page.style.backgroundSize = 'contain';
    } else {
        page.style.backgroundSize = 'cover';
    }
}

function createTileText(text, color, editable, tileIdValue, fixedLabel = false) {
    const frame = document.createElement('div');
    frame.className = 'tile-text-frame';

    const textElement = document.createElement('div');
    textElement.className = `tile-text ${fixedLabel ? 'is-fixed-label' : ''}`.trim();
    textElement.dataset.tileText = 'true';
    textElement.dataset.tileId = tileIdValue;
    textElement.style.color = color || '#111827';
    textElement.textContent = text;

    if (editable) {
        textElement.setAttribute('contenteditable', 'plaintext-only');
        textElement.setAttribute('spellcheck', 'true');
        textElement.dataset.editableTile = tileIdValue;
        textElement.setAttribute('aria-label', 'Tile text');
    }

    frame.appendChild(textElement);
    return frame;
}

async function createTileCell(state, row, column, options) {
    const id = tileId(row, column);
    const tile = state.tiles?.[id];
    const isActive = Boolean(tile?.active);
    const cell = document.createElement('div');
    cell.className = `tile-cell ${isActive ? 'active' : 'inactive'}`;
    cell.dataset.tileId = id;
    cell.dataset.row = String(row);
    cell.dataset.column = String(column);
    cell.setAttribute('role', 'button');
    cell.tabIndex = 0;

    if (!isActive) {
        cell.setAttribute('aria-label', `Inactive tile ${row}, ${column}`);
        return cell;
    }

    cell.style.backgroundColor = tile.color || '#fef08a';
    cell.setAttribute('aria-label', `Active tile ${row}, ${column}`);

    const content = document.createElement('div');
    const displayText = tile.type === 'start'
        ? 'START'
        : tile.type === 'finish'
            ? 'FINISH'
            : tile.text || '';
    const hasText = displayText.trim() !== '';
    const hasImage = Boolean(tile.imageId) && !hasText;
    content.className = `tile-content ${hasText ? 'has-text' : ''} ${hasImage ? 'has-image' : ''}`.trim();

    if (hasImage) {
        const imageUrl = await resolveImageUrl(state, tile.imageId);
        if (imageUrl) {
            const image = document.createElement('img');
            image.className = 'tile-image';
            image.alt = state.images?.[tile.imageId]?.name || 'Tile image';
            image.src = imageUrl;
            image.onload = () => scheduleTextFit(cell);
            content.appendChild(image);
        }
    }

    if (hasText || options.step === 'text') {
        const editable = options.mode === 'editor'
            && options.step === 'text'
            && tile.type !== 'start'
            && tile.type !== 'finish';
        const frame = createTileText(displayText, tile.textColor || '#111827', editable, id, tile.type === 'start' || tile.type === 'finish');
        content.appendChild(frame);
    }

    cell.appendChild(content);

    if (options.mode === 'editor' && options.step === 'images' && hasImage) {
        const deleteButton = document.createElement('span');
        deleteButton.className = 'tile-image-delete';
        deleteButton.dataset.deleteTileImage = id;
        deleteButton.textContent = 'x';
        deleteButton.setAttribute('role', 'button');
        deleteButton.setAttribute('aria-label', 'Remove tile image');
        cell.appendChild(deleteButton);
    }

    return cell;
}

function appendWallMark(grid, wall) {
    const mark = document.createElement('span');
    mark.className = `wall-mark ${wall.orientation || wallOrientation(wall.from, wall.to)}`;
    mark.dataset.wallFrom = wall.from;
    mark.dataset.wallTo = wall.to;
    mark.textContent = 'x x x x';
    grid.appendChild(mark);
}

function appendWallHandle(grid, fromTileId, toTileId, state) {
    const id = wallId(fromTileId, toTileId);
    const wall = state.walls?.[id] || {
        from: fromTileId,
        to: toTileId,
        orientation: wallOrientation(fromTileId, toTileId),
    };
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = `wall-handle ${state.walls?.[id] ? 'has-wall' : ''}`;
    handle.dataset.wallHandle = id;
    handle.dataset.fromTile = fromTileId;
    handle.dataset.toTile = toTileId;
    handle.dataset.wallFrom = fromTileId;
    handle.dataset.wallTo = toTileId;
    handle.textContent = state.walls?.[id] ? 'x' : '+';
    handle.setAttribute('aria-label', state.walls?.[id] ? 'Remove wall' : 'Add wall');
    grid.appendChild(handle);
}

function positionWallOverlays(grid) {
    const gridRect = grid.getBoundingClientRect();

    grid.querySelectorAll('[data-wall-from][data-wall-to]').forEach((overlay) => {
        const fromTile = grid.querySelector(`[data-tile-id="${overlay.dataset.wallFrom}"]`);
        const toTile = grid.querySelector(`[data-tile-id="${overlay.dataset.wallTo}"]`);

        if (!fromTile || !toTile) {
            return;
        }

        const fromRect = fromTile.getBoundingClientRect();
        const toRect = toTile.getBoundingClientRect();
        const sameRow = Math.abs(fromRect.top - toRect.top) < 1;
        const tileSize = Math.min(fromRect.width, fromRect.height, toRect.width, toRect.height);

        if (sameRow) {
            overlay.style.left = `${((fromRect.right + toRect.left) / 2) - gridRect.left}px`;
            overlay.style.top = `${((fromRect.top + fromRect.bottom) / 2) - gridRect.top}px`;
        } else {
            overlay.style.left = `${((fromRect.left + fromRect.right) / 2) - gridRect.left}px`;
            overlay.style.top = `${((fromRect.bottom + toRect.top) / 2) - gridRect.top}px`;
        }

        if (overlay.classList.contains('wall-mark')) {
            overlay.style.fontSize = `${Math.max(10, Math.min(20, tileSize * 0.16))}px`;
        }
    });
}

function bindWallPositioning(grid) {
    const update = () => positionWallOverlays(grid);

    update();
    window.requestAnimationFrame(update);

    if (window.ResizeObserver) {
        const observer = new ResizeObserver(update);
        observer.observe(grid);
    }
}

function sizeGridToShell(grid, state) {
    const shell = grid.parentElement;

    if (!shell) {
        return;
    }

    const shellRect = shell.getBoundingClientRect();
    const availableWidth = shellRect.width;
    const availableHeight = shellRect.height;

    if (!availableWidth || !availableHeight) {
        return;
    }

    const ratio = state.grid.columns / state.grid.rows;
    const shellRatio = availableWidth / availableHeight;

    if (shellRatio > ratio) {
        grid.style.height = '100%';
        grid.style.width = `${availableHeight * ratio}px`;
    } else {
        grid.style.width = '100%';
        grid.style.height = `${availableWidth / ratio}px`;
    }
}

function bindGridSizing(grid, state) {
    const update = () => {
        sizeGridToShell(grid, state);
        positionWallOverlays(grid);
    };

    update();
    window.requestAnimationFrame(update);

    if (window.ResizeObserver) {
        const observer = new ResizeObserver(update);
        observer.observe(grid.parentElement);
    }
}

function appendWallsAndHandles(grid, state, options) {
    Object.values(state.walls || {}).forEach((wall) => appendWallMark(grid, wall));

    if (options.mode !== 'editor' || options.step !== 'walls') {
        return;
    }

    for (let row = 1; row <= state.grid.rows; row += 1) {
        for (let column = 1; column <= state.grid.columns; column += 1) {
            const currentId = tileId(row, column);
            const currentTile = state.tiles?.[currentId];

            if (!currentTile?.active) {
                continue;
            }

            const rightId = tileId(row, column + 1);
            const bottomId = tileId(row + 1, column);

            if (column < state.grid.columns && state.tiles?.[rightId]?.active) {
                appendWallHandle(grid, currentId, rightId, state);
            }

            if (row < state.grid.rows && state.tiles?.[bottomId]?.active) {
                appendWallHandle(grid, currentId, bottomId, state);
            }
        }
    }
}

export async function renderBoard(container, state, options = {}) {
    const renderId = Symbol('board-render');
    container.__boardRenderId = renderId;
    const renderOptions = {
        mode: options.mode || 'editor',
        step: options.step || state.currentStep,
    };

    if (!state.grid?.columns || !state.grid?.rows) {
        container.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'board-preview-empty';
        empty.innerHTML = '<div><strong>Start a portrait board to begin.</strong><br><span class="text-sm">Your live A4 preview will appear here.</span></div>';
        container.appendChild(empty);
        return null;
    }

    const page = document.createElement('div');
    page.className = `board-page portrait ${renderOptions.mode === 'pdf' ? 'pdf-page' : ''}`;
    page.dataset.boardPage = 'true';

    const backgroundUrl = await resolveBackgroundUrl(state);
    applyBackground(page, state, backgroundUrl);

    const layer = document.createElement('div');
    layer.className = 'board-page-layer';

    const title = document.createElement('div');
    title.className = 'board-title';
    title.dataset.boardTitle = 'true';
    title.textContent = state.boardTitle?.trim() || 'Untitled board game';
    title.style.color = state.boardTitleColor || '#0f172a';
    layer.appendChild(title);

    const gridShell = document.createElement('div');
    gridShell.className = 'board-grid-shell';

    const grid = document.createElement('div');
    grid.className = 'board-grid';
    grid.dataset.boardGrid = 'true';
    grid.style.gridTemplateColumns = `repeat(${state.grid.columns}, minmax(0, 1fr))`;
    grid.style.gridTemplateRows = `repeat(${state.grid.rows}, minmax(0, 1fr))`;
    grid.style.aspectRatio = `${state.grid.columns} / ${state.grid.rows}`;

    for (let row = 1; row <= state.grid.rows; row += 1) {
        for (let column = 1; column <= state.grid.columns; column += 1) {
            grid.appendChild(await createTileCell(state, row, column, renderOptions));
        }
    }

    appendWallsAndHandles(grid, state, renderOptions);
    gridShell.appendChild(grid);
    layer.appendChild(gridShell);

    const footer = document.createElement('div');
    footer.className = 'board-footer';

    const watermark = document.createElement('div');
    watermark.className = 'board-watermark';
    const watermarkImage = document.createElement('img');
    watermarkImage.src = appUrl('/assets/images/watermark/watermark.png');
    watermarkImage.alt = 'Board Game Generator Tool watermark';
    watermarkImage.className = 'board-watermark-image';
    watermark.appendChild(watermarkImage);
    footer.appendChild(watermark);

    const creator = document.createElement('div');
    creator.className = 'board-creator-credit';
    creator.dataset.boardCreator = 'true';
    creator.style.color = state.creatorNameColor || '#0f172a';
    creator.textContent = state.creatorName?.trim() ? `Prepared by ${state.creatorName.trim()}` : '';
    creator.hidden = !state.creatorName?.trim();
    footer.appendChild(creator);

    layer.appendChild(footer);

    page.appendChild(layer);

    if (container.__boardRenderId !== renderId) {
        return null;
    }

    container.innerHTML = '';
    container.appendChild(page);
    bindGridSizing(grid, state);
    bindWallPositioning(grid);
    scheduleTextFit(page);

    return page;
}
