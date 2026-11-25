import { loadExploreGames } from './game-library.js';

const gameList = document.querySelector('#exploreGames');
const emptyState = document.querySelector('#exploreEmpty');
const status = document.querySelector('#exploreStatus');

function createGameCard(game) {
    const card = document.createElement('li');
    card.className = 'explore-game-card';

    const title = document.createElement('h2');
    title.textContent = game.title;
    card.append(title);

    if (game.description) {
        const summary = document.createElement('p');
        summary.textContent = game.description;
        card.append(summary);
    }

    const actions = document.createElement('div');
    actions.className = 'explore-actions';

    const playUrl = new URL('./play.html', window.location.href);
    playUrl.searchParams.set('game', game.id);
    const play = document.createElement('a');
    play.className = 'explore-primary';
    play.href = playUrl.href;
    play.textContent = 'Play on a screen';
    play.setAttribute('aria-label', 'Play ' + game.title + ' on a screen');

    const download = document.createElement('a');
    download.className = 'explore-secondary';
    download.href = game.pdfUrl.href;
    download.download = game.fileName;
    download.textContent = 'Download PDF';
    download.setAttribute('aria-label', 'Download ' + game.title + ' as a PDF');

    actions.append(play, download);
    card.append(actions);
    return card;
}

try {
    const games = await loadExploreGames();
    if (games.length) {
        gameList.replaceChildren(...games.map(createGameCard));
        gameList.hidden = false;
        emptyState.hidden = true;
    } else {
        status.textContent = 'No games published yet';
    }
} catch {
    status.textContent = 'Could not load the game library. Refresh the page to try again.';
}
