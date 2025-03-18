// Modified main.js to show Karma Ratio with color highlighting (green to red).
// Derived from https://github.com/Mothrakk/NRMT

const seenUsers = {};
const oldRedditType = 'old';
const newDesktopType = 'new-desktop';
const newMobileLoggedInType = 'new-mobile-logged-in';
const newMobileLoggedOutType = 'new-mobile-logged-out';
const newOtherDesktopLoggedOutType = 'new-other-desktop-logged-out';
let rateLimited = false;
let rateLimitExpires = null;

function main() {
    const elements = getUserElements();
    if (elements === null) {
        console.error('Could not determine reddit type or could not find users.');
        return;
    }
    const [type, userElements] = elements;
    userElements.forEach((element) => {
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
    } else if ((userElements = document.querySelectorAll('a[data-testid="post_author_link"], a[data-testid="comment_author_link"]')).length !== 0) {
        return [newDesktopType, Array.from(userElements)];
    } else if ((userElements = document.querySelectorAll('a[class^="PostHeader__author"], a[class^="CommentHeader__username"]')).length !== 0) {
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
                // Extract karma values from the JSON response
                const linkKarma = data?.data?.link_karma ?? 0;
                const commentKarma = data?.data?.comment_karma ?? 0;
                // Compute the ratio; if comment karma is zero, display "N/A"
                let ratio = (commentKarma === 0)
                    ? 'N/A'
                    : (linkKarma / commentKarma).toFixed(2);

                createKarmaNode(username, ratio);
            })
            .catch((error) => {
                console.error(error);
            });
    }
}

/**
 * Creates the highlight node for the karma ratio and sets the color from green to red.
 */
function createKarmaNode(username, ratio) {
    const node = document.createElement('span');
    node.appendChild(document.createTextNode(`Karma Ratio: ${ratio}`));

    // Convert ratio to a float if not 'N/A'
    const ratioValue = parseFloat(ratio);
    const highlightColor = getColorForRatio(ratioValue);

    // We'll use background color for highlighting and white text for readability
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
 * Returns a color from green to red based on the ratio.
 * - N/A (NaN): gray
 * - 0 up to <10: gradient from green (0,255,0) to red (255,0,0)
 * - >= 10: full red
 */
function getColorForRatio(ratioValue) {
    if (isNaN(ratioValue)) {
        // If ratio is 'N/A'
        return "gray";
    }
    if (ratioValue >= 10) {
        // If ratio is 10 or more, return red
        return "rgb(255, 0, 0)";
    }
    // For ratios below 10, interpolate from green to red
    // ratioValue = 0 => green (0,255,0), ratioValue = 10 => red (255,0,0)
    const fraction = Math.max(0, Math.min(ratioValue, 10)) / 10;
    const r = Math.round(255 * fraction);      // goes 0 -> 255
    const g = Math.round(255 * (1 - fraction)); // goes 255 -> 0
    return `rgb(${r}, ${g}, 0)`;
}

function nodeInTagline(tagline) {
    return tagline.getElementsByClassName('reddit_karma_ratio').length > 0;
}

function insertAfter(newNode, referenceNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

// Periodically scan for new user elements, unless rate-limited.
setInterval(() => {
    if (!rateLimited) {
        main();
    } else {
        if (rateLimitExpires && Date.now() > rateLimitExpires) {
            rateLimited = false;
            rateLimitExpires = null;
        }
    }
}, 1000);
