// Modified main.js to show Bot Likelihood with account age adjustment and auto-filtering.
// Derived from https://github.com/golf1052/reddit-age

const seenUsers = {};
const oldRedditType = 'old';
const newDesktopType = 'new-desktop';
const newMobileLoggedInType = 'new-mobile-logged-in';
const newMobileLoggedOutType = 'new-mobile-logged-out';
const newOtherDesktopLoggedOutType = 'new-other-desktop-logged-out';
let rateLimited = false;
let rateLimitExpires = null;

// Global variable for auto-filter option.
let autoFilterEnabled = false;

function main() {
    const elements = getUserElements();
    if (elements === null) {
        console.error('Could not determine reddit type or could not find users.');
        return;
    }
    const [type, userElements] = elements;
    userElements.forEach((element) => {
        // Only process post authors – skip if the element is inside a comment container.
        if (element.closest('.comment') || element.closest('[data-testid="comment"]')) {
            return;
        }
        let tagline = null;
        let userElement = null;
        let username = null;

        if (type === oldRedditType) {
            // old.reddit.com (desktop and mobile)
            tagline = element;
            userElement = tagline.getElementsByClassName('author')[0];
            if (!userElement) {
                return;
            }
            username = userElement.innerText;
        } else if (type === newDesktopType) {
            // new.reddit.com (desktop and direct link mobile)
            userElement = element.parentNode.parentNode;
            tagline = userElement.parentNode;
            username = element.getAttribute('href').split('/')[2];
        } else if (type === newMobileLoggedInType) {
            // new.reddit.com (logged in mobile only)
            userElement = element;
            tagline = userElement.parentNode;
            username = element.getAttribute('href').split('/')[2];
        } else if (type === newMobileLoggedOutType) {
            // new.reddit.com (logged out mobile only)
            userElement = element;
            tagline = userElement.parentNode.parentNode;
            username = element.getAttribute('href').split('/')[2];
        } else if (type === newOtherDesktopLoggedOutType) {
            // some other new reddit type (logged out)
            userElement = element.parentNode;
            tagline = element.parentNode.parentNode;
            username = element.getAttribute('href').split('/')[2];
        } else {
            return;
        }

        if (nodeInTagline(tagline)) {
            return;
        }
        processUser(username, userElement);
    });
}

/**
 * Returns an array with 2 items:
 *  - item 1 is a string denoting the user element type
 *  - item 2 is an array of user elements
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
    } else if ((userElements = document.querySelectorAll('a[href^="/user/"]:not([aria-label$="avatar"])'))) {
        return [newOtherDesktopLoggedOutType, Array.from(userElements)];
    } else {
        return null;
    }
}

function processUser(username, userElement) {
    if (username === '[deleted]') {
        return;
    }
    if (username in seenUsers) {
        insertAfter(seenUsers[username].cloneNode(true), userElement);
    } else {
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
                } else {
                    return response.json();
                }
            })
            .then((data) => {
                const linkKarma = data?.data?.link_karma ?? 0;
                const commentKarma = data?.data?.comment_karma ?? 0;
                const createdAt = data?.data?.created_utc; // Unix timestamp in seconds
                // Only proceed if post karma is at least 100,000.
                if (linkKarma < 100000) {
                    return;
                }
                // Compute the original ratio; if comment karma is zero, result is NaN.
                const originalRatio = (commentKarma === 0) ? NaN : (linkKarma / commentKarma);
                let finalRatio = originalRatio;
                // Adjust the ratio: subtract 5 points per year of account age.
                if (!isNaN(originalRatio) && createdAt) {
                    const currentTimeSec = Date.now() / 1000;
                    const accountAgeYears = (currentTimeSec - createdAt) / 31557600; // seconds in a year
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
                // Auto-filter: if enabled and bot likelihood is High, hide the post.
                if (autoFilterEnabled && label === "High") {
                    const postContainer = getPostContainer(userElement);
                    if (postContainer) {
                        postContainer.style.display = "none";
                    }
                    return;
                }
                createKarmaNode(username, label, finalRatio);
            })
            .catch((error) => {
                console.error(error);
            });
    }
}

/**
 * Creates the highlight node for Bot Likelihood and sets the background color based on the final ratio.
 */
function createKarmaNode(username, label, finalRatio) {
    const node = document.createElement('span');
    node.appendChild(document.createTextNode(`Bot Likelihood: ${label}`));
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
}

/**
 * Returns a color based on the final ratio:
 * - NaN: gray
 * - Ratio < 50: green
 * - Ratio 50 to <100: orange
 * - Ratio >= 100: red
 */
function getColorForRatio(ratioValue) {
    if (isNaN(ratioValue)) {
        return "gray";
    }
    if (ratioValue < 50) {
        return "rgb(0, 200, 0)"; // green
    } else if (ratioValue < 100) {
        return "rgb(255, 165, 0)"; // orange
    } else {
        return "rgb(255, 0, 0)"; // red
    }
}

/**
 * Attempts to find the post container element to hide when auto-filtering.
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

function startScanning() {
    setInterval(() => {
        if (!rateLimited) {
            main();
        } else if (rateLimitExpires && Date.now() > rateLimitExpires) {
            rateLimited = false;
            rateLimitExpires = null;
        }
    }, 1000);
}

// Wait for storage settings to load, then start scanning.
browser.storage.sync.get('autoFilterEnabled')
    .then((results) => {
        autoFilterEnabled = results.autoFilterEnabled === true;
        startScanning();
    })
    .catch((err) => {
        console.error(err);
        startScanning(); // Start scanning even if there's an error.
    });
