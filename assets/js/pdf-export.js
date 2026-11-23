import { resolveBackgroundUrl, resolveImageUrl } from './board-renderer.js';
import { appUrl, parseTileId, sanitizeFileName } from './utilities.js';

const A4_WIDTH = 210;
const A4_HEIGHT = 297;
const MIN_TEXT_FONT_SIZE = 8;
const MIN_COMPRESSED_TEXT_FONT_SIZE = 3.5;
const MAX_TEXT_FONT_SIZE = 18;
const PT_TO_MM = 0.352777778;
const TITLE_CANVAS_SCALE = 8;
const WATERMARK_IMAGE = '/assets/images/watermark/watermark.png';

const imageResourceCache = new Map();

function waitForLibrary(predicate, name) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = window.setInterval(() => {
            if (predicate()) {
                window.clearInterval(timer);
                resolve();
                return;
            }

            if (Date.now() - startedAt > 7000) {
                window.clearInterval(timer);
                reject(new Error(`${name} could not be loaded.`));
            }
        }, 80);
    });
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Image data could not be read.'));
        reader.readAsDataURL(blob);
    });
}

function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Image could not be loaded.'));
        image.src = dataUrl;
    });
}

async function loadImageResource(source) {
    if (!source) {
        return null;
    }

    if (imageResourceCache.has(source)) {
        return imageResourceCache.get(source);
    }

    const resource = (async () => {
        const dataUrl = source.startsWith('data:')
            ? source
            : await fetch(source).then((response) => {
                if (!response.ok) {
                    throw new Error('Image request failed.');
                }
                return response.blob();
            }).then(blobToDataUrl);
        const image = await loadImage(dataUrl);

        return {
            dataUrl,
            width: image.naturalWidth || image.width,
            height: image.naturalHeight || image.height,
        };
    })();

    imageResourceCache.set(source, resource);
    return resource;
}

function hexToRgb(hex, fallback = '#111827') {
    const value = String(hex || fallback).trim();
    const normalized = value.startsWith('#') ? value.slice(1) : value;
    const full = normalized.length === 3
        ? normalized.split('').map((character) => character + character).join('')
        : normalized;

    if (!/^[0-9a-f]{6}$/i.test(full)) {
        return hexToRgb(fallback, '#111827');
    }

    return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16),
    };
}

function setFillColor(pdf, color, fallback) {
    const rgb = hexToRgb(color, fallback);
    pdf.setFillColor(rgb.r, rgb.g, rgb.b);
}

function setDrawColor(pdf, color, fallback) {
    const rgb = hexToRgb(color, fallback);
    pdf.setDrawColor(rgb.r, rgb.g, rgb.b);
}

function setTextColor(pdf, color, fallback) {
    const rgb = hexToRgb(color, fallback);
    pdf.setTextColor(rgb.r, rgb.g, rgb.b);
}

function imageFormat() {
    return 'PNG';
}

function calculateContainRect(sourceWidth, sourceHeight, targetRect) {
    const ratio = Math.min(targetRect.width / sourceWidth, targetRect.height / sourceHeight);
    const width = sourceWidth * ratio;
    const height = sourceHeight * ratio;

    return {
        x: targetRect.x + (targetRect.width - width) / 2,
        y: targetRect.y + (targetRect.height - height) / 2,
        width,
        height,
    };
}

function calculateBackgroundRect(sourceWidth, sourceHeight, fit) {
    if (fit === 'stretch') {
        return { x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT };
    }

    const pageRatio = A4_WIDTH / A4_HEIGHT;
    const imageRatio = sourceWidth / sourceHeight;
    const cover = fit !== 'contain';
    const useWidth = cover ? imageRatio < pageRatio : imageRatio > pageRatio;
    const width = useWidth ? A4_WIDTH : A4_HEIGHT * imageRatio;
    const height = useWidth ? A4_WIDTH / imageRatio : A4_HEIGHT;

    return {
        x: (A4_WIDTH - width) / 2,
        y: (A4_HEIGHT - height) / 2,
        width,
        height,
    };
}

function getLayout(state) {
    const columns = state.grid.columns;
    const rows = state.grid.rows;
    const margin = 8;
    const titleMargin = 11;
    const topMargin = 5.5;
    const titleHeight = 22;
    const titleGap = 2;
    const footerHeight = 12;
    const bottomMargin = 5;
    const gap = 0.75;
    const gridMaxWidth = A4_WIDTH - margin * 2;
    const gridMaxHeight = A4_HEIGHT - topMargin - titleHeight - titleGap - footerHeight - bottomMargin;
    const tileSize = Math.min(
        (gridMaxWidth - (columns - 1) * gap) / columns,
        (gridMaxHeight - (rows - 1) * gap) / rows
    );
    const gridWidth = columns * tileSize + (columns - 1) * gap;
    const gridHeight = rows * tileSize + (rows - 1) * gap;
    const gridX = (A4_WIDTH - gridWidth) / 2;
    const gridY = topMargin + titleHeight + titleGap + (gridMaxHeight - gridHeight) / 2;

    return {
        margin,
        titleMargin,
        topMargin,
        titleHeight,
        footerY: A4_HEIGHT - bottomMargin - footerHeight,
        footerHeight,
        gap,
        tileSize,
        gridX,
        gridY,
        gridWidth,
        gridHeight,
    };
}

function tileRect(layout, tileId) {
    const parsed = parseTileId(tileId);

    if (!parsed) {
        return null;
    }

    return {
        x: layout.gridX + (parsed.column - 1) * (layout.tileSize + layout.gap),
        y: layout.gridY + (parsed.row - 1) * (layout.tileSize + layout.gap),
        width: layout.tileSize,
        height: layout.tileSize,
        row: parsed.row,
        column: parsed.column,
    };
}

function normalizeText(value) {
    return String(value || '')
        .replace(/\r/g, '')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function colorToCss(color, fallback) {
    const rgb = hexToRgb(color, fallback);
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function measureCanvasLine(context, line) {
    return context.measureText(line).width;
}

function breakCanvasWord(context, word, maxWidth) {
    const parts = [];
    let current = '';

    Array.from(word).forEach((character) => {
        const next = `${current}${character}`;

        if (current && measureCanvasLine(context, next) > maxWidth) {
            parts.push(current);
            current = character;
            return;
        }

        current = next;
    });

    if (current) {
        parts.push(current);
    }

    return parts;
}

function wrapCanvasGreedy(context, text, maxWidth, maxLines) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';

    words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;

        if (measureCanvasLine(context, candidate) <= maxWidth) {
            current = candidate;
            return;
        }

        if (current) {
            lines.push(current);
            current = '';
        }

        if (measureCanvasLine(context, word) <= maxWidth) {
            current = word;
            return;
        }

        const parts = breakCanvasWord(context, word, maxWidth);
        lines.push(...parts.slice(0, -1));
        current = parts[parts.length - 1] || '';
    });

    if (current) {
        lines.push(current);
    }

    return lines.slice(0, maxLines);
}

function wrapCanvasTitle(context, text, maxWidth, maxLines = 2) {
    const words = text.split(/\s+/).filter(Boolean);

    if (!words.length) {
        return [];
    }

    if (measureCanvasLine(context, text) <= maxWidth) {
        return [text];
    }

    if (maxLines === 2 && words.length > 1) {
        let best = null;

        for (let splitIndex = 1; splitIndex < words.length; splitIndex += 1) {
            const firstLine = words.slice(0, splitIndex).join(' ');
            const secondLine = words.slice(splitIndex).join(' ');
            const firstWidth = measureCanvasLine(context, firstLine);
            const secondWidth = measureCanvasLine(context, secondLine);

            if (firstWidth > maxWidth || secondWidth > maxWidth) {
                continue;
            }

            const widest = Math.max(firstWidth, secondWidth);
            const balance = Math.abs(firstWidth - secondWidth);
            const score = widest + balance * 0.35;

            if (!best || score < best.score) {
                best = {
                    lines: [firstLine, secondLine],
                    score,
                };
            }
        }

        if (best) {
            return best.lines;
        }
    }

    return wrapCanvasGreedy(context, text, maxWidth, maxLines);
}

function createBoardTitleCanvas(title, color, widthMm, heightMm) {
    const canvas = document.createElement('canvas');
    const width = Math.max(1, Math.round(widthMm * TITLE_CANVAS_SCALE));
    const height = Math.max(1, Math.round(heightMm * TITLE_CANVAS_SCALE));
    const horizontalPadding = Math.round(1.2 * TITLE_CANVAS_SCALE);
    const verticalPadding = Math.round(0.55 * TITLE_CANVAS_SCALE);
    const context = canvas.getContext('2d');
    const fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
    const minFontSize = Math.round(4.2 * TITLE_CANVAS_SCALE);
    const maxFontSize = Math.round(14.2 * TITLE_CANVAS_SCALE);

    canvas.width = width;
    canvas.height = height;
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillStyle = colorToCss(color, '#0f172a');

    const maxTextWidth = Math.max(1, width - horizontalPadding * 2);
    const maxTextHeight = Math.max(1, height - verticalPadding * 2);
    let low = minFontSize;
    let high = maxFontSize;
    let best = minFontSize;
    let bestLines = [title];
    let bestLineHeight = minFontSize * 1.02;

    for (let index = 0; index < 18; index += 1) {
        const candidate = (low + high) / 2;
        context.font = `800 ${candidate}px ${fontFamily}`;

        const lines = wrapCanvasTitle(context, title, maxTextWidth, 2);
        const lineHeight = candidate * 1.02;
        const totalHeight = lines.length * lineHeight;
        const widest = lines.reduce((max, line) => Math.max(max, measureCanvasLine(context, line)), 0);

        if (lines.length && widest <= maxTextWidth && totalHeight <= maxTextHeight) {
            best = candidate;
            bestLines = lines;
            bestLineHeight = lineHeight;
            low = candidate;
        } else {
            high = candidate;
        }
    }

    context.font = `800 ${best}px ${fontFamily}`;
    const blockHeight = bestLines.length * bestLineHeight;
    const firstBaseline = (height - blockHeight) / 2 + best * 0.82;

    bestLines.forEach((line, index) => {
        context.fillText(line, width / 2, firstBaseline + index * bestLineHeight);
    });

    return canvas;
}

function createFixedTileLabelCanvas(text, color, widthMm, heightMm) {
    const canvas = document.createElement('canvas');
    const width = Math.max(1, Math.round(widthMm * TITLE_CANVAS_SCALE));
    const height = Math.max(1, Math.round(heightMm * TITLE_CANVAS_SCALE));
    const paddingX = Math.round(0.55 * TITLE_CANVAS_SCALE);
    const paddingY = Math.round(0.35 * TITLE_CANVAS_SCALE);
    const context = canvas.getContext('2d');
    const fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
    const maxTextWidth = Math.max(1, width - paddingX * 2);
    const maxTextHeight = Math.max(1, height - paddingY * 2);
    const minFontSize = Math.round(3 * TITLE_CANVAS_SCALE);
    const maxFontSize = Math.round(Math.min(height * 0.5, width * 0.215));
    let low = minFontSize;
    let high = Math.max(minFontSize, maxFontSize);
    let best = minFontSize;

    canvas.width = width;
    canvas.height = height;
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillStyle = colorToCss(color, '#ffffff');

    for (let index = 0; index < 18; index += 1) {
        const candidate = (low + high) / 2;
        context.font = `900 ${candidate}px ${fontFamily}`;
        const metrics = context.measureText(text);
        const textHeight = (metrics.actualBoundingBoxAscent || candidate * 0.78) + (metrics.actualBoundingBoxDescent || candidate * 0.22);

        if (metrics.width <= maxTextWidth && textHeight <= maxTextHeight) {
            best = candidate;
            low = candidate;
        } else {
            high = candidate;
        }
    }

    context.font = `900 ${best}px ${fontFamily}`;
    const metrics = context.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent || best * 0.78;
    const descent = metrics.actualBoundingBoxDescent || best * 0.22;
    const baseline = (height - ascent - descent) / 2 + ascent;

    context.fillText(text, width / 2, baseline);

    return canvas;
}

function createSingleLineTextCanvas(text, color, widthMm, heightMm, options = {}) {
    const canvas = document.createElement('canvas');
    const width = Math.max(1, Math.round(widthMm * TITLE_CANVAS_SCALE));
    const height = Math.max(1, Math.round(heightMm * TITLE_CANVAS_SCALE));
    const paddingX = Math.round((options.paddingXmm ?? 1.3) * TITLE_CANVAS_SCALE);
    const context = canvas.getContext('2d');
    const fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
    const targetFont = Math.max(1, (options.fontPt || 7.5) * PT_TO_MM * TITLE_CANVAS_SCALE);
    const minFont = Math.max(1, (options.minFontPt || 5.5) * PT_TO_MM * TITLE_CANVAS_SCALE);
    let fontSize = targetFont;

    canvas.width = width;
    canvas.height = height;
    context.textBaseline = 'middle';
    context.textAlign = options.align || 'left';
    context.fillStyle = colorToCss(color, '#0f172a');
    context.font = `${options.weight || 700} ${fontSize}px ${fontFamily}`;

    const maxWidth = Math.max(1, width - paddingX * 2);
    while (context.measureText(text).width > maxWidth && fontSize > minFont) {
        fontSize -= 0.5;
        context.font = `${options.weight || 700} ${fontSize}px ${fontFamily}`;
    }

    const x = context.textAlign === 'right'
        ? width - paddingX
        : context.textAlign === 'center'
            ? width / 2
            : paddingX;

    context.fillText(text, x, height / 2);

    return canvas;
}

function breakLongWord(pdf, word, maxWidth) {
    const parts = [];
    let current = '';

    Array.from(word).forEach((character) => {
        const next = `${current}${character}`;

        if (current && pdf.getTextWidth(next) > maxWidth) {
            parts.push(current);
            current = character;
            return;
        }

        current = next;
    });

    if (current) {
        parts.push(current);
    }

    return parts;
}

function wrapParagraph(pdf, paragraph, maxWidth, allowLongWordBreak) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let currentLine = '';
    let forcedBreaks = 0;

    words.forEach((word) => {
        const candidate = currentLine ? `${currentLine} ${word}` : word;

        if (pdf.getTextWidth(candidate) <= maxWidth) {
            currentLine = candidate;
            return;
        }

        if (currentLine) {
            lines.push(currentLine);
            currentLine = '';
        }

        if (pdf.getTextWidth(word) <= maxWidth || !allowLongWordBreak) {
            currentLine = word;
            forcedBreaks += pdf.getTextWidth(word) > maxWidth ? 1 : 0;
            return;
        }

        const parts = breakLongWord(pdf, word, maxWidth);
        forcedBreaks += Math.max(0, parts.length - 1);
        lines.push(...parts.slice(0, -1));
        currentLine = parts[parts.length - 1] || '';
    });

    if (currentLine) {
        lines.push(currentLine);
    }

    return { lines, forcedBreaks };
}

function wrapText(pdf, text, maxWidth, fixedLabel, allowLongWordBreak = false) {
    if (fixedLabel) {
        return { lines: [text], forcedBreaks: 0 };
    }

    return text.split('\n').reduce((result, paragraph) => {
        const wrapped = wrapParagraph(pdf, paragraph, maxWidth, allowLongWordBreak);
        result.lines.push(...wrapped.lines);
        result.forcedBreaks += wrapped.forcedBreaks;
        return result;
    }, { lines: [], forcedBreaks: 0 });
}

function measureTextLayout(pdf, text, fontSize, box, fixedLabel, allowLongWordBreak = false, allowForcedBreaks = false) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(fontSize);

    const wrapped = wrapText(pdf, text, box.width, fixedLabel, allowLongWordBreak);
    const lineHeight = fontSize * PT_TO_MM * 1.02;
    const fontHeight = fontSize * PT_TO_MM;
    const totalHeight = wrapped.lines.length
        ? fontHeight + (wrapped.lines.length - 1) * lineHeight
        : 0;
    const widestLine = wrapped.lines.reduce((widest, line) => Math.max(widest, pdf.getTextWidth(line)), 0);

    return {
        lines: wrapped.lines,
        lineHeight,
        fontHeight,
        totalHeight,
        fits: widestLine <= box.width + 0.05
            && totalHeight <= box.height + 0.05
            && (allowForcedBreaks || wrapped.forcedBreaks === 0),
    };
}

function fitPdfText(pdf, text, box, fixedLabel = false, minFontSize = MIN_TEXT_FONT_SIZE, maxFontSize = MAX_TEXT_FONT_SIZE) {
    let low = minFontSize;
    let high = maxFontSize;
    let best = minFontSize;
    let bestLayout = measureTextLayout(pdf, text, best, box, fixedLabel);

    for (let index = 0; index < 16; index += 1) {
        const candidate = (low + high) / 2;
        const layout = measureTextLayout(pdf, text, candidate, box, fixedLabel);

        if (layout.fits) {
            best = candidate;
            bestLayout = layout;
            low = candidate;
        } else {
            high = candidate;
        }
    }

    if (!bestLayout.fits) {
        low = MIN_COMPRESSED_TEXT_FONT_SIZE;
        high = maxFontSize;
        best = MIN_COMPRESSED_TEXT_FONT_SIZE;
        bestLayout = measureTextLayout(pdf, text, best, box, fixedLabel, true, true);

        for (let index = 0; index < 16; index += 1) {
            const candidate = (low + high) / 2;
            const layout = measureTextLayout(pdf, text, candidate, box, fixedLabel, true, true);

            if (layout.fits) {
                best = candidate;
                bestLayout = layout;
                low = candidate;
            } else {
                high = candidate;
            }
        }
    }

    if (bestLayout.lines.length > 1 && bestLayout.totalHeight > box.height) {
        const compactLineHeight = (box.height - bestLayout.fontHeight) / (bestLayout.lines.length - 1);
        const minimumLineHeight = bestLayout.fontHeight * 0.82;

        if (compactLineHeight >= minimumLineHeight) {
            bestLayout = {
                ...bestLayout,
                lineHeight: compactLineHeight,
                totalHeight: bestLayout.fontHeight + (bestLayout.lines.length - 1) * compactLineHeight,
            };
        }
    }

    return {
        fontSize: Math.max(MIN_COMPRESSED_TEXT_FONT_SIZE, Math.floor(best * 10) / 10),
        ...bestLayout,
    };
}

function drawFittedText(pdf, text, color, rect, fixedLabel = false) {
    const normalizedText = normalizeText(text);

    if (!normalizedText) {
        return;
    }

    if (fixedLabel) {
        const labelCanvas = createFixedTileLabelCanvas(normalizedText, color || '#ffffff', rect.width, rect.height);
        pdf.addImage(labelCanvas.toDataURL('image/png'), 'PNG', rect.x, rect.y, rect.width, rect.height);
        return;
    }

    const padding = Math.max(0.25, rect.width * 0.025);
    const box = {
        x: rect.x + padding,
        y: rect.y + padding,
        width: Math.max(1, rect.width - padding * 2),
        height: Math.max(1, rect.height - padding * 2),
    };
    const layout = fitPdfText(pdf, normalizedText, box, fixedLabel);
    const blockHeight = layout.fontHeight + (layout.lines.length - 1) * layout.lineHeight;
    const firstBaseline = box.y + (box.height - blockHeight) / 2 + layout.fontHeight * 0.76;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(layout.fontSize);
    setTextColor(pdf, color, '#111827');

    layout.lines.forEach((line, index) => {
        pdf.text(line, box.x + box.width / 2, firstBaseline + index * layout.lineHeight, {
            align: 'center',
        });
    });
}

async function drawBackground(pdf, state) {
    const backgroundUrl = await resolveBackgroundUrl(state);

    setFillColor(pdf, '#ffffff', '#ffffff');
    pdf.rect(0, 0, A4_WIDTH, A4_HEIGHT, 'F');

    if (!backgroundUrl) {
        return;
    }

    try {
        const background = await loadImageResource(backgroundUrl);
        const rect = calculateBackgroundRect(background.width, background.height, state.background?.fit || 'cover');
        pdf.addImage(background.dataUrl, imageFormat(background.dataUrl), rect.x, rect.y, rect.width, rect.height);
    } catch (error) {
        console.warn('Background could not be added to the PDF.', error);
    }
}

function drawTileShape(pdf, tile, rect) {
    setFillColor(pdf, tile.color || '#fef08a', '#fef08a');
    setDrawColor(pdf, '#b6bdc8', '#b6bdc8');
    pdf.setLineWidth(0.28);
    pdf.roundedRect(rect.x, rect.y, rect.width, rect.height, 1.2, 1.2, 'FD');
}

async function drawTileImage(pdf, state, tile, rect) {
    if (!tile.imageId) {
        return;
    }

    const imageUrl = await resolveImageUrl(state, tile.imageId);

    if (!imageUrl) {
        return;
    }

    try {
        const image = await loadImageResource(imageUrl);
        const fitted = calculateContainRect(image.width, image.height, rect);
        pdf.addImage(image.dataUrl, imageFormat(image.dataUrl), fitted.x, fitted.y, fitted.width, fitted.height);
    } catch (error) {
        console.warn('Tile image could not be added to the PDF.', error);
    }
}

function getTileText(tile) {
    if (tile.type === 'start') {
        return 'START';
    }

    if (tile.type === 'finish') {
        return 'FINISH';
    }

    return tile.text || '';
}

async function drawTileContent(pdf, state, tile, rect) {
    const text = getTileText(tile);
    const hasText = Boolean(normalizeText(text));
    const hasImage = Boolean(tile.imageId) && !hasText;
    const contentPadding = rect.width * 0.04;
    const contentRect = {
        x: rect.x + contentPadding,
        y: rect.y + contentPadding,
        width: rect.width - contentPadding * 2,
        height: rect.height - contentPadding * 2,
    };

    if (hasImage && hasText) {
        const imageRect = {
            x: contentRect.x,
            y: contentRect.y,
            width: contentRect.width,
            height: contentRect.height * 0.43,
        };
        const textRect = {
            x: contentRect.x,
            y: contentRect.y + contentRect.height * 0.45,
            width: contentRect.width,
            height: contentRect.height * 0.55,
        };
        await drawTileImage(pdf, state, tile, imageRect);
        drawFittedText(pdf, text, tile.textColor || '#111827', textRect, tile.type === 'start' || tile.type === 'finish');
        return;
    }

    if (hasImage) {
        await drawTileImage(pdf, state, tile, contentRect);
    }

    if (hasText) {
        drawFittedText(pdf, text, tile.textColor || '#111827', contentRect, tile.type === 'start' || tile.type === 'finish');
    }
}

async function drawTiles(pdf, state, layout) {
    const activeTiles = Object.entries(state.tiles || {})
        .filter(([, tile]) => tile?.active);

    for (const [id, tile] of activeTiles) {
        const rect = tileRect(layout, id);

        if (!rect) {
            continue;
        }

        drawTileShape(pdf, tile, rect);
        await drawTileContent(pdf, state, tile, rect);
    }
}

function drawWall(pdf, wall, layout) {
    const fromRect = tileRect(layout, wall.from);
    const toRect = tileRect(layout, wall.to);

    if (!fromRect || !toRect) {
        return;
    }

    const sameRow = fromRect.row === toRect.row;
    const fontSize = Math.max(8, Math.min(11, layout.tileSize * 1.4));

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(fontSize);
    setTextColor(pdf, '#111827', '#111827');

    if (sameRow) {
        const x = (fromRect.x + fromRect.width + toRect.x) / 2;
        const y = fromRect.y + fromRect.height / 2;
        const spacing = layout.tileSize * 0.13;
        ['x', 'x', 'x', 'x'].forEach((mark, index) => {
            pdf.text(mark, x, y + (index - 1.5) * spacing, { align: 'center' });
        });
        return;
    }

    const x = fromRect.x + fromRect.width / 2;
    const y = (fromRect.y + fromRect.height + toRect.y) / 2;
    pdf.text('x x x x', x, y + fontSize * PT_TO_MM * 0.28, { align: 'center' });
}

function drawWalls(pdf, state, layout) {
    Object.values(state.walls || {}).forEach((wall) => drawWall(pdf, wall, layout));
}

async function drawTitleAndWatermark(pdf, state, layout) {
    const title = (normalizeText(state.boardTitle) || 'Untitled board game').slice(0, 90);
    const titleBox = {
        x: layout.titleMargin,
        y: layout.topMargin,
        width: A4_WIDTH - layout.titleMargin * 2,
        height: layout.titleHeight,
    };
    const titleCanvas = createBoardTitleCanvas(title, state.boardTitleColor || '#0f172a', titleBox.width, titleBox.height);
    pdf.addImage(titleCanvas.toDataURL('image/png'), 'PNG', titleBox.x, titleBox.y, titleBox.width, titleBox.height);

    const footerY = layout.footerY;
    const watermarkBox = {
        x: layout.margin,
        y: footerY + 0.7,
        width: 68,
        height: 8.48,
    };
    const creatorText = normalizeText(state.creatorName)
        ? `Prepared by ${normalizeText(state.creatorName).slice(0, 70)}`
        : '';

    try {
        const watermarkImage = await loadImageResource(appUrl(WATERMARK_IMAGE));
        const imageRatio = watermarkImage.height / watermarkImage.width;
        const watermarkHeight = watermarkBox.width * imageRatio;
        const watermarkY = footerY + (layout.footerHeight - watermarkHeight) / 2;
        pdf.addImage(
            watermarkImage.dataUrl,
            imageFormat(watermarkImage.dataUrl),
            watermarkBox.x,
            watermarkY,
            watermarkBox.width,
            watermarkHeight
        );
        watermarkBox.y = watermarkY;
        watermarkBox.height = watermarkHeight;
    } catch (error) {
        console.warn('Watermark image could not be added to the PDF.', error);
    }

    if (creatorText) {
        const creatorBox = {
            x: watermarkBox.x + watermarkBox.width + 4,
            y: footerY + layout.footerHeight - 7.8,
            width: A4_WIDTH - layout.margin - (watermarkBox.x + watermarkBox.width + 4),
            height: 7.4,
        };
        const creatorCanvas = createSingleLineTextCanvas(creatorText, state.creatorNameColor || '#0f172a', creatorBox.width, creatorBox.height, {
            fontPt: 9.8,
            minFontPt: 7.1,
            weight: 800,
            align: 'right',
            paddingXmm: 0.4,
        });
        pdf.addImage(creatorCanvas.toDataURL('image/png'), 'PNG', creatorBox.x, creatorBox.y, creatorBox.width, creatorBox.height);
    }
}

export async function buildBoardPdf(state) {
    const pdf = new window.jspdf.jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
    });
    const layout = getLayout(state);

    await drawBackground(pdf, state);
    await drawTitleAndWatermark(pdf, state, layout);
    await drawTiles(pdf, state, layout);
    drawWalls(pdf, state, layout);

    return pdf;
}

export async function downloadBoardAsPdf(state, host, statusCallback = () => {}) {
    if (!state.grid?.columns || !state.grid?.rows) {
        statusCallback('Start a portrait board before downloading.', 'error');
        return;
    }

    await waitForLibrary(() => Boolean(window.jspdf?.jsPDF), 'jsPDF');

    if (host) {
        host.innerHTML = '';
    }

    statusCallback('Rendering PDF...', 'neutral');

    const pdf = await buildBoardPdf(state);
    const fileName = `${sanitizeFileName(state.boardTitle)}.pdf`;
    pdf.save(fileName);

    statusCallback('PDF downloaded.', 'success');
}
