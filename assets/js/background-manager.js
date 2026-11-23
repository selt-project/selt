import { mutateState } from './state.js';
import { fileToDataUrl, generateId } from './utilities.js';
import { storeBackgroundAsset } from './storage.js';

const MAX_BACKGROUND_SIZE = 3 * 1024 * 1024;
const ACCEPTED_BACKGROUND_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PRESET_BACKGROUNDS = [
    {
        id: 'preset-1',
        label: 'Preset background 1',
        source: '/assets/images/backgrounds/prebg1.png',
    },
    {
        id: 'preset-2',
        label: 'Preset background 2',
        source: '/assets/images/backgrounds/prebg2.png',
    },
    {
        id: 'preset-3',
        label: 'Preset background 3',
        source: '/assets/images/backgrounds/prebg3.png',
    },
    {
        id: 'preset-4',
        label: 'Preset background 4',
        source: '/assets/images/backgrounds/prebg4.png',
    },
];

function backgroundOption(label, value, state) {
    const isSelected = value === 'none'
        ? state.background.type === 'none'
        : state.background.type === 'preset'
            && state.background.source === PRESET_BACKGROUNDS.find((preset) => preset.id === value)?.source;
    return `
        <button type="button" class="background-card ${isSelected ? 'is-selected' : ''}" data-background-option="${value}">
            <span class="block text-sm font-bold">${label}</span>
            <span class="mt-1 block text-xs text-slate-500">${value === 'none' ? 'Plain white page' : 'Applies to the full A4 page'}</span>
        </button>
    `;
}

export function renderBackgroundTools(container, state) {
    const selectedFit = state.background.fit || 'cover';

    container.innerHTML = `
        <div class="space-y-4">
            <p class="text-sm leading-6 text-slate-600">Choose a page background for your printable board. Presets and uploaded images cover the full A4 page.</p>
            <div class="grid gap-3 sm:grid-cols-2">
                ${backgroundOption('No custom background', 'none', state)}
                ${PRESET_BACKGROUNDS.map((preset) => backgroundOption(preset.label, preset.id, state)).join('')}
                <label class="background-card cursor-pointer ${state.background.type === 'custom' ? 'is-selected' : ''}">
                    <span class="block text-sm font-bold">Upload custom background</span>
                    <span class="mt-1 block text-xs text-slate-500">JPG, PNG, or WebP. Max 3 MB.</span>
                    <input id="backgroundUploadInput" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" class="sr-only">
                </label>
            </div>

            <p class="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                For the best result, use a portrait image for portrait boards.
            </p>

            <label class="block text-sm font-semibold text-slate-700" for="backgroundFitSelect">Background fit</label>
            <select id="backgroundFitSelect" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="stretch" ${selectedFit === 'stretch' ? 'selected' : ''}>Stretch</option>
                <option value="cover" ${selectedFit === 'cover' ? 'selected' : ''}>Cover / Fill</option>
                <option value="contain" ${selectedFit === 'contain' ? 'selected' : ''}>Contain / Fit</option>
            </select>

            <p id="backgroundMessage" class="text-sm text-slate-500"></p>
        </div>
    `;

    container.querySelectorAll('[data-background-option]').forEach((button) => {
        button.addEventListener('click', () => {
            const value = button.dataset.backgroundOption;

            mutateState((draft) => {
                if (value === 'none') {
                    draft.background.type = 'none';
                    draft.background.source = '';
                } else {
                    const preset = PRESET_BACKGROUNDS.find((item) => item.id === value);

                    if (!preset) {
                        return;
                    }

                    draft.background.type = 'preset';
                    draft.background.source = preset.source;
                }
            });
        });
    });

    container.querySelector('#backgroundFitSelect')?.addEventListener('change', (event) => {
        mutateState((draft) => {
            draft.background.fit = event.target.value;
        });
    });

    container.querySelector('#backgroundUploadInput')?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        const message = container.querySelector('#backgroundMessage');

        if (!file) {
            return;
        }

        if (!ACCEPTED_BACKGROUND_TYPES.includes(file.type)) {
            message.textContent = 'Please upload a JPG, PNG, or WebP image.';
            message.className = 'text-sm text-rose-600';
            event.target.value = '';
            return;
        }

        if (file.size > MAX_BACKGROUND_SIZE) {
            message.textContent = 'The background image must be 3 MB or smaller.';
            message.className = 'text-sm text-rose-600';
            event.target.value = '';
            return;
        }

        try {
            const dataUrl = await fileToDataUrl(file);
            const id = generateId('background');
            await storeBackgroundAsset({
                id,
                name: file.name,
                mimeType: file.type,
                dataUrl,
                createdAt: new Date().toISOString(),
            });

            mutateState((draft) => {
                draft.background.type = 'custom';
                draft.background.source = id;
            });
        } catch (error) {
            message.textContent = error.message || 'The background could not be saved.';
            message.className = 'text-sm text-rose-600';
        }
    });
}
