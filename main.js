// Modified main.js to show Bot Likelihood with account age adjustment, auto-filtering,
// and reduced API requests via caching and a request queue.
// Derived from https://github.com/golf1052/reddit-age

const seenUsers = {};              // Stores the DOM node for each processed user.
const userDataCache = {};          // Cache of fetched user data (persisting for the session).
const fetchQueue = [];             // Queue of usernames to fetch.
const oldRedditType = 'old';
const newDesktopType = 'new-desktop';
const newMobileLoggedInType = 'new-mobile-logged-in';
const newMobileLoggedOutType = 'new-mobile-logged-out';
const newOtherDesktopLoggedOutType = 'new-other-desktop-logged-out';
let rateLimited = false;
let rateLimitExpires = null;

// Global settings from options.
let featureEnabled = false;
let autoFilterEnabled = false;

// Main scanning function. This runs every second.
function main() {
    // If the overall feature is disabled, do nothing.
    if (!featureEnabled) {
        return;
    }
    const elements = getUserElements();
    if (!elements) {
        console.error('Could not determine reddit type or find user elements.');
        return;
    }
    const [type, userElements] = elements;
    userElements.forEach((element) => {
        // Process only post authors – skip if the element is inside a comment.
        if (element.closest('.comment') || element.closest('[data-testid="comment"]')) {
            return;
        }
        let tagline = null;
        let userElement = null;
        let username = null;
        if (type === oldRedditType) {
            tagline = element;
            userElement = tagline.getElementsByClassName('author')[0];
            if (!userElement) return;
            username = userElement.innerText;
        } else if (type === newDesktopType) {
            userElement = element.parentNode.parentNode;
            tagline = userElement.parentNode;
            username = element.getAttribute('href').split('/')[2];
        } else if (type === newMobileLoggedInType) {
            userElement = element;
            tagline = userElement.parentNode;
            username = element.getAttribute('href').split('/')[2];
        } else if (type === newMobileLoggedOutType) {
            userElement = element;
            tagline = userElement.parentNode.parentNode;
            username = element.getAttribute('href').split('/')[2];
        } else if (type === newOtherDesktopLoggedOutType) {
            userElement = element.parentNode;
            tagline = element.parentNode.parentNode;
            username = element.getAttribute('href').split('/')[2];
        } else {
            return;
        }
        if (nodeInTagline(tagline)) return;
        processUser(username, userElement);
    });
}

/**
 * Returns [type, elements] based on the current Reddit layout.
 */
function getUserElements() {
    let userElements = [];
    if ((userElements = document.getElementsByClassName('tagline')).length !== 0) {
        return [oldRedditType, Array.from(userElements)];
    } else if ((userElements = document.querySelectorAll('a[data-testid="post_author_link"]')).length !== 0) {
        return [newDesktopType, Array.from(userElements)];
    } else if ((userElements = document.querySelectorAll('a[class^="PostHeader__author"]')).length !== 0) {
        return [newMobileLoggedInType, Array.from(userElements)];
    } else if ((userElements = document.querySelectorAll('a[slot="authorName"]')).length !== 0) {
        return [newMobileLoggedOutType, Array.from(userElements)];
    } else if ((userElements = document.querySelectorAll('a[href^="/user/"]:not([aria-label$="avatar"])')).length !== 0) {
        return [newOtherDesktopLoggedOutType, Array.from(userElements)];
    } else {
        return null;
    }
}

/**
 * Processes a user by either using cached data, or queueing a fetch if needed.
 */
function processUser(username, userElement) {
    if (username === '[deleted]') return;

    // If already processed, insert cached node.
    if (username in seenUsers) {
        insertAfter(seenUsers[username].cloneNode(true), userElement);
        return;
    }
    // If we have cached user data, use it.
    if (userDataCache[username]) {
        const data = userDataCache[username];
        createKarmaNode(username, data.label, data.finalRatio, userElement);
        return;
    }
    // If not already in the queue, add it.
    if (!fetchQueue.some(item => item.username === username)) {
        fetchQueue.push({ username, userElement });
    }
}

/**
 * Process the fetch queue at a limited rate (e.g., one request every 2 seconds).
 */
function processFetchQueue() {
    if (rateLimited) return;
    if (fetchQueue.length === 0) return;

    const { username, userElement } = fetchQueue.shift();
    fetch(`https://reddit.com/user/${username}/about.json`)
        .then((response) => {
            if (response.status === 429) {
                rateLimited = true;
                const rateLimitReset = response.headers.get('x-ratelimit-reset');
                if (rateLimitReset) {
                    rateLimitExpires = new Date();
                    rateLimitExpires.setSeconds(rateLimitExpires.getSeconds() + parseInt(rateLimitReset));
                } else {
                    rateLimitExpires = new Date();
                    rateLimitExpires.setSeconds(rateLimitExpires.getSeconds() + 600);
                }
                // Re-queue the username for later processing.
                fetchQueue.push({ username, userElement });
                return;
            } else {
                return response.json();
            }
        })
        .then((data) => {
            if (!data) return;
            const linkKarma = data?.data?.link_karma ?? 0;
            const commentKarma = data?.data?.comment_karma ?? 0;
            const createdAt = data?.data?.created_utc; // Unix timestamp in seconds
            // Only proceed if post karma is at least 100,000.
            if (linkKarma < 100000) return;
            // Compute original ratio (if commentKarma is zero, result is NaN).
            const originalRatio = (commentKarma === 0) ? NaN : (linkKarma / commentKarma);
            let finalRatio = originalRatio;
            // Adjust the ratio: subtract 5 points per year of account age.
            if (!isNaN(originalRatio) && createdAt) {
                const currentTimeSec = Date.now() / 1000;
                const accountAgeYears = (currentTimeSec - createdAt) / 31557600;
                finalRatio = originalRatio - (5 * accountAgeYears);
            }
            let label;
            if (isNaN(finalRatio)) {
                label = "N/A";
            } else if (finalRatio < 50) {
                label = "Low";
            } else if (finalRatio < 100) {
                label = "Medium";
            } else {
                label = "High";
            }
            // Cache the computed data for this user.
            userDataCache[username] = { finalRatio, label };
            // Auto-filter: if enabled and likelihood is High, hide the post.
            if (autoFilterEnabled && label === "High") {
                const postContainer = getPostContainer(userElement);
                if (postContainer) {
                    postContainer.style.display = "none";
                }
                return;
            }
            createKarmaNode(username, label, finalRatio, userElement);
        })
        .catch((error) => {
            console.error("Error fetching user data for", username, error);
        });
}

/**
 * Creates (or updates) the DOM node for the user with Bot Likelihood info.
 */
function createKarmaNode(username, label, finalRatio, userElement) {
    const node = document.createElement('span');
    node.textContent = `Bot Likelihood: ${label}`;
    const highlightColor = getColorForRatio(finalRatio);
    node.setAttribute('style', `
        background-color: ${highlightColor};
        color: #fff;
        padding: 2px;
        margin: 3px;
        font-weight: bold;
        border-radius: 3px;
    `);
    node.className = "reddit_karma_ratio";
    seenUsers[username] = node;
    // Insert the node after the user element.
    insertAfter(node, userElement);
}

/**
 * Returns a color based on the final ratio.
 */
function getColorForRatio(ratioValue) {
    if (isNaN(ratioValue)) return "gray";
    if (ratioValue < 50) return "rgb(0, 200, 0)";
    else if (ratioValue < 100) return "rgb(255, 165, 0)";
    else return "rgb(255, 0, 0)";
}

/**
 * Finds the post container element for auto-filtering.
 */
function getPostContainer(userElement) {
    let container = userElement.closest('.thing');
    if (!container) {
        container = userElement.closest('[data-testid="post-container"]');
    }
    return container;
}

function nodeInTagline(tagline) {
    return tagline.getElementsByClassName('reddit_karma_ratio').length > 0;
}

function insertAfter(newNode, referenceNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

// Start periodic scanning and queue processing.
function startScanning() {
    setInterval(() => {
        if (!rateLimited) {
            main();
        } else if (rateLimitExpires && Date.now() > rateLimitExpires) {
            rateLimited = false;
            rateLimitExpires = null;
        }
    }, 1000);
    // Process one queued fetch every 2 seconds.
    setInterval(processFetchQueue, 2000);
}

// Wait for settings to load before starting.
browser.storage.sync.get(["featureEnabled", "autoFilterEnabled"])
    .then((results) => {
        featureEnabled = results.featureEnabled === true;
        autoFilterEnabled = results.autoFilterEnabled === true;
        if (featureEnabled) {
            console.log("Repost Bot Tagger is enabled. Starting scan...");
            startScanning();
        } else {
            console.log("Repost Bot Tagger is disabled.");
        }
    })
    .catch((err) => {
        console.error("Error loading settings:", err);
        // As fallback, start scanning.
        startScanning();
    });
