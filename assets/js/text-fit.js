const MIN_READABLE_FONT_SIZE = 8;
const EMPTY_TEXT_FONT_SIZE = 18;
const FONT_SEARCH_STEPS = 16;

let canvasContext = null;

function getCanvasContext() {
    if (canvasContext) {
        return canvasContext;
    }

    const canvas = document.createElement('canvas');
    canvasContext = canvas.getContext('2d');
    return canvasContext;
}

function getFrame(element) {
    return element.closest('.tile-text-frame') || element.parentElement;
}

function getAvailableSize(element) {
    const frame = getFrame(element);

    if (!frame) {
        return { width: 0, height: 0 };
    }

    return {
        width: Math.max(0, frame.clientWidth),
        height: Math.max(0, frame.clientHeight),
    };
}

function getTextBoxSize(element, width, height) {
    const style = window.getComputedStyle(element);
    const horizontalPadding = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
    const verticalPadding = parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0');

    return {
        width: Math.max(0, width - horizontalPadding),
        height: Math.max(0, height - verticalPadding),
    };
}

function getFont(element, fontSize) {
    const style = window.getComputedStyle(element);
    const fontStyle = style.fontStyle || 'normal';
    const fontVariant = style.fontVariant || 'normal';
    const fontWeight = style.fontWeight || '800';
    const fontFamily = style.fontFamily || 'sans-serif';

    return `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize}px ${fontFamily}`;
}

function measureText(context, text) {
    return context.measureText(text).width;
}

function breakLongWord(context, word, maxWidth) {
    const parts = [];
    let current = '';

    Array.from(word).forEach((character) => {
        const next = `${current}${character}`;

        if (current && measureText(context, next) > maxWidth) {
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

function wrapParagraph(context, paragraph, maxWidth) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let forcedBreaks = 0;
    let currentLine = '';

    words.forEach((word) => {
        const candidate = currentLine ? `${currentLine} ${word}` : word;

        if (measureText(context, candidate) <= maxWidth) {
            currentLine = candidate;
            return;
        }

        if (currentLine) {
            lines.push(currentLine);
            currentLine = '';
        }

        if (measureText(context, word) <= maxWidth) {
            currentLine = word;
            return;
        }

        const wordParts = breakLongWord(context, word, maxWidth);
        forcedBreaks += Math.max(0, wordParts.length - 1);
        lines.push(...wordParts.slice(0, -1));
        currentLine = wordParts[wordParts.length - 1] || '';
    });

    if (currentLine) {
        lines.push(currentLine);
    }

    return { lines, forcedBreaks };
}

function wrapText(context, text, maxWidth, fixedLabel) {
    if (fixedLabel) {
        return { lines: [text.trim()], forcedBreaks: 0 };
    }

    const paragraphs = text
        .replace(/\r/g, '')
        .split('\n')
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

    if (!paragraphs.length) {
        return { lines: [], forcedBreaks: 0 };
    }

    return paragraphs.reduce((result, paragraph) => {
        const wrapped = wrapParagraph(context, paragraph, maxWidth);
        result.lines.push(...wrapped.lines);
        result.forcedBreaks += wrapped.forcedBreaks;
        return result;
    }, { lines: [], forcedBreaks: 0 });
}

function calculateLayout(element, fontSize, width, height, fixedLabel) {
    const context = getCanvasContext();
    const box = getTextBoxSize(element, width, height);
    const lineHeight = fixedLabel ? fontSize * 1.04 : fontSize * 1.08;

    context.font = getFont(element, fontSize);

    const wrappedText = wrapText(context, element.textContent.trim(), box.width, fixedLabel);
    const lines = wrappedText.lines;
    const widestLine = lines.reduce((widest, line) => Math.max(widest, measureText(context, line)), 0);
    const textHeight = lines.length * lineHeight;

    return {
        fits: widestLine <= box.width + 0.5 && textHeight <= box.height + 0.5,
        forcedBreaks: wrappedText.forcedBreaks,
        lineHeight,
    };
}

function domStillFits(element, frame) {
    return element.scrollWidth <= element.clientWidth + 1
        && element.scrollHeight <= frame.clientHeight + 1;
}

export function fitTextElement(element) {
    if (!element) {
        return;
    }

    const text = element.textContent.trim();
    const frame = getFrame(element);
    const { width, height } = getAvailableSize(element);

    if (!frame || !width || !height) {
        return;
    }

    const previousTransition = element.style.transition;
    const fixedLabel = element.classList.contains('is-fixed-label');

    element.style.transition = 'none';
    element.style.width = '100%';
    element.style.maxHeight = `${height}px`;
    element.style.whiteSpace = fixedLabel ? 'nowrap' : 'pre-wrap';
    element.style.overflowWrap = 'normal';
    element.style.wordBreak = fixedLabel ? 'normal' : 'normal';

    if (!text) {
        const emptySize = Math.max(MIN_READABLE_FONT_SIZE, Math.min(EMPTY_TEXT_FONT_SIZE, height * 0.42));
        element.style.fontSize = `${emptySize}px`;
        element.style.lineHeight = '1.08';
        element.style.transition = previousTransition;
        return;
    }

    const maxSize = Math.max(
        MIN_READABLE_FONT_SIZE,
        Math.min(58, height * (fixedLabel ? 0.62 : 0.52), width * (fixedLabel ? 0.42 : 0.5))
    );
    let low = MIN_READABLE_FONT_SIZE;
    let high = maxSize;
    let best = MIN_READABLE_FONT_SIZE;

    for (let index = 0; index < FONT_SEARCH_STEPS; index += 1) {
        const candidate = (low + high) / 2;
        const layout = calculateLayout(element, candidate, width, height, fixedLabel);
        const canUseLayout = layout.fits && (!layout.forcedBreaks || candidate <= MIN_READABLE_FONT_SIZE);

        if (canUseLayout) {
            best = candidate;
            low = candidate;
        } else {
            high = candidate;
        }
    }

    best = Math.max(MIN_READABLE_FONT_SIZE, best - 0.35);
    let finalLayout = calculateLayout(element, best, width, height, fixedLabel);

    element.style.fontSize = `${Math.floor(best * 10) / 10}px`;
    element.style.lineHeight = `${finalLayout.lineHeight}px`;

    while (!domStillFits(element, frame) && best > MIN_READABLE_FONT_SIZE) {
        best = Math.max(MIN_READABLE_FONT_SIZE, best - 0.25);
        finalLayout = calculateLayout(element, best, width, height, fixedLabel);
        element.style.fontSize = `${Math.floor(best * 10) / 10}px`;
        element.style.lineHeight = `${finalLayout.lineHeight}px`;
    }

    if (!domStillFits(element, frame) && !fixedLabel) {
        element.style.overflowWrap = 'anywhere';
        element.style.wordBreak = 'break-word';
    }

    element.style.transition = previousTransition;
}

export function fitBoardTitleElement(element) {
    if (!element) {
        return;
    }

    const text = element.textContent.trim();
    const width = element.clientWidth;
    const height = element.clientHeight;

    if (!text || !width || !height) {
        return;
    }

    const previousTransition = element.style.transition;
    element.style.transition = 'none';
    element.style.whiteSpace = 'pre-wrap';
    element.style.overflowWrap = 'normal';
    element.style.wordBreak = 'normal';

    const minSize = 10;
    const maxSize = Math.max(minSize, Math.min(56, height * 0.62, width * 0.1));
    let low = minSize;
    let high = maxSize;
    let best = minSize;

    for (let index = 0; index < FONT_SEARCH_STEPS; index += 1) {
        const candidate = (low + high) / 2;
        const layout = calculateLayout(element, candidate, width, height, false);
        const canUseLayout = layout.fits && (!layout.forcedBreaks || candidate <= minSize);

        if (canUseLayout) {
            best = candidate;
            low = candidate;
        } else {
            high = candidate;
        }
    }

    best = Math.max(minSize, best - 0.5);
    let finalLayout = calculateLayout(element, best, width, height, false);
    element.style.fontSize = `${Math.floor(best * 10) / 10}px`;
    element.style.lineHeight = `${finalLayout.lineHeight}px`;

    while (element.scrollHeight > element.clientHeight + 1 && best > minSize) {
        best = Math.max(minSize, best - 0.5);
        finalLayout = calculateLayout(element, best, width, height, false);
        element.style.fontSize = `${Math.floor(best * 10) / 10}px`;
        element.style.lineHeight = `${finalLayout.lineHeight}px`;
    }

    if (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) {
        element.style.overflowWrap = 'anywhere';
        element.style.wordBreak = 'break-word';
        finalLayout = calculateLayout(element, minSize, width, height, false);
        element.style.fontSize = `${minSize}px`;
        element.style.lineHeight = `${finalLayout.lineHeight}px`;
    }

    element.style.transition = previousTransition;
}

export function fitAllTileText(root = document) {
    root.querySelectorAll('[data-tile-text]').forEach((element) => {
        fitTextElement(element);
    });
}

export function fitAllBoardTitles(root = document) {
    root.querySelectorAll('[data-board-title]').forEach((element) => {
        fitBoardTitleElement(element);
    });
}

export function scheduleTextFit(root = document) {
    window.requestAnimationFrame(() => {
        fitAllTileText(root);
        fitAllBoardTitles(root);
        window.requestAnimationFrame(() => {
            fitAllTileText(root);
            fitAllBoardTitles(root);
        });
    });
}
