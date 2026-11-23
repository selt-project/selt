const pdfUpload = document.querySelector('#pdfUpload');
const playStatus = document.querySelector('#playStatus');
const canvas = document.querySelector('#pdfCanvas');
const pawnLayer = document.querySelector('#pawnLayer');
const emptyPlayState = document.querySelector('#emptyPlayState');
const pawnCountRange = document.querySelector('#pawnCountRange');
const pawnCountOutput = document.querySelector('#pawnCountOutput');
const diceFace = document.querySelector('#diceFace');
const rollDiceButton = document.querySelector('#rollDiceButton');

const PAWN_SIZE = 38;
const PAWN_COLORS = [
    '#e11d48',
    '#2563eb',
    '#16a34a',
    '#ca8a04',
    '#7c3aed',
    '#0f766e',
    '#ea580c',
    '#be185d',
    '#0891b2',
    '#4f46e5',
    '#65a30d',
    '#b45309',
    '#dc2626',
    '#0369a1',
    '#15803d',
    '#9333ea',
    '#c2410c',
    '#475569',
    '#047857',
    '#b91c1c',
];

let pawns = [];
let activeDrag = null;

if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function setPlayStatus(message, isError = false) {
    playStatus.textContent = message;
    playStatus.className = `mt-3 text-xs ${isError ? 'text-rose-600' : 'text-slate-500'}`;
}

function hasLoadedPdf() {
    return canvas.style.display === 'block';
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function setPawnCountDisplay(count) {
    if (pawnCountOutput) {
        pawnCountOutput.textContent = String(count);
    }

    if (pawnCountRange) {
        pawnCountRange.value = String(count);
    }
}

function getPawnBounds(layerRect) {
    return {
        maxX: Math.max(0, layerRect.width - PAWN_SIZE),
        maxY: Math.max(0, layerRect.height - PAWN_SIZE),
    };
}

function defaultPawnPosition(index, layerRect) {
    const gap = 10;
    const inset = 12;
    const availableWidth = Math.max(PAWN_SIZE, layerRect.width - inset * 2);
    const columns = Math.max(1, Math.floor((availableWidth + gap) / (PAWN_SIZE + gap)));
    const column = index % columns;
    const row = Math.floor(index / columns);
    const bounds = getPawnBounds(layerRect);

    return {
        x: clamp(inset + column * (PAWN_SIZE + gap), 0, bounds.maxX),
        y: clamp(inset + row * (PAWN_SIZE + gap), 0, bounds.maxY),
    };
}

function syncPawnLayerToCanvas() {
    if (!hasLoadedPdf()) {
        return;
    }

    pawnLayer.style.left = `${canvas.offsetLeft}px`;
    pawnLayer.style.top = `${canvas.offsetTop}px`;
    pawnLayer.style.width = `${canvas.clientWidth}px`;
    pawnLayer.style.height = `${canvas.clientHeight}px`;
}

function renderPawns() {
    pawnLayer.innerHTML = '';

    if (!hasLoadedPdf()) {
        return;
    }

    syncPawnLayerToCanvas();

    const layerRect = pawnLayer.getBoundingClientRect();
    const bounds = getPawnBounds(layerRect);

    pawns.forEach((pawn, index) => {
        if (pawn.xRatio === null || pawn.yRatio === null) {
            const position = defaultPawnPosition(index, layerRect);
            pawn.xRatio = bounds.maxX ? position.x / bounds.maxX : 0;
            pawn.yRatio = bounds.maxY ? position.y / bounds.maxY : 0;
        }

        const x = clamp(pawn.xRatio * bounds.maxX, 0, bounds.maxX);
        const y = clamp(pawn.yRatio * bounds.maxY, 0, bounds.maxY);
        const element = document.createElement('button');

        element.type = 'button';
        element.className = 'screen-pawn';
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
        element.style.setProperty('--pawn-color', pawn.color);
        element.dataset.pawnId = String(pawn.id);
        element.textContent = String(pawn.id);
        element.setAttribute('aria-label', `Movable pawn ${pawn.id}`);

        pawnLayer.appendChild(element);
    });
}

function setPawnCount(count) {
    const nextCount = clamp(Number.parseInt(count, 10) || 0, 0, 20);

    while (pawns.length < nextCount) {
        const id = pawns.length + 1;
        pawns.push({
            id,
            color: PAWN_COLORS[(id - 1) % PAWN_COLORS.length],
            xRatio: null,
            yRatio: null,
        });
    }

    if (pawns.length > nextCount) {
        pawns = pawns.slice(0, nextCount);
    }

    setPawnCountDisplay(nextCount);
    renderPawns();

    if (!hasLoadedPdf() && nextCount > 0) {
        setPlayStatus('Upload a PDF to show pawns on the board.');
    }
}

async function renderPdf(file) {
    if (!window.pdfjsLib) {
        setPlayStatus('PDF.js could not be loaded.', true);
        return;
    }

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
        setPlayStatus('Please upload a PDF file.', true);
        return;
    }

    const bytes = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;

    if (pdf.numPages !== 1) {
        throw new Error('Please upload a single-page PDF board game.');
    }

    const page = await pdf.getPage(1);
    const originalViewport = page.getViewport({ scale: 1 });

    if (originalViewport.height <= originalViewport.width) {
        throw new Error('Please upload a portrait PDF board game.');
    }

    const viewport = page.getViewport({ scale: 1.5 });
    const context = canvas.getContext('2d');

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.display = 'block';
    emptyPlayState.style.display = 'none';

    await page.render({
        canvasContext: context,
        viewport,
    }).promise;

    syncPawnLayerToCanvas();
    renderPawns();
    setPlayStatus(`Loaded ${file.name}. Confirmed: one portrait page.`);
}

function pointerPosition(event) {
    return {
        x: event.clientX,
        y: event.clientY,
    };
}

function beginPawnDrag(event, pawnElement) {
    const position = pointerPosition(event);
    const rect = pawnElement.getBoundingClientRect();
    const pawn = pawns.find((item) => item.id === Number(pawnElement.dataset.pawnId));

    if (!pawn) {
        return;
    }

    activeDrag = {
        pawn,
        element: pawnElement,
        offsetX: position.x - rect.left,
        offsetY: position.y - rect.top,
    };

    pawnElement.setPointerCapture(event.pointerId);
}

function movePawn(event) {
    if (!activeDrag) {
        return;
    }

    const layerRect = pawnLayer.getBoundingClientRect();
    const position = pointerPosition(event);
    const bounds = getPawnBounds(layerRect);
    const x = clamp(position.x - layerRect.left - activeDrag.offsetX, 0, bounds.maxX);
    const y = clamp(position.y - layerRect.top - activeDrag.offsetY, 0, bounds.maxY);

    activeDrag.element.style.left = `${x}px`;
    activeDrag.element.style.top = `${y}px`;
    activeDrag.pawn.xRatio = bounds.maxX ? x / bounds.maxX : 0;
    activeDrag.pawn.yRatio = bounds.maxY ? y / bounds.maxY : 0;
}

function endPawnDrag() {
    activeDrag = null;
}

pdfUpload?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
        return;
    }

    try {
        setPlayStatus('Rendering PDF...');
        await renderPdf(file);
    } catch (error) {
        setPlayStatus(error.message || 'The PDF could not be rendered.', true);
        event.target.value = '';
    }
});

pawnCountRange?.addEventListener('input', (event) => {
    setPawnCount(event.target.value);
});

pawnLayer?.addEventListener('pointerdown', (event) => {
    const pawn = event.target.closest('.screen-pawn');
    if (!pawn) {
        return;
    }

    beginPawnDrag(event, pawn);
});

pawnLayer?.addEventListener('pointermove', movePawn);
pawnLayer?.addEventListener('pointerup', endPawnDrag);
pawnLayer?.addEventListener('pointercancel', endPawnDrag);

window.addEventListener('resize', () => {
    syncPawnLayerToCanvas();
    renderPawns();
});

rollDiceButton?.addEventListener('click', () => {
    rollDiceButton.disabled = true;
    diceFace.classList.add('is-rolling');

    let ticks = 0;
    const timer = window.setInterval(() => {
        diceFace.textContent = String(Math.floor(Math.random() * 6) + 1);
        ticks += 1;

        if (ticks > 10) {
            window.clearInterval(timer);
            diceFace.textContent = String(Math.floor(Math.random() * 6) + 1);
            diceFace.classList.remove('is-rolling');
            rollDiceButton.disabled = false;
        }
    }, 70);
});

setPawnCount(0);
