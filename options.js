// options.js - Options page for enabling/disabling the Karma Ratio feature

document.addEventListener('DOMContentLoaded', () => {
    const featureToggle = document.getElementById('featureToggle');

    // Load the saved setting; default to enabled if not set.
    browser.storage.sync.get('karmaRatioEnabled')
        .then((results) => {
            // If not set or true, default to enabled (true)
            const enabled = results.karmaRatioEnabled !== false;
            featureToggle.checked = enabled;
        })
        .catch((error) => {
            console.error("Error retrieving karmaRatioEnabled setting:", error);
        });

    // Save the setting when the toggle is changed.
    featureToggle.addEventListener('change', (event) => {
        const isEnabled = event.target.checked;
        browser.storage.sync.set({ karmaRatioEnabled: isEnabled })
            .then(() => {
                console.log("Karma Ratio setting updated:", isEnabled);
            })
            .catch((error) => {
                console.error("Error saving karmaRatioEnabled setting:", error);
            });
    });
});
