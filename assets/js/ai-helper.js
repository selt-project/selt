import { appUrl, copyToClipboard } from './utilities.js';
import { getState, mutateStateSilently } from './state.js';
import { AI_WORKER_URL } from './ai-config.js';

const MAX_AI_PDF_SIZE = 3 * 1024 * 1024;
let randomSuggestionsCache = null;
let turnstileScriptPromise = null;
let activeWidget = null;

function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (!turnstileScriptPromise) {
        turnstileScriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Security verification could not be loaded.'));
            document.head.appendChild(script);
        }).catch((error) => { turnstileScriptPromise = null; throw error; });
    }
    return turnstileScriptPromise;
}

async function prepareTurnstile(container) {
    if (!AI_WORKER_URL) throw new Error('The AI helper is not configured yet.');
    const widgetContainer = container.querySelector('#aiTurnstile');
    if (!widgetContainer) throw new Error('Security verification could not be loaded.');
    if (activeWidget !== null && window.turnstile) {
        try { window.turnstile.remove(activeWidget); } catch { /* It may already be detached. */ }
        activeWidget = null;
    }
    const [response] = await Promise.all([fetch(`${AI_WORKER_URL}/config`), loadTurnstile()]);
    if (!response.ok) throw new Error('The AI helper is not available yet.');
    const { siteKey } = await response.json();
    if (!siteKey || !widgetContainer.isConnected) throw new Error('Security verification is not available.');
    activeWidget = window.turnstile.render(widgetContainer, { sitekey: siteKey, action: 'generate' });
    return activeWidget;
}

function waitForTurnstile(widget, container) {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + 60000;
        const timer = window.setInterval(() => {
            try {
                if (!container.isConnected || Date.now() >= deadline) {
                    window.clearInterval(timer);
                    reject(new Error('Security verification timed out. Please try again.'));
                    return;
                }
                const token = window.turnstile.getResponse(widget);
                if (token) {
                    window.clearInterval(timer);
                    resolve(token);
                }
            } catch (error) {
                window.clearInterval(timer);
                reject(new Error('Security verification failed. Please try again.'));
            }
        }, 250);
    });
}

async function loadRandomSuggestions() {
    if (randomSuggestionsCache) {
        return randomSuggestionsCache;
    }

    const response = await fetch(appUrl('/assets/data/random-suggestions.json'), {
        headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
        throw new Error('Random suggestions could not be loaded.');
    }

    randomSuggestionsCache = await response.json();
    return randomSuggestionsCache;
}

async function readJsonResponse(response) {
    const rawText = await response.text();

    try {
        return rawText ? JSON.parse(rawText) : {};
    } catch (error) {
        throw new Error(response.ok
            ? 'The suggestions could not be read. Please try again.'
            : 'The suggestion request could not be completed. Please try again.');
    }
}

function typeText(element, text) {
    element.value = '';
    let index = 0;
    const timer = window.setInterval(() => {
        element.value += text.charAt(index);
        index += 1;

        if (index >= text.length) {
            window.clearInterval(timer);
        }
    }, 22);
}

function suggestionRow(text) {
    const row = document.createElement('div');
    row.className = 'suggestion-row';

    const value = document.createElement('p');
    value.className = 'suggestion-text min-w-0 flex-1 font-medium text-slate-700';
    value.textContent = text;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50';
    button.textContent = 'Copy';
    button.addEventListener('click', async () => {
        await copyToClipboard(text);
        button.textContent = 'Copied';
        window.setTimeout(() => {
            button.textContent = 'Copy';
        }, 1200);
    });

    row.append(value, button);
    return row;
}

function renderSuggestionResults(results, suggestions) {
    results.innerHTML = '';
    suggestions.forEach((suggestion) => {
        results.appendChild(suggestionRow(suggestion));
    });
}

function restoreStoredAiSuggestions(container) {
    const suggestions = getState().aiSuggestions || [];
    const results = container.querySelector('#aiSuggestionResults');
    const message = container.querySelector('#aiSuggestionMessage');

    if (!results || !suggestions.length) {
        return;
    }

    renderSuggestionResults(results, suggestions);

    if (message) {
        message.textContent = `${suggestions.length} saved suggestions.`;
        message.className = 'text-sm text-emerald-700';
    }
}

function randomSuggestionTemplate() {
    return `
        <section class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 class="text-sm font-bold text-slate-700">Random suggestion</h3>
            <p class="mt-1 text-xs text-slate-500">Click the dice button to roll one random suggestion.</p>
            <div class="mt-3 flex gap-2">
                <button id="randomSuggestionButton" type="button" class="random-dice-button" aria-label="Roll random suggestion" title="Roll random suggestion">
                    <span class="dice-dot dice-dot-top-left"></span>
                    <span class="dice-dot dice-dot-top-right"></span>
                    <span class="dice-dot dice-dot-center"></span>
                    <span class="dice-dot dice-dot-bottom-left"></span>
                    <span class="dice-dot dice-dot-bottom-right"></span>
                </button>
                <textarea id="randomSuggestionOutput" rows="2" readonly class="min-h-11 flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"></textarea>
                <button id="copyRandomSuggestionButton" type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white">Copy</button>
            </div>
            <p id="randomSuggestionMessage" class="mt-2 text-xs text-slate-500"></p>
        </section>
    `;
}

function aiSuggestionTemplate() {
    return `
        <section class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 class="text-sm font-bold text-slate-700">Get help from AI</h3>
            <p class="mt-1 text-xs leading-5 text-slate-500">Upload a PDF, type a topic, or use both to get short ideas that can be copied into board tiles.</p>
            <p class="mt-1 text-xs leading-5 text-slate-500">Your topic and PDF are sent to Google Gemini. Do not include personal or sensitive information.</p>
            <div class="mt-3 space-y-3">
                <textarea id="aiContextInput" rows="3" class="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Type what the board game is about."></textarea>
                <label class="block text-sm font-semibold text-slate-700" for="aiPdfInput">Optional PDF</label>
                <input id="aiPdfInput" type="file" accept="application/pdf,.pdf" class="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-700">
                <p class="text-xs text-slate-500">PDF only. Max 3 MB.</p>
                <div id="aiTurnstile"></div>
                <button id="aiSuggestionButton" type="button" class="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700">Generate 40 suggestions</button>
                <p id="aiSuggestionMessage" class="text-sm text-slate-500"></p>
                <div id="aiSuggestionResults" class="ai-suggestion-grid"></div>
            </div>
        </section>
    `;
}

function bindRandomSuggestionControls(container) {
    const randomOutput = container.querySelector('#randomSuggestionOutput');
    const randomMessage = container.querySelector('#randomSuggestionMessage');

    container.querySelector('#randomSuggestionButton')?.addEventListener('click', async () => {
        try {
            const suggestions = await loadRandomSuggestions();
            const suggestion = suggestions[Math.floor(Math.random() * suggestions.length)] || '';
            typeText(randomOutput, suggestion);
            randomMessage.textContent = '';
        } catch (error) {
            randomMessage.textContent = error.message || 'A random suggestion could not be loaded.';
            randomMessage.className = 'mt-2 text-xs text-rose-600';
        }
    });

    container.querySelector('#copyRandomSuggestionButton')?.addEventListener('click', async (event) => {
        const value = randomOutput.value.trim();
        if (!value) {
            return;
        }

        await copyToClipboard(value);
        event.currentTarget.textContent = 'Copied';
        window.setTimeout(() => {
            event.currentTarget.textContent = 'Copy';
        }, 1200);
    });
}

function bindAiSuggestionControls(container) {
    let widgetPromise = null;
    container.querySelector('#aiSuggestionButton')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const contextInput = container.querySelector('#aiContextInput');
        const pdfInput = container.querySelector('#aiPdfInput');
        const message = container.querySelector('#aiSuggestionMessage');
        const results = container.querySelector('#aiSuggestionResults');
        const context = contextInput.value.trim();
        const pdf = pdfInput.files?.[0] || null;

        results.innerHTML = '';
        message.className = 'text-sm text-slate-500';

        if (!context && !pdf) {
            message.textContent = 'Add a topic description or upload a PDF.';
            message.className = 'text-sm text-rose-600';
            return;
        }

        if (context.length > 3000) {
            message.textContent = 'Please use a topic description of at most 3,000 characters.';
            message.className = 'text-sm text-rose-600';
            return;
        }

        if (pdf) {
            const isPdf = pdf.type === 'application/pdf' || /\.pdf$/i.test(pdf.name);

            if (!isPdf) {
                message.textContent = 'Please upload a PDF file.';
                message.className = 'text-sm text-rose-600';
                return;
            }

            if (pdf.size > MAX_AI_PDF_SIZE) {
                message.textContent = 'The PDF must be 3 MB or smaller.';
                message.className = 'text-sm text-rose-600';
                return;
            }
        }

        button.disabled = true;
        message.textContent = 'Preparing security verification...';
        let widget;
        let verificationToken;
        try {
            if (!widgetPromise) widgetPromise = prepareTurnstile(container);
            widget = await widgetPromise;
            verificationToken = window.turnstile.getResponse(widget);
            if (!verificationToken) {
                message.textContent = 'Complete the security check to continue.';
                verificationToken = await waitForTurnstile(widget, container);
            }
        } catch (error) {
            widgetPromise = null;
            message.textContent = error.message || 'Security verification could not be loaded.';
            message.className = 'text-sm text-rose-600';
            button.disabled = false;
            return;
        }

        const formData = new FormData();
        formData.append('context', context);
        formData.append('turnstileToken', verificationToken);
        if (pdf) {
            formData.append('pdf', pdf);
        }

        button.disabled = true;
        button.textContent = 'Generating...';
        message.textContent = 'Generating tile-ready suggestions...';

        try {
            const response = await fetch(`${AI_WORKER_URL}/api/suggestions`, {
                method: 'POST',
                body: formData,
                headers: {
                    Accept: 'application/json',
                },
            });
            const data = await readJsonResponse(response);

            if (!response.ok) {
                throw new Error(data.error || 'Suggestions could not be generated. Please try again.');
            }

            if (!Array.isArray(data.suggestions) || data.suggestions.length !== 40) {
                throw new Error('Please try again. The suggestions were incomplete.');
            }

            const suggestions = data.suggestions.map((suggestion) => String(suggestion || '').trim()).filter(Boolean);

            mutateStateSilently((draft) => {
                draft.aiSuggestions = suggestions;
            });

            renderSuggestionResults(results, suggestions);
            message.textContent = '40 suggestions generated.';
            message.className = 'text-sm text-emerald-700';
        } catch (error) {
            message.textContent = error.message || 'Suggestions could not be generated. Please try again.';
            message.className = 'text-sm text-rose-600';
        } finally {
            if (widget !== undefined && window.turnstile) {
                try { window.turnstile.reset(widget); } catch { widgetPromise = null; }
            }
            button.disabled = false;
            button.textContent = 'Generate 40 suggestions';
        }
    });
}

export function renderRandomSuggestionMenu(container) {
    if (!container) {
        return;
    }

    container.innerHTML = randomSuggestionTemplate();
    bindRandomSuggestionControls(container);
}

export function renderAiSuggestionMenu(container) {
    if (!container) {
        return;
    }

    container.innerHTML = aiSuggestionTemplate();
    bindAiSuggestionControls(container);
    restoreStoredAiSuggestions(container);
}

export function renderTextHelperMenu(container) {
    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            ${randomSuggestionTemplate()}
            ${aiSuggestionTemplate()}
        </div>
    `;

    bindRandomSuggestionControls(container);
    bindAiSuggestionControls(container);
    restoreStoredAiSuggestions(container);
}
