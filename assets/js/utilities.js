export const APP_BASE_PATH = window.APP_BASE_PATH || '';

export function appUrl(path) {
    if (!path) {
        return '';
    }

    if (/^(?:https?:|data:|blob:)/i.test(path)) {
        return path;
    }

    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${APP_BASE_PATH}${normalized}`;
}

export function generateId(prefix = 'id') {
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function tileId(row, column) {
    return `r${row}-c${column}`;
}

export function parseTileId(id) {
    const match = /^r(\d+)-c(\d+)$/.exec(id);
    if (!match) {
        return null;
    }

    return {
        row: Number(match[1]),
        column: Number(match[2]),
    };
}

export function areAdjacent(firstTileId, secondTileId) {
    const first = parseTileId(firstTileId);
    const second = parseTileId(secondTileId);

    if (!first || !second) {
        return false;
    }

    const rowDelta = Math.abs(first.row - second.row);
    const columnDelta = Math.abs(first.column - second.column);

    return (rowDelta === 1 && columnDelta === 0) || (rowDelta === 0 && columnDelta === 1);
}

export function wallId(firstTileId, secondTileId) {
    return [firstTileId, secondTileId].sort().join('__');
}

export function wallOrientation(firstTileId, secondTileId) {
    const first = parseTileId(firstTileId);
    const second = parseTileId(secondTileId);

    if (!first || !second) {
        return 'horizontal';
    }

    return first.row === second.row ? 'vertical' : 'horizontal';
}

export function connectedWallIds(state, targetTileId) {
    return Object.entries(state.walls || {})
        .filter(([, wall]) => wall.from === targetTileId || wall.to === targetTileId)
        .map(([id]) => id);
}

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('The file could not be read.'));
        reader.readAsDataURL(file);
    });
}

export function setStatus(element, message, mode = 'neutral') {
    if (!element) {
        return;
    }

    element.textContent = message;
    element.className = 'rounded-full px-2 py-1 text-xs font-semibold';

    if (mode === 'success') {
        element.classList.add('bg-emerald-50', 'text-emerald-700');
    } else if (mode === 'error') {
        element.classList.add('bg-rose-50', 'text-rose-700');
    } else {
        element.classList.add('bg-slate-100', 'text-slate-600');
    }
}

export async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.focus();
    input.select();
    document.execCommand('copy');
    input.remove();
}

export function sanitizeFileName(value) {
    const cleaned = String(value || 'board-game')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return cleaned || 'board-game';
}

export function debounce(callback, delay = 80) {
    let timer = null;
    return (...args) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => callback(...args), delay);
    };
}
