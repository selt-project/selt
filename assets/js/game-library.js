const catalogUrl = new URL('../data/explore-games.json', import.meta.url);
const boardsFolder = new URL('../games/', import.meta.url);

export async function loadExploreGames() {
    const response = await fetch(catalogUrl);
    if (!response.ok) {
        throw new Error('The game library could not be loaded.');
    }

    const entries = await response.json();
    if (!Array.isArray(entries)) {
        throw new Error('The game library could not be loaded.');
    }

    return entries.filter((game) => (
        game
        && typeof game.id === 'string'
        && /^[a-z0-9-]+$/.test(game.id)
        && typeof game.title === 'string'
        && game.title.trim()
        && typeof game.pdf === 'string'
        && /^[a-z0-9][a-z0-9 ._-]*\.pdf$/i.test(game.pdf)
    )).map((game) => ({
        id: game.id,
        title: game.title.trim(),
        description: typeof game.description === 'string' ? game.description.trim() : '',
        fileName: game.pdf,
        pdfUrl: new URL(encodeURIComponent(game.pdf), boardsFolder),
    }));
}
