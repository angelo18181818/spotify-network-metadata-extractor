# Spotify Firefox Network Title Extractor

Network-first Spotify Web title extraction for Spotify search results using Playwright Firefox.

This tool does not use the Spotify Web API, Client IDs, Client Secrets, or the Spotify Developer Dashboard. It does not download audio, bypass DRM, or scrape metadata from OCR/DOM as the primary method. It opens the real Spotify Web app, lets you log in manually, captures browser network JSON responses, recursively scans them, and exports metadata that Spotify has already sent to the browser to render visible search results.

The extractor is manually gated: Firefox opens the selected Spotify search URL immediately and shows an `Extract` button at the top center of the page. Log in or get ready manually, then click `Extract` to continue extraction without changing to a different path.

## Setup

```bash
npm init -y
npm install playwright
npx playwright install firefox
node spotify-network-scraper.js --query "alien contact stories" --where audiobook
```

If you use this folder as-is, you can run:

```bash
npm install
npx playwright install firefox
node spotify-network-scraper.js --query "alien contact stories" --where audiobook
```

## Usage

```bash
node spotify-network-scraper.js --query "alien contact stories" --where audiobook
node spotify-network-scraper.js --query "alien contact stories" --where audiobook --limit 100 --debug
node spotify-network-scraper.js --query "alien contact stories" --where songs --extract-on-startup=true
node spotify-network-scraper.js --query "alien contact stories" --where audiobook --zoom 30
node spotify-network-scraper.js --query "alien contact stories" --where audiobook --zoom 30 --extract-on-startup=true --limit 100 --debug
```

Options:

- `--query "alien contact stories"`: search query. Positional query still works too.
- `--where audiobook`: Spotify search tab to open.
- `--market US`: optional market hint added to the Spotify search URL.
- `--limit 100`: maximum deduped results to export.
- `--debug`: print extra network matching progress.
- `--no-headless`: force a visible browser window. This is the default.
- `--headless`: run without a visible browser, useful only after login is already saved.
- `--profile ./spotify-firefox-profile`: persistent Playwright Firefox profile folder so login cookies are reused.
- `--out-dir ./results`: output folder. Defaults to the current directory.
- `--json-dir ./json`: folder where every parsed network JSON response is saved for manual inspection.
- `--zoom 30`: apply page zoom before extraction so more search results fit on screen.
- `--extract-on-startup=true`: start immediately and do not show the `Extract` button.
- `--extract-on-startup=false`: show the `Extract` button and wait for your click. This is the default.
- `--extract-on-starup=true`: legacy alias for `--extract-on-startup=true`.
- `--scrolls 8`: scroll passes used to trigger more Spotify search network requests.
- `--wait-ms 1500`: delay after navigation/scrolling while network responses arrive.
- `--ocr`: optional final fallback using `tesseract.js` if installed with `npm install tesseract.js`.

`--where` values:

- `all`: `https://open.spotify.com/search/<query>`
- `songs`: `https://open.spotify.com/search/<query>/tracks`
- `audiobook`: `https://open.spotify.com/search/<query>/audiobooks`
- `podcasts&shows`: `https://open.spotify.com/search/<query>/podcastAndEpisodes`
- `playlists`: `https://open.spotify.com/search/<query>/playlists`
- `albums`: `https://open.spotify.com/search/<query>/albums`
- `artists`: `https://open.spotify.com/search/<query>/artists`
- `genres&moods`: `https://open.spotify.com/search/<query>/genres`

In PowerShell, quote values containing `&`, for example `--where "podcasts&shows"`.

## Output Files

The scraper writes:

- `spotify_results.csv`
- `spotify_results.json`
- `debug_network_matches.json`
- `json/<run_id>_<number>_<response-url-slug>.json`
- `json/<run_id>_manifest.json`
- `json/_latest_manifest.json`

Each exported result includes only:

- `title`

Detailed extraction evidence, including response URL and JSON path, remains available in `debug_network_matches.json`.

For audiobooks, titles are read from `$.data.searchV2.audiobooks.items[*].data.name`.

## Extraction Strategy

1. Launch Firefox in headed mode with a persistent profile.
2. Open the selected Spotify search URL directly.
3. Show an `Extract` button at the top center of the browser.
4. Wait while you log in or get ready manually.
5. Start only after you click `Extract`.
6. Continue extraction on the already-open search URL.
7. Capture network responses.
8. Parse JSON responses.
9. Scan only `data.searchV2.<where>.items[*].data.name` or equivalent result-data paths for the selected section.
10. Deduplicate by Spotify URI when present, otherwise by title.
11. Save every parsed network JSON response into `./json/`.
12. Export CSV/JSON with only `title`, then print a terminal table.

If network JSON finds nothing, the script tries the Accessibility Tree, then a DOM visible-text dump. OCR is only attempted when `--ocr` is passed and `tesseract.js` is installed.

## Notes

Spotify's internal response shapes can change. The extractor is intentionally generic: it records the `source_response_url` and `json_path` for every match so you can inspect why a result was accepted and update heuristics if Spotify changes its payload format.

This project does not include stealth, CAPTCHA bypassing, proxy rotation, account-ban evasion, or anti-detection tricks. It is designed for manual, visible Spotify Web browsing and metadata capture only.
