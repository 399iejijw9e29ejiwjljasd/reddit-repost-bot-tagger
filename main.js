// Revised main.js for Reddit Repost Bot Tagger with caching/queue and settings waiting.
// Derived from https://github.com/golf1052/reddit-age

const seenUsers = {};              // Stores created DOM nodes per user.
const userDataCache = {};          // Cache for fetched user data.
const fetchQueue = [];             // Queue for usernames that need fetching.
const oldRedditType = 'old';
const newDesktopType = 'new-desktop';
const newMobileLoggedInType = 'new-mobile-logged-in';
const newMobileLoggedOutType = 'new-mobile-logged-out';
const newOtherDesktopLoggedOutType = 'new-other-desktop-logged-out';

let rateLimited = false;
let rateLimitExpires = null;

// Global settings; must be loaded from storage.
let featureEnabled = false;
let autoFilterEnabled = false;

/**
 * Main function that scans the page for user elements.
 */
function main() {
    if (!featureEnabled) return;
    const elements = getUserElements();
    if (!elements) {
        console.error('No user elements found.');
        return;
    }
    const [type, userElements] = elements;
    userElements.forEach((element) => {
        // Skip if inside a comment.
        if (element.closest('.comment') || element.closest('[data-testid="comment"]')) return;

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
 * Determines which user elements to process based on Reddit layout.
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
 * Processes a user: if cached, uses the data; otherwise, queues a fetch.
 */
function processUser(username, userElement) {
    if (username === '[deleted]') return;
    if (seenUsers[username]) {
        insertAfter(seenUsers[username].cloneNode(true), userElement);
        return;
    }
    if (userDataCache[username]) {
        const data = userDataCache[username];
        createKarmaNode(username, data.label, data.finalRatio, userElement);
        return;
    }
    // Queue the fetch if not already queued.
    if (!fetchQueue.some(item => item.username === username)) {
        console.log("Queuing fetch for:", username);
        fetchQueue.push({ username, userElement });
    }
}

/**
 * Processes one fetch from the queue every 2 seconds.
 */
function processFetchQueue() {
    if (rateLimited || fetchQueue.length === 0) return;
    const { username, userElement } = fetchQueue.shift();
    console.log("Fetching data for:", username);
    fetch(`https://reddit.com/user/${username}/about.json`)
        .then((response) => {
            if (response.status === 429) {
                rateLimited = true;
                const reset = response.headers.get('x-ratelimit-reset');
                rateLimitExpires = Date.now() + (reset ? parseInt(reset) * 1000 : 600 * 1000);
                console.warn("Rate limited. Will retry later.");
                // Requeue the user.
                fetchQueue.push({ username, userElement });
                return;
            }
            return response.json();
        })
        .then((data) => {
            if (!data) return;
            const linkKarma = data?.data?.link_karma ?? 0;
            const commentKarma = data?.data?.comment_karma ?? 0;
            const createdAt = data?.data?.created_utc; // seconds
            if (linkKarma < 100000) {
                console.log(`Skipping ${username} due to low post karma (${linkKarma}).`);
                return;
            }
            const originalRatio = (commentKarma === 0) ? NaN : (linkKarma / commentKarma);
            let finalRatio = originalRatio;
            if (!isNaN(originalRatio) && createdAt) {
                const ageYears = (Date.now() / 1000 - createdAt) / 31557600;
                finalRatio = originalRatio - (5 * ageYears);
            }
            let label;
            if (isNaN(finalRatio)) label = "N/A";
            else if (finalRatio < 50) label = "Low";
            else if (finalRatio < 100) label = "Medium";
            else label = "High";
            // Cache the data.
            userDataCache[username] = { finalRatio, label };
            console.log(`User ${username}: Ratio=${finalRatio.toFixed(2)}, Label=${label}`);
            if (autoFilterEnabled && label === "High") {
                const container = getPostContainer(userElement);
                if (container) {
                    container.style.display = "none";
                    console.log(`Auto-filtered post from ${username}`);
                }
                return;
            }
            createKarmaNode(username, label, finalRatio, userElement);
        })
        .catch((error) => {
            console.error("Error fetching data for", username, error);
        });
}

/**
 * Creates and inserts a DOM node with the Bot Likelihood label.
 */
function createKarmaNode(username, label, finalRatio, userElement) {
    const node = document.createElement('span');
    node.textContent = `Bot Likelihood: ${label}`;
    node.style.cssText = `
        background-color: ${getColorForRatio(finalRatio)};
        color: #fff;
        padding: 2px;
        margin: 3px;
        font-weight: bold;
        border-radius: 3px;
    `;
    node.className = "reddit_karma_ratio";
    seenUsers[username] = node;
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
 * Finds the post container for auto-filtering.
 */
function getPostContainer(userElement) {
    let container = userElement.closest('.thing');
    if (!container) container = userElement.closest('[data-testid="post-container"]');
    return container;
}

function nodeInTagline(tagline) {
    return tagline.getElementsByClassName('reddit_karma_ratio').length > 0;
}

function insertAfter(newNode, referenceNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

/**
 * Starts periodic scanning and fetch queue processing.
 */
function startScanning() {
    setInterval(() => {
        if (!rateLimited) {
            main();
        } else if (rateLimitExpires && Date.now() > rateLimitExpires) {
            rateLimited = false;
            rateLimitExpires = null;
            console.log("Rate limit reset.");
        }
    }, 1000);
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
        startScanning(); // Fallback: start scanning even if settings fail.
    });
