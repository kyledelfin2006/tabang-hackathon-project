// Local vote state for each hotline card — seeded with defaults, stored in memory only (no Firebase)
const votes = {
    bfp:       { up: 12, down: 2,  userVote: null },
    kalibo:    { up: 8,  down: 1,  userVote: null },
    mdrrmo:    { up: 15, down: 0,  userVote: null },
    coastguard:{ up: 6,  down: 0,  userVote: null },
    redcross:  { up: 10, down: 1,  userVote: null }
};

// In-memory comment cache per hotline card
const comments = { bfp:[], kalibo:[], mdrrmo:[], coastguard:[], redcross:[] };

// Tracks which card's comment panel is currently open
let currentCard = null;

// Bind upvote and downvote buttons to handleVote using their data-card attributes
document.querySelectorAll('.reaction-btn.upvote').forEach(btn =>
    btn.addEventListener('click', () => handleVote(btn.dataset.card, 'up')));
document.querySelectorAll('.reaction-btn.downvote').forEach(btn =>
    btn.addEventListener('click', () => handleVote(btn.dataset.card, 'down')));

// Toggles or switches the user's vote for a card:
// clicking the same vote type again removes it; clicking the opposite switches it
function handleVote(cardId, type) {
    const v = votes[cardId];
    if (!v) return;
    const upBtn   = document.querySelector(`.reaction-btn.upvote[data-card="${cardId}"]`);
    const downBtn = document.querySelector(`.reaction-btn.downvote[data-card="${cardId}"]`);

    if (v.userVote === type) {
        // Same vote clicked again — undo it
        type === 'up' ? v.up-- : v.down--;
        v.userVote = null;
        upBtn.classList.remove('voted');
        downBtn.classList.remove('voted');
    } else {
        // Remove the previous vote (if any) before applying the new one
        if (v.userVote === 'up')   { v.up--;   upBtn.classList.remove('voted'); }
        if (v.userVote === 'down') { v.down--; downBtn.classList.remove('voted'); }

        // Apply the new vote and trigger the pulse animation on the active button
        if (type === 'up')   { v.up++;   upBtn.classList.add('voted');   pulseBtn(upBtn); }
        else                 { v.down++; downBtn.classList.add('voted'); pulseBtn(downBtn); }
        v.userVote = type;
    }

    // Update the displayed counts for both buttons
    upBtn.querySelector('.upvote-count').textContent   = v.up;
    downBtn.querySelector('.downvote-count').textContent = v.down;
}

// Triggers a brief CSS pulse animation on a vote button for visual feedback;
// forces a reflow so the animation restarts even if already active
function pulseBtn(btn) {
    btn.classList.remove('vote-pulse');
    void btn.offsetWidth;   // Force reflow to restart the animation
    btn.classList.add('vote-pulse');
    btn.addEventListener('animationend', () => btn.classList.remove('vote-pulse'), { once: true });
}

// Bind each comment button to open the comment panel for its associated card
document.querySelectorAll('.comment-btn').forEach(btn =>
    btn.addEventListener('click', () => openComments(btn.dataset.card, btn.dataset.name)));

// Switches to the comment panel, sets the title and count, and resets the input
function openComments(cardId, cardName) {
    currentCard = cardId;
    if (!comments[cardId]) comments[cardId] = [];
    document.getElementById('commentTitle').textContent = cardName;
    document.getElementById('commentSub').textContent =
        `${comments[cardId].length} comment${comments[cardId].length !== 1 ? 's' : ''}`;
    renderComments(cardId);
    document.getElementById('hotlinesView').classList.remove('active');
    document.getElementById('commentView').classList.add('active');
    document.getElementById('commentInput').value = '';
    autoResize(document.getElementById('commentInput'));
}

// Renders the comment list for a card, or shows an empty state if there are none;
// auto-scrolls to the latest comment after rendering
function renderComments(cardId) {
    const list = document.getElementById('commentsList');
    const c = comments[cardId] || [];
    if (!c.length) {
        list.innerHTML = `<div class="no-comments"><i class="fas fa-comments"></i><span>No comments yet.<br>Be the first to review!</span></div>`;
        return;
    }
    list.innerHTML = c.map(item => `
            <div class="comment-item">
                <div class="comment-item-top">
                    <div class="comment-avatar">${item.initials}</div>
                    <span class="comment-user">${item.user}</span>
                    <span class="comment-time">${item.time}</span>
                </div>
                <div class="comment-text">${escHtml(item.text)}</div>
            </div>`).join('');
    list.scrollTop = list.scrollHeight;
}

// Send comment on button click or Enter key (Shift+Enter inserts a newline instead)
document.getElementById('commentSendBtn').addEventListener('click', sendComment);
document.getElementById('commentInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); }
});

// Auto-resize the textarea as the user types
document.getElementById('commentInput').addEventListener('input', function() { autoResize(this); });

// Expands a textarea to fit its content, capped at a maximum height of 80px
function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 80) + 'px';
}

// Adds a new comment to the current card's cache with a randomly generated guest username,
// then re-renders the list and updates the comment count
function sendComment() {
    const input = document.getElementById('commentInput');
    const text  = input.value.trim();
    if (!text || !currentCard) return;
    if (!comments[currentCard]) comments[currentCard] = [];

    const now  = new Date();
    // Generate a random display name since this version has no auth integration
    const names = ['Responder','Officer','User','Resident'];
    const user  = names[Math.floor(Math.random()*names.length)] + ' ' + Math.floor(Math.random()*900+100);

    comments[currentCard].push({
        user, initials: user[0],
        text,
        time: now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
    });
    input.value = '';
    autoResize(input);
    renderComments(currentCard);

    // Update the comment count subtitle after the new comment is added
    const c = comments[currentCard];
    document.getElementById('commentSub').textContent =
        `${c.length} comment${c.length !== 1 ? 's' : ''}`;
}

// Close the comment panel and return to the hotlines view, clearing the active card
document.getElementById('commentBackBtn').addEventListener('click', () => {
    document.getElementById('commentView').classList.remove('active');
    document.getElementById('hotlinesView').classList.add('active');
    currentCard = null;
});

// Filters hotline cards by matching the search query against each card's data-search attribute
function filterCards() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    document.querySelectorAll('.card').forEach(card => {
        const searchText = card.dataset.search || '';
        card.style.display = searchText.includes(q) ? '' : 'none';
    });
}

// Escapes HTML special characters to prevent XSS when rendering user-submitted comment text
function escHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}