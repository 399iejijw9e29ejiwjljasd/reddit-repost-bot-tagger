# Reddit Bot Likelihood Analyzer

A Firefox extension that calculates Reddit post authors' karma ratios to assess their bot likelihood. The extension fetches a user's post and comment karma via Reddit's API, computes the ratio (post/comment), and classifies the result as **Low**, **Medium**, or **High** bot likelihood. Additionally, it offers an option to automatically filter out posts from users with a high likelihood of being bots.

## Features

- **Karma Ratio Calculation:** Retrieves a user's post and comment karma and calculates the ratio.
- **Bot Likelihood Classification:**  
  - **Low:** Ratio below 50  
  - **Medium:** Ratio between 50 and 100  
  - **High:** Ratio 100 or above  
- **Color-Coded Highlights:** Uses green, orange, and red to visually indicate the likelihood level.
- **Auto-Filter Option:** Optionally hides posts from users with a high bot likelihood.
- **Reddit Compatibility:** Works with both old and new Reddit layouts and processes only post authors.

## Installation

### For Personal Use (Persistent Installation)

1. **Organize Your Extension Files:**  
   Ensure your extension folder contains the following:
   - `manifest.json`
   - `main.js`
   - `options.js`
   - `options.html`
   - Any assets (e.g., icons)

2. **Package the Extension:**  
   - Select all files in the extension folder (not the folder itself) and compress them into a ZIP archive.
   - Rename the archive from `.zip` to `.xpi`.

3. **Install in Firefox:**  
   - Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
   - Click **Load Temporary Add-on…** and select your `.xpi` file.
   - For persistent installation on release Firefox, you must sign the extension or use Firefox Developer Edition/Nightly (which allow disabling signature enforcement).

## Usage

Once installed, the extension automatically scans Reddit pages for post authors, fetches their karma data, and displays a label next to their username indicating their **Bot Likelihood**:
- **Low (Green):** Karma ratio below 50.
- **Medium (Orange):** Karma ratio between 50 and 100.
- **High (Red):** Karma ratio 100 or above.

If the **Auto-Filter** option is enabled, posts from users with a "High" bot likelihood are automatically hidden.

## Options

Access the extension’s options page to:
- Enable/disable the Karma Ratio feature.
- Enable/disable auto-filtering of posts from high bot likelihood users.

You can open the options page via the Firefox Add-Ons Manager or directly navigate to the options URL defined in your extension.

## Contributing

Contributions, bug reports, and feature requests are welcome! Please fork this repository and submit pull requests with your improvements.

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgments

- Inspired by the [NRMT extension](https://github.com/Mothrakk/NRMT).
- Thanks to the Reddit API and Mozilla for providing robust extension development tools.
