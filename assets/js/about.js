const compactPortraitQuery = window.matchMedia('(max-width: 1023.98px)');
const portraitCards = Array.from(document.querySelectorAll('[data-portrait-card]'));

function closeOtherCards(activeCard) {
    portraitCards.forEach((card) => {
        if (card !== activeCard) {
            card.classList.remove('is-revealed');
        }
    });
}

function togglePortraitCard(card) {
    if (!compactPortraitQuery.matches) {
        return;
    }

    const shouldReveal = !card.classList.contains('is-revealed');
    closeOtherCards(card);
    card.classList.toggle('is-revealed', shouldReveal);
}

portraitCards.forEach((card) => {
    card.addEventListener('click', () => {
        togglePortraitCard(card);
    });

    card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        togglePortraitCard(card);
    });
});

compactPortraitQuery.addEventListener('change', () => {
    if (compactPortraitQuery.matches) {
        return;
    }

    portraitCards.forEach((card) => {
        card.classList.remove('is-revealed');
    });
});
