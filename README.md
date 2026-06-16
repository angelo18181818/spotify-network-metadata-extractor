# Spotify Firefox Network Title Extractor

Network-first Spotify Web title extraction for Spotify search results using Node.js, Playwright, and Firefox.

This tool opens the real Spotify Web app in a visible Firefox window, lets the user log in manually, captures browser network JSON responses, and extracts titles from Spotify search-result payloads. It is designed for metadata that Spotify has already sent to the browser to render visible search results.

It does not use the Spotify Web API, Client IDs, Client Secrets, or the Spotify Developer Dashboard. It does not download audio, bypass DRM, or use OCR/DOM scraping as the primary method.

## Requirements

- Node.js 18 or newer
- npm
- Playwright Firefox
- A Spotify account if Spotify asks you to log in

## Install

From this project folder:

```bash
npm install
npx playwright install firefox
```

If PowerShell blocks `npm.ps1` with an execution-policy error, run PowerShell as your normal user and execute:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Then close and reopen PowerShell, and run `npm install` again.

## Basic Usage

Default mode opens Firefox, loads the selected Spotify search URL, and shows an `Extract` button at the top center of the page. Log in or wait until the page is ready, then click `Extract`.

```bash
node spotify-network-scraper.js --query "alien contact stories" --where audiobook
```

Start extraction immediately without the `Extract` button:

```bash
node spotify-network-scraper.js --query "alien contact stories" --where audiobook --extract-on-startup=true
```

Use a larger result surface by keeping the page zoomed out:

```bash
node spotify-network-scraper.js --query "alien contact stories" --where audiobook --zoom 30 --limit 100 --debug
```

## Search Locations

Use `--where` to choose the Spotify search tab:

| `--where` value | Spotify URL path |
| --- | --- |
| `all` | `/search/<query>` |
| `songs` | `/search/<query>/tracks` |
| `audiobook` | `/search/<query>/audiobooks` |
| `podcasts&shows` | `/search/<query>/podcastAndEpisodes` |
| `playlists` | `/search/<query>/playlists` |
| `albums` | `/search/<query>/albums` |
| `artists` | `/search/<query>/artists` |
| `genres&moods` | `/search/<query>/genres` |

Important for PowerShell: quote values that contain `&`, because PowerShell treats `&` as a command operator.

```powershell
node spotify-network-scraper.js --query "alien contact stories" --where "podcasts&shows"
node spotify-network-scraper.js --query "alien contact stories" --where "genres&moods"
```

## Options

- `--query "text"`: search query. A positional query still works too.
- `--where audiobook`: Spotify search tab to open.
- `--market US`: optional market hint added to the Spotify search URL.
- `--limit 100`: maximum deduplicated results to export. Default: `100`.
- `--profile ./spotify-firefox-profile`: persistent Firefox profile folder so login cookies are reused.
- `--out-dir ./results`: output folder. Defaults to the current directory.
- `--json-dir ./json`: folder where every parsed network JSON response is saved for inspection.
- `--zoom 30`: apply page zoom before extraction so more search results fit on screen. Default: `30`.
- `--extract-on-startup=true`: start immediately and do not show the `Extract` button.
- `--extract-on-startup=false`: show the `Extract` button and wait for your click. This is the default.
- `--extract-on-starup=true`: legacy typo alias for `--extract-on-startup=true`.
- `--scrolls 8`: scroll passes used to trigger more Spotify search network requests.
- `--wait-ms 1500`: delay after navigation and scrolling while network responses arrive.
- `--debug`: print extra network matching progress.
- `--headless`: run without a visible browser, useful only after login is already saved.
- `--no-headless`: force a visible browser window. This is the default.
- `--ocr`: optional final fallback using `tesseract.js` if installed with `npm install tesseract.js`.

## Output

The main exported files are:

- `spotify_results.csv`
- `spotify_results.json`

Each exported result includes only:

- `title`

The scraper also writes debug files:

- `debug_network_matches.json`
- `json/<run_id>_<number>_<response-url-slug>.json`
- `json/<run_id>_manifest.json`
- `json/_latest_manifest.json`

For audiobooks, titles are read from search-result JSON paths such as:

```text
$.data.searchV2.audiobooks.items[*].data.name
```

## Extraction Strategy

1. Launch Firefox in headed mode with a persistent profile.
2. Open the selected Spotify search URL directly.
3. Show an `Extract` button unless `--extract-on-startup=true` is used.
4. Wait while the user logs in or gets the page ready manually.
5. Capture network responses from Spotify Web.
6. Parse JSON responses.
7. Scan only `data.searchV2.<where>.items[*].data.name` or equivalent result-data paths for the selected search section.
8. Deduplicate by Spotify URI when present, otherwise by title.
9. Save raw parsed JSON responses into `./json/`.
10. Export CSV/JSON with only `title`, then print a terminal table.

If network JSON finds nothing, the script tries the Accessibility Tree, then a DOM visible-text dump. OCR is only attempted when `--ocr` is passed and `tesseract.js` is installed.

## Publishing to GitHub

Commit or upload only the project source files:

- `spotify-network-scraper.js`
- `README.md`
- `package.json`
- `package-lock.json`
- `.gitignore`

Do not upload these generated or private files:

- `node_modules/`
- `spotify-firefox-profile/`
- `spotify-profile/`
- `json/`
- `results/`
- `spotify_results.csv`
- `spotify_results.json`
- `debug_network_matches.json`
- `debug_ocr_screenshot.png`
- `*.log`

Why these files are ignored:

- `node_modules/` is large and reproducible. Anyone can recreate it with `npm install`.
- `spotify-firefox-profile/` can contain cookies, saved sessions, browsing data, cache files, and other private Firefox profile data.
- `json/` contains raw captured network responses. These are useful locally for debugging, but they may include account-specific or session-related data from the browser.
- `debug_network_matches.json`, result CSV/JSON files, screenshots, and logs are generated outputs. They should be recreated locally, not stored in the repository.

## Safety Notes

This project does not include stealth, CAPTCHA bypassing, proxy rotation, account-ban evasion, or anti-detection tricks. It is intended for manual, visible Spotify Web browsing and metadata capture only.

Spotify's internal response shapes can change. Debug files record the response URL and JSON path for every match so the extractor can be adjusted if Spotify changes its payload format.
