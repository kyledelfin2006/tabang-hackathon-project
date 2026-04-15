import { db, auth } from '../javascript/firebase.js';
import { collection, doc, getDoc, setDoc, addDoc, getDocs, query, where, serverTimestamp, onSnapshot, deleteDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

function randomInitialUp() {
    return Math.floor(Math.random() * 11) + 11;
}

// Local vote state — serves as a fallback and optimistic update buffer.
// These seed values match what's hardcoded in the HTML so the UI
// doesn't flicker to "0" while Firestore loads.
const votes = {
    bfp:           { up: randomInitialUp(), down: 2, userVote: null },
    kalibo:        { up: randomInitialUp(), down: 2, userVote: null },
    mdrrmo:        { up: randomInitialUp(), down: 2, userVote: null },
    mdrrmo_kalibo: { up: randomInitialUp(), down: 0, userVote: null },
    coastguard:    { up: randomInitialUp(), down: 0, userVote: null },
    redcross:      { up: randomInitialUp(), down: 1, userVote: null }
};

// In-memory comment cache per hotline card.
// Populated on demand when a user opens the comment view.
const comments = {
    bfp:        [],
    kalibo:     [],
    mdrrmo:        [],
    mdrrmo_kalibo: [],
    coastguard: [],
    redcross:   []
};

// Firestore collection refs — defined once up here so they're easy to spot if paths ever change
const votesCollection = collection(db, 'hotlineVotes');
const commentsCollection = collection(db, 'hotlineComments');
const userVotesCollection = collection(db, 'userHotlineVotes');

// Track the currently open comment thread and the logged-in user
let currentCard = null;
let currentUser = null;
let currentUserFullName = null;   // full name pulled from Firestore (not just auth displayName)
let currentUserInitials = null;   // derived from the full name for avatar display


// ─── DOM Listeners ────────────────────────────────────────────────

// Wire up all interactive elements before any async work starts.
// This way the back button and nav still work even if Firebase is being slow.
function attachEventListeners() {

    // Use event delegation for vote buttons — avoids re-attaching
    // listeners every time cards are re-rendered (if we ever do that).
    const content = document.querySelector('.content');
    if (content) {
        content.addEventListener('click', (event) => {
            const btn = event.target.closest('.reaction-btn');
            if (!btn || !content.contains(btn)) return;
            const cardId = btn.dataset.card;
            if (!cardId) return;
            if (btn.classList.contains('upvote')) {
                handleVote(cardId, 'up');
            } else if (btn.classList.contains('downvote')) {
                handleVote(cardId, 'down');
            }
        });
    }

    // Use event delegation for comment buttons too — consistent with vote buttons
    if (content) {
        content.addEventListener('click', (event) => {
            const btn = event.target.closest('.comment-btn');
            if (!btn || !content.contains(btn)) return;
            openComments(btn.dataset.card, btn.dataset.name);
        });
    }

    const sendBtn = document.getElementById('commentSendBtn');
    if (sendBtn) sendBtn.addEventListener('click', sendComment);

    const commentsList = document.getElementById('commentsList');
    if (commentsList) {
        commentsList.addEventListener('click', (event) => {
            const btn = event.target.closest('.comment-delete-btn');
            if (!btn || !commentsList.contains(btn)) return;
            const commentId = btn.dataset.commentId;
            if (!commentId) return;
            deleteComment(commentId);
        });
    }

    const commentInput = document.getElementById('commentInput');
    if (commentInput) {
        // Send on Enter, newline on Shift+Enter — feels like a chat app
        commentInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendComment();
            }
        });
        commentInput.addEventListener('input', function() { autoResize(this); });
    }

    const backBtn = document.getElementById('backBtn');
    if (backBtn) backBtn.onclick = () => window.location.href = 'Homepage.html';

    // Comment back button just swaps the visible view — no page navigation needed
    const commentBackBtn = document.getElementById('commentBackBtn');
    if (commentBackBtn) {
        commentBackBtn.addEventListener('click', () => {
            document.getElementById('commentView').classList.remove('active');
            document.getElementById('hotlinesView').classList.add('active');
            currentCard = null;
        });
    }

    // Bottom nav — same routes as every other page
    const navRequest = document.getElementById('navRequest');
    if (navRequest) navRequest.onclick = () => window.location.href = 'RequestHelp.html';
    const navHotlines = document.getElementById('navHotlines');
    if (navHotlines) navHotlines.onclick = () => window.location.href = 'Hotline.html';
    const navReport = document.getElementById('navReport');
    if (navReport) navReport.onclick = () => window.location.href = 'ReportFlood.html';
    const navMyReports = document.getElementById('navMyReports');
    if (navMyReports) navMyReports.onclick = () => window.location.href = 'MyReports.html';
    const navAccount = document.getElementById('navAccount');
    if (navAccount) navAccount.onclick = () => window.location.href = 'AccountInfo.html';
}

// ─── Vote Loading ─────────────────────────────────────────────────

async function loadVotes() {
    for (let id of Object.keys(votes)) {
        try {
            const docRef = doc(votesCollection, id);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                votes[id].up = data.up || 0;
                votes[id].down = data.down || 0;
            } else {
                // Seed missing vote docs with a randomized initial like count.
                if (currentUser) await setDoc(docRef, { up: votes[id].up, down: votes[id].down });
            }

            updateVoteDisplay(id);

            // Real-time listener keeps the counts fresh if another user votes
            // while this tab is open — no need to refresh the page.
            onSnapshot(docRef, (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    votes[id].up = data.up || 0;
                    votes[id].down = data.down || 0;
                    updateVoteDisplay(id);
                }
            }, (err) => console.warn(`Snapshot error for ${id}:`, err));

        } catch (err) {
            // Non-fatal — just show whatever the hardcoded defaults are
            console.warn(`Failed to load/init votes for ${id}:`, err);
        }
    }
}

// This was accidentally defined inside loadVotes() at some point — moved it
// out so it can be called independently after auth state changes too.
async function loadUserVoteState() {
    Object.keys(votes).forEach(id => {
        votes[id].userVote = null;
        updateVoteDisplay(id);
    });

    if (!currentUser) return;

    for (const id of Object.keys(votes)) {
        try {
            const userVoteDocRef = doc(userVotesCollection, `${currentUser.uid}_${id}`);
            const userVoteSnap = await getDoc(userVoteDocRef);
            if (userVoteSnap.exists()) {
                const vote = userVoteSnap.data().vote;
                votes[id].userVote = vote === 'up' || vote === 'down' ? vote : null;
            }
            updateVoteDisplay(id);
        } catch (err) {
            console.warn(`Could not load saved vote for ${id}:`, err);
        }
    }
}

// ─── Auth Prompt ──────────────────────────────────────────────────

// Shows the user's name (or a "sign in" nudge) in the header.
// Called after every auth state change so it stays in sync.
function updateAuthPrompt() {
    const prompt = document.getElementById('authPrompt');
    if (!prompt) return;
    if (currentUser) {
        prompt.innerHTML = `Signed in as ${currentUser.email || currentUser.displayName || 'User'}.`;
        prompt.classList.remove('guest');
    } else {
        // Show a minimal sign-in button — don't block the page for guests,
        // but let them know they can't vote without logging in.
        prompt.innerHTML = `Guest mode: <button id="loginButton">Sign in to vote</button>`;
        prompt.classList.add('guest');
        const loginBtn = document.getElementById('loginButton');
        if (loginBtn) loginBtn.onclick = () => window.location.href = 'Login.html';
    }
}

// ─── Vote Display ─────────────────────────────────────────────────

function updateVoteDisplay(id) {
    const upBtn = document.querySelector(`.reaction-btn.upvote[data-card="${id}"]`);
    const downBtn = document.querySelector(`.reaction-btn.downvote[data-card="${id}"]`);
    if (upBtn) {
        upBtn.querySelector('.upvote-count').textContent = votes[id].up;
        // Highlight the button the user already voted on so they know their state
        if (votes[id].userVote === 'up') upBtn.classList.add('voted');
        else upBtn.classList.remove('voted');
    }
    if (downBtn) {
        downBtn.querySelector('.downvote-count').textContent = votes[id].down;
        if (votes[id].userVote === 'down') downBtn.classList.add('voted');
        else downBtn.classList.remove('voted');
    }
}

// ─── Vote Handler ─────────────────────────────────────────────────

async function handleVote(cardId, type) {
    if (!currentUser) {
        // Prompt instead of silently failing — users are often confused when nothing happens
        const shouldLogin = confirm('You must sign in before voting. Go to the login page now?');
        if (shouldLogin) window.location.href = 'Login.html';
        return;
    }

    const v = votes[cardId];
    if (!v) return;

    // Clicking the same vote twice does nothing — could toggle it off later if needed
    if (v.userVote === type) return;

    try {
        const voteDocRef = doc(votesCollection, cardId);
        const userVoteDocRef = doc(userVotesCollection, `${currentUser.uid}_${cardId}`);

        const result = await runTransaction(db, async (transaction) => {
            const [voteSnap, userVoteSnap] = await Promise.all([
                transaction.get(voteDocRef),
                transaction.get(userVoteDocRef)
            ]);

            const voteData = voteSnap.exists() ? voteSnap.data() : { up: votes[cardId].up, down: votes[cardId].down };
            const previousVote = userVoteSnap.exists() ? userVoteSnap.data().vote : null;

            if (previousVote === type) {
                return {
                    up: voteData.up || 0,
                    down: voteData.down || 0,
                    userVote: previousVote || null,
                    changed: false
                };
            }

            let up = voteData.up || 0;
            let down = voteData.down || 0;

            if (previousVote === 'up') up = Math.max(0, up - 1);
            if (previousVote === 'down') down = Math.max(0, down - 1);

            if (type === 'up') up += 1;
            if (type === 'down') down += 1;

            transaction.set(voteDocRef, { up, down }, { merge: true });
            transaction.set(userVoteDocRef, {
                userId: currentUser.uid,
                hotlineId: cardId,
                vote: type,
                timestamp: serverTimestamp()
            });

            return { up, down, userVote: type, changed: true };
        });

        v.up = result.up;
        v.down = result.down;
        v.userVote = result.userVote;
        updateVoteDisplay(cardId);

        const activeBtn = document.querySelector(`.reaction-btn.${type === 'up' ? 'upvote' : 'downvote'}[data-card="${cardId}"]`);
        if (result.changed) pulseBtn(activeBtn);
    } catch (error) {
        console.error('Error updating vote:', error);
        alert('Could not save your vote. Please try again.');
    }
}

// Tiny CSS animation to give the vote button some tactile feedback.
// Resets the class first with offsetWidth to force a reflow so it
// re-triggers even if the user clicks rapidly.
function pulseBtn(btn) {
    if (!btn) return;
    btn.classList.remove('vote-pulse');
    void btn.offsetWidth; // reflow trick — yes it's a bit hacky but it works
    btn.classList.add('vote-pulse');
    btn.addEventListener('animationend', () => btn.classList.remove('vote-pulse'), { once: true });
}

// ─── Comment View ─────────────────────────────────────────────────

async function openComments(cardId, cardName) {
    currentCard = cardId;
    document.getElementById('commentTitle').textContent = cardName;

    // Swap views
    document.getElementById('hotlinesView').classList.remove('active');
    document.getElementById('commentView').classList.add('active');

    // Reset input in case the user previously typed something and backed out
    document.getElementById('commentInput').value = '';
    autoResize(document.getElementById('commentInput'));

    // Show a loading state before comments arrive
    comments[cardId] = [];
    document.getElementById('commentSub').textContent = '0 comments';
    renderComments(cardId);

    try {
        await loadComments(cardId);
        const len = comments[cardId].length;
        // Pluralise properly — "1 comment" not "1 comments"
        document.getElementById('commentSub').textContent = `${len} comment${len !== 1 ? 's' : ''}`;
        renderComments(cardId);
    } catch (err) {
        console.error('Error loading comments:', err);
    }
}

async function loadComments(cardId) {
    const q = query(commentsCollection, where('hotlineId', '==', cardId));
    const querySnapshot = await getDocs(q);
    const commentList = [];
    const seenComments = new Set();
    querySnapshot.forEach(docSnap => {
        const data = docSnap.data();
        const dedupeKey = [
            (data.userId || '').toLowerCase(),
            (data.user || '').trim().toLowerCase(),
            (data.text || '').trim().toLowerCase()
        ].join('::');

        if (seenComments.has(dedupeKey)) {
            return;
        }
        seenComments.add(dedupeKey);

        commentList.push({
            id: docSnap.id,           // keep the doc ID — useful if we add edit/delete later
            userId: data.userId || null,
            user: data.user,
            initials: data.initials,
            text: data.text,
            time: data.time,
            timestamp: data.timestamp
        });
    });

    // Sort oldest-first so the conversation reads naturally top to bottom
    commentList.sort((a,b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
    comments[cardId] = commentList;
}

function renderComments(cardId) {
    const list = document.getElementById('commentsList');
    const c = comments[cardId];
    if (!c || c.length === 0) {
        list.innerHTML = `<div class="no-comments"><i class="fas fa-comments"></i><span>No comments yet.<br>Be the first to review!</span></div>`;
        return;
    }
    // Escape everything before injecting into the DOM — user content is untrusted
    list.innerHTML = c.map(item => `
            <div class="comment-item">
                <div class="comment-item-top">
                    <div class="comment-avatar">${escapeHtml(item.initials)}</div>
                    <span class="comment-user">${escapeHtml(item.user)}</span>
                    <span class="comment-time">${escapeHtml(item.time)}</span>
                    ${item.userId === currentUser?.uid ? `
                    <button class="comment-delete-btn" data-comment-id="${escapeHtml(item.id)}" title="Delete comment">
                        <i class="fas fa-trash-alt"></i>
                    </button>` : ''}
                </div>
                <div class="comment-text">${escapeHtml(item.text)}</div>
            </div>
        `).join('');

    // Auto-scroll to the latest comment so users don't have to scroll down manually
    list.scrollTop = list.scrollHeight;
}

// Grows the textarea as the user types so long reviews don't get buried.
// Capped at 80px to prevent it from eating the whole screen on mobile.
function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 80) + 'px';
}

// ─── Send Comment ─────────────────────────────────────────────────

async function sendComment() {
    const input = document.getElementById('commentInput');
    const text = input.value.trim();

    // Bail early if the input's empty or we somehow lost track of the active card
    if (!text || !currentCard) return;

    if (!currentUser) {
        alert('Please sign in to leave a comment.');
        window.location.href = 'Login.html';
        return;
    }

    // Prefer the full name we fetched from Firestore over whatever auth gave us.
    // Falls back down the chain: fullName → email prefix → 'User'
    const user = currentUserFullName || currentUser.email?.split('@')[0] || 'User';
    const initials = currentUserInitials || user.charAt(0).toUpperCase();

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const commentData = {
        hotlineId: currentCard,
        userId: currentUser.uid,
        user: user,
        initials: initials,
        text: text,
        time: timeStr,
        timestamp: serverTimestamp()
    };

    try {
        const docRef = await addDoc(commentsCollection, commentData);

        // Push into local cache immediately so the UI updates without re-fetching
        comments[currentCard].push({
            id: docRef.id,
            userId: currentUser.uid,
            user: user,
            initials: initials,
            text: text,
            time: timeStr
        });

        input.value = '';
        autoResize(input);
        renderComments(currentCard);

        const len = comments[currentCard].length;
        document.getElementById('commentSub').textContent = `${len} comment${len !== 1 ? 's' : ''}`;
    } catch (err) {
        console.error('Failed to send comment:', err);
        alert('Could not post comment. Please try again.');
    }
}

async function deleteComment(commentId) {
    if (!currentUser || !currentCard) return;

    const comment = comments[currentCard]?.find(item => item.id === commentId);
    if (!comment || comment.userId !== currentUser.uid) {
        alert('You can only delete your own comments.');
        return;
    }

    const shouldDelete = confirm('Delete this comment?');
    if (!shouldDelete) return;

    try {
        await deleteDoc(doc(commentsCollection, commentId));
        comments[currentCard] = comments[currentCard].filter(item => item.id !== commentId);
        renderComments(currentCard);

        const len = comments[currentCard].length;
        document.getElementById('commentSub').textContent = `${len} comment${len !== 1 ? 's' : ''}`;
    } catch (err) {
        console.error('Failed to delete comment:', err);
        alert('Could not delete comment. Please try again.');
    }
}

// Basic HTML escaping — not a full sanitizer, but enough to prevent
// accidental XSS from user-submitted comment text rendered via innerHTML
function escapeHtml(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Initialization ───────────────────────────────────────────────

// Attach DOM listeners first — they don't need Firebase and shouldn't wait for it.
// Keeps the back button and nav working even on a bad connection.
attachEventListeners();

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    currentUserFullName = null;
    currentUserInitials = null;

    if (user) {
        try {
            // Fetch the full profile from Firestore — auth alone only gives us
            // email and displayName, which might not be set for all accounts.
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                const data = userDocSnap.data();
                // Handle both "fullName" and separate first/last fields
                // depending on how the user registered
                currentUserFullName = data.fullName || data.firstName + ' ' + data.lastName || user.email?.split('@')[0] || 'User';
            } else {
                // User doc might not exist yet (e.g., social login first time)
                currentUserFullName = user.displayName || user.email?.split('@')[0] || 'User';
            }
            currentUserInitials = currentUserFullName.charAt(0).toUpperCase();
        } catch (err) {
            // Firestore might be unreachable — fall back gracefully
            console.warn('Could not fetch user name:', err);
            currentUserFullName = user.email?.split('@')[0] || 'User';
            currentUserInitials = currentUserFullName.charAt(0).toUpperCase();
        }
    }

    // Update the header prompt, then load votes now that we know who the user is.
    // Order matters here — loadVotes() checks currentUser to decide if it can write.
    updateAuthPrompt();
    await loadVotes();
    await loadUserVoteState();
});
