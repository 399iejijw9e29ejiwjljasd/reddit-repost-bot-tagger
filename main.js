// Modified main.js to show Bot Likelihood based on Karma Ratio
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
    // For old reddit, select taglines and filter later by checking container classes.
    if ((userElements = document.getElementsByClassName('tagline')).length !== 0) {
        return [oldRedditType, Array.from(userElements)];
    }
    // For new reddit, select only post author links.
    else if ((userElements = document.querySelectorAll('a[data-testid="post_author_link"]')).length !== 0) {
        return [newDesktopType, Array.from(userElements)];
    }
    else if ((userElements = document.querySelectorAll('a[class^="PostHeader__author"]')).length !== 0) {
        return [newMobileLoggedInType, Array.from(userElements)];
    }
    else if ((userElements = document.querySelectorAll('a[slot="authorName"]')).length !== 0) {
        return [newMobileLoggedOutType, Array.from(userElements)];
    }
    else if ((userElements = document.querySelectorAll('a[href^="/user/"]:not([aria-label$="avatar"])'))) {
        return [newOtherDesktopLoggedOutType, Array.from(userElements)];
    }
    else {
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
                // Only show the Bot Likelihood if post karma is at least 100,000.
                if (linkKarma < 100000) {
                    return;
                }
                // Compute the ratio; if comment karma is zero, we get NaN.
                const numericRatio = (commentKarma === 0) ? NaN : (linkKarma / commentKarma);
                let label;
                if (isNaN(numericRatio)) {
                    label = "N/A";
                } else if (numericRatio < 50) {
                    label = "Low";
                } else if (numericRatio < 100) {
                    label = "Medium";
                } else {
                    label = "High";
                }
                createKarmaNode(username, label, numericRatio);
            })
            .catch((error) => {
                console.error(error);
            });
    }
}

/**
 * Creates the highlight node for Bot Likelihood and sets the background color based on numeric ratio.
 */
function createKarmaNode(username, label, numericRatio) {
    const node = document.createElement('span');
    node.appendChild(document.createTextNode(`Bot Likelihood: ${label}`));
    const highlightColor = getColorForRatio(numericRatio);
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
 * Returns a color based on the numeric ratio:
 * - NaN: gray
 * - Ratio less than 50: green
 * - Ratio from 50 up to 100: orange
 * - Ratio 100 or greater: red
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

function nodeInTagline(tagline) {
    return tagline.getElementsByClassName('reddit_karma_ratio').length > 0;
}

function insertAfter(newNode, referenceNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

// Periodically scan for new post author elements, unless rate-limited.
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
