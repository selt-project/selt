import {
    STEPS,
    canGoToStep,
    getCurrentStepIndex,
    getState,
    initializeState,
    mutateState,
    mutateStateSilently,
    resetPortraitBoard,
    setCurrentStep,
    startNewBoardSession,
    subscribe,
} from './state.js';
import { renderBoard } from './board-renderer.js';
import { renderBackgroundTools } from './background-manager.js';
import { renderBuildTools, handleBuildTileClick } from './tile-manager.js';
import {
    renderImageTools,
    assignImageToTile,
    clearSelectedImageForPlacement,
    getSelectedImageForPlacement,
    removeImageFromTile,
} from './image-manager.js';
import { renderWallTools, toggleWall } from './wall-manager.js';
import { renderAiSuggestionMenu, renderRandomSuggestionMenu } from './ai-helper.js';
import { downloadBoardAsPdf } from './pdf-export.js';
import { fitBoardTitleElement, fitTextElement } from './text-fit.js';
import { escapeHtml, setStatus } from './utilities.js';

const TEXT_COLORS = [
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
];
const CREDIT_COLORS = ['#0f172a', ...TEXT_COLORS.slice(1)];

let elements = {};
let renderVersion = 0;

function stepById(stepId) {
    return STEPS.find((step) => step.id === stepId) || STEPS[0];
}

function markSaved(message = 'Saved', mode = 'success') {
    setStatus(elements.saveStatus, message, mode);
}

function renderStepList(state) {
    elements.stepList.innerHTML = STEPS.map((step) => {
        const isActive = step.id === state.currentStep;
        const isDisabled = !canGoToStep(step.id);
        return `
            <button type="button" data-step-id="${step.id}" ${isActive ? 'aria-current="step"' : ''} class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'} ${isDisabled ? 'cursor-not-allowed opacity-40' : ''}" ${isDisabled ? 'disabled' : ''}>
                <span class="grid h-7 w-9 shrink-0 place-items-center rounded bg-white/20 text-xs font-black">${step.number}</span>
                <span class="font-semibold">${step.label}</span>
            </button>
        `;
    }).join('');

    elements.stepList.querySelectorAll('[data-step-id]').forEach((button) => {
        button.addEventListener('click', () => {
            const stepId = button.dataset.stepId;
            if (canGoToStep(stepId)) {
                setCurrentStep(stepId);
            }
        });
    });
}

function renderNavigation(state) {
    const currentIndex = getCurrentStepIndex();
    elements.previousStepButton.disabled = currentIndex <= 0;
    elements.nextStepButton.disabled = currentIndex >= STEPS.length - 1;
    elements.nextStepButton.hidden = elements.nextStepButton.disabled;

    elements.previousStepButton.classList.toggle('opacity-40', elements.previousStepButton.disabled);
    elements.nextStepButton.classList.toggle('opacity-40', elements.nextStepButton.disabled);
}

function renderPreviewMeta(state) {
    elements.previewMeta.textContent = `Portrait A4, ${state.grid.columns} columns x ${state.grid.rows} rows`;
}

function renderOrientationTools(container, state) {
    container.innerHTML = `
        <div class="space-y-4">
            <div class="board-format-options grid gap-3">
                <button type="button" data-start-portrait class="orientation-card is-selected">
                    <span class="block text-sm font-bold">Portrait board</span>
                    <span class="mt-1 block text-xs text-slate-500">9 columns x 11 rows</span>
                </button>
                <button type="button" class="orientation-card is-locked" disabled aria-disabled="true">
                    <span class="block text-sm font-bold">Landscape board</span>
                    <span class="mt-1 block text-xs text-slate-500">Coming soon</span>
                </button>
            </div>
            <aside class="board-format-guide" aria-labelledby="boardFormatGuideTitle">
                <h3 id="boardFormatGuideTitle">How to use this tool</h3>
                <p>Design a board game for language practice. Create a path from START to FINISH and add questions or instructions to the tiles.</p>
                <p>Players take turns rolling a die and follow the instructions on the tile they land on. They stay there if they complete it or go back to their previous tile if they cannot. The first player to reach FINISH wins.</p>
                <p>Print your board as a PDF or play it on a screen with a digital die and movable pawns.</p>
            </aside>
        </div>
    `;

    container.querySelector('[data-start-portrait]')?.addEventListener('click', () => {
        const currentState = getState();
        const hasBoardProgress = Object.values(currentState.tiles || {}).some((tile) => tile.active)
            || Object.keys(currentState.walls || {}).length > 0
            || Boolean(currentState.boardTitle)
            || Boolean(currentState.creatorName)
            || currentState.background?.type !== 'none';

        if (!hasBoardProgress) {
            resetPortraitBoard();
        }

        setCurrentStep('background');
    });
}

function renderTextTools(container, state) {
    const selectedColor = state.selectedTextColor || '#111827';
    const selectedCustomColor = state.selectedTextCustomColor || (
        TEXT_COLORS.includes(selectedColor) ? '#111827' : selectedColor
    );
    const deselectFocusedTextTile = () => {
        const focusedText = elements.previewContainer?.querySelector('[data-editable-tile]:focus');

        if (!focusedText) {
            return;
        }

        focusedText.blur();
    };
    const updateTextColorTools = (color) => {
        const isPresetColor = TEXT_COLORS.includes(color);

        container.querySelectorAll('[data-text-color]').forEach((button) => {
            button.classList.toggle('is-selected', button.dataset.textColor === color);
        });

        const customInput = container.querySelector('#customTextColorInput');
        const customLabel = customInput?.closest('.tool-button');
        if (customInput && !isPresetColor) {
            customInput.value = color;
        }
        if (customLabel) {
            customLabel.classList.toggle('is-selected', !isPresetColor);
        }
    };
    const applySelectedTextColor = (color, options = {}) => {
        const normalizedColor = color || '#111827';

        mutateStateSilently((draft) => {
            draft.selectedTextColor = normalizedColor;
            if (options.isCustom) {
                draft.selectedTextCustomColor = normalizedColor;
            }
        });

        updateTextColorTools(normalizedColor);
        markSaved();
    };

    container.innerHTML = `
        <section>
            <div class="text-step-actions">
                <button id="aiIdeasButton" class="tool-action-link" type="button" aria-controls="previewHelperPanel">Get AI ideas for your tiles</button>
            </div>
            <p class="text-sm leading-6 text-slate-600">Pick a text color, then click a tile to write on it. Each tile can hold text or one picture. The START and FINISH labels stay fixed.</p>
            <p class="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Use standard English letters for the best PDF results.</p>
            <div class="tool-grid mt-3" aria-label="Text color tools">
                ${TEXT_COLORS.map((color, index) => `
                    <button type="button" class="tool-button ${selectedColor === color ? 'is-selected' : ''}" data-text-color="${color}" style="background:${color}; color:${color === '#ffffff' ? '#0f172a' : '#ffffff'}" title="Text color ${index + 1}">
                        A
                    </button>
                `).join('')}
                <label class="tool-button ${!TEXT_COLORS.includes(selectedColor) ? 'is-selected' : ''} cursor-pointer bg-white" data-custom-text-color-button title="Custom text color">
                    <span>Custom</span>
                    <input id="customTextColorInput" type="color" value="${selectedCustomColor}" class="sr-only">
                </label>
            </div>
        </section>
        <div id="textRandomSuggestionMenu" class="mt-4"></div>
    `;

    container.querySelector('#aiIdeasButton').addEventListener('click', () => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        elements.previewHelperPanel.focus({ preventScroll: true });
        elements.previewHelperPanel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });

    container.querySelectorAll('[data-text-color]').forEach((button) => {
        button.addEventListener('click', () => {
            deselectFocusedTextTile();
            applySelectedTextColor(button.dataset.textColor);
        });
    });

    container.querySelector('[data-custom-text-color-button]')?.addEventListener('click', () => {
        const customInput = container.querySelector('#customTextColorInput');
        deselectFocusedTextTile();
        applySelectedTextColor(customInput?.value || selectedCustomColor, {
            isCustom: true,
        });
    });

    container.querySelector('#customTextColorInput')?.addEventListener('input', (event) => {
        deselectFocusedTextTile();
        applySelectedTextColor(event.target.value, {
            isCustom: true,
        });
    });

    container.querySelector('#customTextColorInput')?.addEventListener('change', (event) => {
        deselectFocusedTextTile();
        applySelectedTextColor(event.target.value, {
            isCustom: true,
        });
    });

    renderRandomSuggestionMenu(container.querySelector('#textRandomSuggestionMenu'));
}

function renderPreviewHelperForStep(state) {
    if (!elements.previewHelperPanel) {
        return;
    }

    elements.previewHelperPanel.hidden = state.currentStep !== 'text';
    if (state.currentStep !== 'text') {
        elements.previewHelperPanel.innerHTML = '';
        elements.previewHelperPanel.dataset.helperStep = '';
        return;
    }

    if (elements.previewHelperPanel.dataset.helperStep === 'text') {
        return;
    }

    elements.previewHelperPanel.innerHTML = '<div id="previewAiHelperMenu"></div>';
    renderAiSuggestionMenu(elements.previewHelperPanel.querySelector('#previewAiHelperMenu'));
    elements.previewHelperPanel.dataset.helperStep = 'text';
}

function renderFinalizeTools(container, state) {
    const selectedTitleColor = state.boardTitleColor || '#0f172a';
    const selectedCreatorColor = state.creatorNameColor || '#0f172a';
    const applyTitleColor = (color) => {
        mutateStateSilently((draft) => {
            draft.boardTitleColor = color;
        });

        elements.previewContainer.querySelectorAll('[data-board-title]').forEach((previewTitle) => {
            previewTitle.style.color = color;
            fitBoardTitleElement(previewTitle);
        });

        container.querySelectorAll('[data-title-color]').forEach((button) => {
            button.classList.toggle('is-selected', button.dataset.titleColor === color);
        });

        const customInput = container.querySelector('#customTitleColorInput');
        const customLabel = customInput?.closest('.tool-button');
        if (customInput) {
            customInput.value = color;
        }
        if (customLabel) {
            customLabel.classList.toggle('is-selected', !CREDIT_COLORS.includes(color));
        }

        markSaved();
    };
    const applyCreatorColor = (color) => {
        mutateStateSilently((draft) => {
            draft.creatorNameColor = color;
        });

        elements.previewContainer.querySelectorAll('[data-board-creator]').forEach((creator) => {
            creator.style.color = color;
        });

        container.querySelectorAll('[data-creator-color]').forEach((button) => {
            button.classList.toggle('is-selected', button.dataset.creatorColor === color);
        });

        const customInput = container.querySelector('#customCreatorColorInput');
        const customLabel = customInput?.closest('.tool-button');
        if (customInput) {
            customInput.value = color;
        }
        if (customLabel) {
            customLabel.classList.toggle('is-selected', !CREDIT_COLORS.includes(color));
        }

        markSaved();
    };

    container.innerHTML = `
        <div class="finalize-form">
            <div class="finalize-fields">
                <div>
                    <label class="block text-sm font-semibold text-slate-700" for="boardTitleInput">Board name</label>
                    <input id="boardTitleInput" type="text" value="${escapeHtml((state.boardTitle || '').slice(0, 90))}" maxlength="90" class="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="My educational board game">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700" for="creatorNameInput">Prepared by <span class="font-normal text-slate-500">(optional)</span></label>
                    <input id="creatorNameInput" type="text" value="${escapeHtml((state.creatorName || '').slice(0, 70))}" maxlength="70" class="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Your name">
                </div>
            </div>
            <details class="finalize-colors">
                <summary>Title and name colors</summary>
                <div class="finalize-color-settings">
                    <div>
                        <h3 class="text-sm font-semibold text-slate-700">Board title color</h3>
                        <div class="tool-grid mt-3" aria-label="Board title color tools">
                            ${CREDIT_COLORS.map((color, index) => `
                                <button type="button" class="tool-button ${selectedTitleColor === color ? 'is-selected' : ''}" data-title-color="${color}" style="background:${color}; color:${color === '#ffffff' ? '#0f172a' : '#ffffff'}" title="Title color ${index + 1}">
                                    T
                                </button>
                            `).join('')}
                            <label class="tool-button ${!CREDIT_COLORS.includes(selectedTitleColor) ? 'is-selected' : ''} cursor-pointer bg-white" title="Custom board title color">
                                <span>Custom</span>
                                <input id="customTitleColorInput" type="color" value="${selectedTitleColor}" class="sr-only">
                            </label>
                        </div>
                    </div>
                    <div>
                        <h3 class="text-sm font-semibold text-slate-700">Creator name color</h3>
                        <div class="tool-grid mt-3" aria-label="Creator name color tools">
                            ${CREDIT_COLORS.map((color, index) => `
                                <button type="button" class="tool-button ${selectedCreatorColor === color ? 'is-selected' : ''}" data-creator-color="${color}" style="background:${color}; color:${color === '#ffffff' ? '#0f172a' : '#ffffff'}" title="Creator color ${index + 1}">
                                    P
                                </button>
                            `).join('')}
                            <label class="tool-button ${!CREDIT_COLORS.includes(selectedCreatorColor) ? 'is-selected' : ''} cursor-pointer bg-white" title="Custom creator name color">
                                <span>Custom</span>
                                <input id="customCreatorColorInput" type="color" value="${selectedCreatorColor}" class="sr-only">
                            </label>
                        </div>
                    </div>
                </div>
            </details>
            <button id="downloadPdfButton" type="button" class="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700">Download as PDF</button>
        </div>
    `;

    const titleInput = container.querySelector('#boardTitleInput');
    titleInput?.addEventListener('input', (event) => {
        const value = event.target.value.slice(0, 90);

        mutateStateSilently((draft) => {
            draft.boardTitle = value;
        });

        const previewTitle = elements.previewContainer.querySelector('.board-title');
        if (previewTitle) {
            previewTitle.textContent = value.trim() || 'Untitled board game';
            fitBoardTitleElement(previewTitle);
        }
        markSaved();
    });

    const creatorInput = container.querySelector('#creatorNameInput');
    creatorInput?.addEventListener('input', (event) => {
        const value = event.target.value.slice(0, 70);

        mutateStateSilently((draft) => {
            draft.creatorName = value;
        });

        const previewCreator = elements.previewContainer.querySelector('[data-board-creator]');
        if (previewCreator) {
            previewCreator.textContent = value.trim() ? `Prepared by ${value.trim()}` : '';
            previewCreator.hidden = !value.trim();
        }
        markSaved();
    });

    container.querySelectorAll('[data-title-color]').forEach((button) => {
        button.addEventListener('click', () => {
            applyTitleColor(button.dataset.titleColor);
        });
    });

    container.querySelector('#customTitleColorInput')?.addEventListener('input', (event) => {
        applyTitleColor(event.target.value);
    });

    container.querySelectorAll('[data-creator-color]').forEach((button) => {
        button.addEventListener('click', () => {
            applyCreatorColor(button.dataset.creatorColor);
        });
    });

    container.querySelector('#customCreatorColorInput')?.addEventListener('input', (event) => {
        applyCreatorColor(event.target.value);
    });

    container.querySelector('#downloadPdfButton')?.addEventListener('click', async () => {
        const button = container.querySelector('#downloadPdfButton');
        button.disabled = true;
        button.textContent = 'Preparing PDF...';

        try {
            await downloadBoardAsPdf(getState(), elements.pdfRenderHost, markSaved);
        } catch (error) {
            markSaved(error.message || 'PDF export failed.', 'error');
        } finally {
            button.disabled = false;
            button.textContent = 'Download as PDF';
        }
    });
}

async function renderToolsForStep(state, version) {
    const step = stepById(state.currentStep);
    elements.toolPanelTitle.textContent = step.label;
    elements.toolPanel.innerHTML = '';

    if (step.id === 'orientation') {
        renderOrientationTools(elements.toolPanel, state);
    } else if (step.id === 'background') {
        renderBackgroundTools(elements.toolPanel, state);
    } else if (step.id === 'build') {
        renderBuildTools(elements.toolPanel, state);
    } else if (step.id === 'text') {
        renderTextTools(elements.toolPanel, state);
    } else if (step.id === 'images') {
        await renderImageTools(elements.toolPanel, state);
    } else if (step.id === 'walls') {
        renderWallTools(elements.toolPanel);
    } else if (step.id === 'finalize') {
        renderFinalizeTools(elements.toolPanel, state);
    }

    return version === renderVersion;
}

async function renderApp(state) {
    const version = ++renderVersion;
    elements.workspace.dataset.step = state.currentStep;
    renderStepList(state);
    renderNavigation(state);
    renderPreviewMeta(state);
    renderPreviewHelperForStep(state);
    markSaved();

    await renderToolsForStep(state, version);
    if (version !== renderVersion) {
        return;
    }

    await renderBoard(elements.previewContainer, state, {
        mode: 'editor',
        step: state.currentStep,
    });
}

function focusEditableText(textElement) {
    textElement.focus();
    const range = document.createRange();
    range.selectNodeContents(textElement);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

function handleTextTileClick(tileElement) {
    const tileId = tileElement.dataset.tileId;
    const state = getState();
    const tile = state.tiles?.[tileId];

    if (!tile?.active || tile.type === 'start' || tile.type === 'finish') {
        return;
    }

    const selectedColor = state.selectedTextColor || '#111827';
    const textElement = tileElement.querySelector('[data-editable-tile]');

    if (tile.imageId) {
        const confirmed = window.confirm('This tile already has an image. Adding text will remove the tile image. Continue?');
        if (!confirmed) {
            return;
        }
    }

    mutateStateSilently((draft) => {
        draft.tiles[tileId].imageId = null;
        draft.tiles[tileId].textColor = selectedColor;
    });

    if (textElement) {
        const content = tileElement.querySelector('.tile-content');
        content?.querySelectorAll('.tile-image').forEach((image) => image.remove());
        content?.classList.remove('has-image');
        content?.classList.add('has-text');
        textElement.style.color = selectedColor;
        focusEditableText(textElement);
        fitTextElement(textElement);
    }

    markSaved();
}

function bindPreviewEvents() {
    elements.previewContainer.addEventListener('click', (event) => {
        const state = getState();
        const deleteTarget = event.target.closest('[data-delete-tile-image]');
        if (deleteTarget && state.currentStep === 'images') {
            removeImageFromTile(deleteTarget.dataset.deleteTileImage);
            return;
        }

        const wallHandle = event.target.closest('[data-wall-handle]');
        if (wallHandle && state.currentStep === 'walls') {
            toggleWall(wallHandle.dataset.fromTile, wallHandle.dataset.toTile);
            return;
        }

        const tileElement = event.target.closest('.tile-cell[data-tile-id]');
        if (!tileElement) {
            return;
        }

        if (state.currentStep === 'build') {
            handleBuildTileClick(tileElement.dataset.tileId);
            return;
        }

        if (state.currentStep === 'images') {
            const selectedImageId = getSelectedImageForPlacement();
            if (selectedImageId) {
                const assigned = assignImageToTile(tileElement.dataset.tileId, selectedImageId);
                if (assigned) {
                    clearSelectedImageForPlacement();
                }
            }
            return;
        }

        if (state.currentStep === 'text') {
            handleTextTileClick(tileElement);
        }
    });

    elements.previewContainer.addEventListener('dragover', (event) => {
        const state = getState();
        const tileElement = event.target.closest('.tile-cell[data-tile-id]');

        if (state.currentStep === 'images' && tileElement && state.tiles?.[tileElement.dataset.tileId]?.active) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        }
    });

    elements.previewContainer.addEventListener('drop', (event) => {
        const state = getState();
        const tileElement = event.target.closest('.tile-cell[data-tile-id]');

        if (state.currentStep !== 'images' || !tileElement) {
            return;
        }

        const imageId = event.dataTransfer.getData('text/plain');
        if (imageId) {
            event.preventDefault();
            assignImageToTile(tileElement.dataset.tileId, imageId);
        }
    });

    elements.previewContainer.addEventListener('input', (event) => {
        const textElement = event.target.closest('[data-editable-tile]');
        if (!textElement || getState().currentStep !== 'text') {
            return;
        }

        const tileId = textElement.dataset.editableTile;
        mutateStateSilently((draft) => {
            if (draft.tiles[tileId]) {
                draft.tiles[tileId].text = textElement.textContent.replace(/\n{3,}/g, '\n\n').trim();
            }
        });
        fitTextElement(textElement);
        markSaved();
    });

    elements.previewContainer.addEventListener('paste', (event) => {
        const textElement = event.target.closest('[data-editable-tile]');
        if (!textElement) {
            return;
        }

        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    });
}

function bindNavigation() {
    elements.previousStepButton.addEventListener('click', () => {
        const index = getCurrentStepIndex();
        if (index > 0) {
            setCurrentStep(STEPS[index - 1].id);
        }
    });

    elements.nextStepButton.addEventListener('click', () => {
        const state = getState();
        const index = getCurrentStepIndex();

        if (index >= STEPS.length - 1) {
            return;
        }

        setCurrentStep(STEPS[index + 1].id);
    });

    elements.newBoardButton.addEventListener('click', async () => {
        const firstConfirmed = window.confirm('Reset your board? Your current board and uploaded images will be removed from this browser.');
        if (!firstConfirmed) {
            return;
        }

        const secondConfirmed = window.confirm('This cannot be undone. Reset the board now?');
        if (!secondConfirmed) {
            return;
        }

        await startNewBoardSession();
        markSaved('Board reset', 'success');
    });
}

export function initWizard() {
    elements = {
        workspace: document.querySelector('.creator-workspace'),
        stepList: document.querySelector('#stepList'),
        toolPanel: document.querySelector('#toolPanel'),
        toolPanelTitle: document.querySelector('#toolPanelTitle'),
        previousStepButton: document.querySelector('#previousStepButton'),
        nextStepButton: document.querySelector('#nextStepButton'),
        newBoardButton: document.querySelector('#newBoardButton'),
        previewContainer: document.querySelector('#boardPreview'),
        previewHelperPanel: document.querySelector('#previewHelperPanel'),
        previewMeta: document.querySelector('#previewMeta'),
        saveStatus: document.querySelector('#saveStatus'),
        pdfRenderHost: document.querySelector('#pdfRenderHost'),
    };

    bindNavigation();
    bindPreviewEvents();
    subscribe((state) => {
        renderApp(state);
    });
    initializeState();
}
