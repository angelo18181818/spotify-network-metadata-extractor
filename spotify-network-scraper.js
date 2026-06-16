#!/usr/bin/env node
'use strict';

const fsp = require('fs/promises');
const path = require('path');

const RESULT_FIELDS = [
  'query',
  'title',
  'subtitle',
  'authors',
  'narrators',
  'publisher',
  'description',
  'spotify_uri',
  'spotify_url',
  'image_url',
  'source_response_url',
  'json_path',
  'confidence',
];

const EXPORT_FIELDS = [
  'title',
];

const WHERE_CONFIG = {
  all: {
    label: 'all',
    segment: '',
    sectionKeys: null,
    typeRegex: /^(track|song|album|artist|playlist|audiobook|podcast|episode|show|genre|category)$/i,
  },
  songs: {
    label: 'songs',
    segment: 'tracks',
    sectionKeys: ['tracks', 'tracksV2'],
    typeRegex: /^(track|song)$/i,
  },
  audiobook: {
    label: 'audiobook',
    segment: 'audiobooks',
    sectionKeys: ['audiobooks'],
    typeRegex: /^audiobook$/i,
  },
  podcasts: {
    label: 'podcasts&shows',
    segment: 'podcastAndEpisodes',
    sectionKeys: ['podcasts', 'podcastAndEpisodes', 'episodes', 'shows'],
    typeRegex: /^(podcast|episode|show)$/i,
  },
  playlists: {
    label: 'playlists',
    segment: 'playlists',
    sectionKeys: ['playlists'],
    typeRegex: /^playlist$/i,
  },
  albums: {
    label: 'albums',
    segment: 'albums',
    sectionKeys: ['albums'],
    typeRegex: /^album$/i,
  },
  artists: {
    label: 'artists',
    segment: 'artists',
    sectionKeys: ['artists'],
    typeRegex: /^artist$/i,
  },
  genres: {
    label: 'genres&moods',
    segment: 'genres',
    sectionKeys: ['genres', 'genresAndMoods', 'moods', 'categories'],
    typeRegex: /^(genre|mood|category)$/i,
  },
};

const WHERE_ALIASES = new Map([
  ['all', 'all'],
  ['song', 'songs'],
  ['songs', 'songs'],
  ['track', 'songs'],
  ['tracks', 'songs'],
  ['audiobook', 'audiobook'],
  ['audiobooks', 'audiobook'],
  ['podcasts', 'podcasts'],
  ['podcast', 'podcasts'],
  ['shows', 'podcasts'],
  ['show', 'podcasts'],
  ['episodes', 'podcasts'],
  ['episode', 'podcasts'],
  ['podcastsandshows', 'podcasts'],
  ['podcastandshows', 'podcasts'],
  ['podcastandepisodes', 'podcasts'],
  ['playlist', 'playlists'],
  ['playlists', 'playlists'],
  ['album', 'albums'],
  ['albums', 'albums'],
  ['artist', 'artists'],
  ['artists', 'artists'],
  ['genre', 'genres'],
  ['genres', 'genres'],
  ['mood', 'genres'],
  ['moods', 'genres'],
  ['genresandmoods', 'genres'],
]);

const TITLE_KEYS = [
  'name',
  'title',
  'entityTitle',
  'displayTitle',
  'headline',
  'heading',
];

const SUBTITLE_KEYS = [
  'subtitle',
  'subTitle',
  'entitySubtitle',
  'displaySubtitle',
  'secondaryText',
  'tagline',
  'byline',
];

const AUTHOR_KEYS = [
  'authors',
  'authorsV2',
  'author',
  'authorV2',
  'creators',
  'creator',
  'writers',
  'writer',
  'writtenBy',
  'written_by',
];

const NARRATOR_KEYS = [
  'narrators',
  'narratorsV2',
  'narrator',
  'narratorV2',
  'readBy',
  'read_by',
  'reader',
  'readers',
  'performedBy',
  'performed_by',
];

const CONTRIBUTOR_KEYS = [
  'contributors',
  'contributor',
  'credits',
  'credit',
];

const PUBLISHER_KEYS = [
  'publisher',
  'publishers',
  'publisherName',
  'publishingHouse',
  'imprint',
];

const DESCRIPTION_KEYS = [
  'description',
  'html_description',
  'htmlDescription',
  'descriptionHtml',
  'longDescription',
  'shortDescription',
  'synopsis',
];

const TYPE_KEYS = [
  'type',
  '__typename',
  'entityType',
  'mediaType',
  'contentType',
  'itemType',
  'kind',
];

function printHelp() {
  console.log(`
Usage:
  node spotify-network-scraper.js --query "alien contact stories" --where audiobook [options]
  node spotify-network-scraper.js "alien contact stories" --where audiobook [options]

Options:
  --query "text"           Search query. Positional query still works too
  --where audiobook        Search tab: all, songs, audiobook, podcasts&shows, playlists, albums, artists, genres&moods
  --market US              Optional market hint added to the Spotify search URL
  --limit 100              Maximum deduped results to export. Default: 100
  --profile ./profile      Persistent Firefox profile folder. Default: ./spotify-firefox-profile
  --out-dir ./results      Output directory. Default: current working directory
  --json-dir ./json        Directory where every parsed network JSON response is saved. Default: ./json
  --zoom 30                Apply page zoom before extraction. Default: 30
  --extract-on-startup=true Start extraction immediately and do not show the Extract button. Default: false
  --extract-on-starup=true Legacy alias for --extract-on-startup=true
  --debug                  Print extra network/debug progress
  --no-headless            Force headed browser mode. This is the default
  --headless               Run headless, useful only after login is already saved
  --scrolls 8              Number of search-result scroll passes. Default: 8
  --wait-ms 1500           Delay after navigation/scrolls for network capture. Default: 1500
  --ocr                    Optional final fallback using tesseract.js if installed
  --help                   Show this help

Flow:
  By default, the browser opens the selected Spotify search URL and shows an "Extract" button.
  Log in or get ready manually, then click Extract to continue extraction without changing path.
`);
}

function parseArgs(argv) {
  const options = {
    query: '',
    where: 'audiobook',
    market: '',
    limit: 100,
    profile: './spotify-firefox-profile',
    outDir: process.cwd(),
    jsonDir: './json',
    zoomPercent: 30,
    extractOnStartup: false,
    debug: false,
    headless: false,
    scrolls: 8,
    waitMs: 1500,
    ocr: false,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const rawArg = argv[i];
    if (!rawArg.startsWith('--')) {
      positional.push(rawArg);
      continue;
    }

    const equalIndex = rawArg.indexOf('=');
    const arg = equalIndex === -1 ? rawArg : rawArg.slice(0, equalIndex);
    const inlineValue = equalIndex === -1 ? undefined : rawArg.slice(equalIndex + 1);

    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const readValue = (name) => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${name}`);
      }
      i += 1;
      return value;
    };

    switch (arg) {
      case '--query':
        options.query = readValue(arg).trim();
        break;
      case '--where':
        options.where = normalizeWhere(readValue(arg));
        break;
      case '--market':
        options.market = readValue(arg).toUpperCase();
        break;
      case '--limit':
        options.limit = parsePositiveInt(readValue(arg), 'limit');
        break;
      case '--profile':
        options.profile = readValue(arg);
        break;
      case '--out-dir':
        options.outDir = readValue(arg);
        break;
      case '--json-dir':
        options.jsonDir = readValue(arg);
        break;
      case '--zoom':
        options.zoomPercent = parseZoomPercent(readValue(arg));
        break;
      case '--extract-on-starup':
      case '--extract-on-startup':
        options.extractOnStartup = parseBooleanOption(readValue(arg), arg);
        break;
      case '--debug':
        options.debug = true;
        break;
      case '--no-headless':
        options.headless = false;
        break;
      case '--headless':
        options.headless = true;
        break;
      case '--scrolls':
        options.scrolls = parsePositiveInt(readValue(arg), 'scrolls');
        break;
      case '--wait-ms':
        options.waitMs = parsePositiveInt(readValue(arg), 'wait-ms');
        break;
      case '--ocr':
        options.ocr = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.query) {
    options.query = positional.join(' ').trim();
  }
  return options;
}

function parsePositiveInt(raw, name) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

function parseZoomPercent(raw) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 10 || value > 200) {
    throw new Error('--zoom must be an integer between 10 and 200');
  }
  return value;
}

function parseBooleanOption(raw, name) {
  const value = String(raw).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(value)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off'].includes(value)) {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

function normalizeWhere(raw) {
  const compact = String(raw || '')
    .trim()
    .replace(/[_\-\s]+/g, '')
    .replace(/&/g, 'and')
    .toLowerCase();
  const where = WHERE_ALIASES.get(compact);
  if (!where) {
    throw new Error(`Unknown --where value: ${raw}`);
  }
  return where;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (options.help || !options.query) {
    printHelp();
    if (!options.help) {
      process.exitCode = 1;
    }
    return;
  }

  let firefox;
  try {
    ({ firefox } = require('playwright'));
  } catch (error) {
    console.error('Playwright is not installed. Run: npm install && npx playwright install firefox');
    process.exitCode = 1;
    return;
  }

  const profileDir = path.resolve(options.profile);
  const outDir = path.resolve(options.outDir);
  const jsonDir = path.resolve(options.jsonDir);
  const searchUrl = buildSpotifySearchUrl(options.query, options.where, options.market);
  await fsp.mkdir(profileDir, { recursive: true });
  await fsp.mkdir(outDir, { recursive: true });
  await fsp.mkdir(jsonDir, { recursive: true });

  console.log(`Launching Firefox with persistent profile: ${profileDir}`);
  const context = await firefox.launchPersistentContext(profileDir, {
    headless: options.headless,
    viewport: { width: 1365, height: 900 },
    locale: 'en-US',
  });
  const startGate = createManualStartGate();
  await context.addInitScript(installPageZoom, options.zoomPercent);
  if (!options.extractOnStartup) {
    await context.exposeBinding('__spotifyMetadataExtractorStart', () => startGate.trigger());
    await context.addInitScript(installExtractButtonInPage);
  }

  const extractor = new NetworkTitleExtractor({
    query: options.query,
    where: options.where,
    limit: options.limit,
    debug: options.debug,
    jsonDir,
  });

  const pendingResponses = new Set();
  context.on('response', (response) => {
    const task = extractor.handleResponse(response)
      .catch((error) => {
        if (options.debug) {
          console.warn(`Response parse failed: ${response.url()} :: ${error.message}`);
        }
      })
      .finally(() => pendingResponses.delete(task));
    pendingResponses.add(task);
  });

  let page = context.pages()[0];
  if (!page) {
    page = await context.newPage();
  }
  page.setDefaultTimeout(45_000);

  try {
    console.log(`Opening Spotify Web search: ${searchUrl}`);
    await safeGoto(page, searchUrl, { waitUntil: 'domcontentloaded' });
    await applyPageZoom(page, options.zoomPercent);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await applyPageZoom(page, options.zoomPercent);
    if (!options.extractOnStartup) {
      await ensureExtractButtonVisible(page);
    }

    if (!(await hasLikelySpotifyLogin(context))) {
      console.log('\nNo saved Spotify login cookie was found.');
      console.log('A Firefox window is open. Log in to Spotify manually if needed.');
    }
    if (options.extractOnStartup) {
      console.log('Auto extraction is enabled. Starting search immediately.');
    } else {
      console.log('When you are ready, click the "Extract" button at the top center of the browser.');
      await startGate.promise;
      await page.waitForTimeout(500);
    }

    console.log(`\nExtracting from Spotify Web search: ${searchUrl}`);
    await applyPageZoom(page, options.zoomPercent);
    await page.waitForTimeout(options.waitMs);
    await settlePendingResponses(pendingResponses);

    for (let i = 0; i < options.scrolls && extractor.resultCount() < options.limit; i += 1) {
      await page.mouse.wheel(0, 2200);
      await page.waitForTimeout(options.waitMs);
      await settlePendingResponses(pendingResponses);
      if (options.debug) {
        console.log(`Scroll ${i + 1}/${options.scrolls}: ${extractor.resultCount()} deduped candidate(s)`);
      }
    }

    await settlePendingResponses(pendingResponses);

    let results = extractor.results();
    if (results.length === 0) {
      console.log('\nNo title candidates found in network JSON. Trying Accessibility Tree fallback...');
      results = mergeResults(results, await extractFromAccessibilityTree(page, options.query, options.limit));
    }

    if (results.length === 0) {
      console.log('Accessibility fallback found nothing. Trying DOM text fallback...');
      results = mergeResults(results, await extractFromDomText(page, options.query, options.limit));
    }

    if (results.length === 0 && options.ocr) {
      console.log('Text fallbacks found nothing. Trying optional OCR fallback...');
      results = mergeResults(results, await extractWithOptionalOcr(page, options.query, options.limit, outDir));
    }

    results = results.slice(0, options.limit);

    await writeOutputs(outDir, results, extractor.debugMatches());
    printResultsTable(results);
    printCaptureSummary(outDir, extractor, results);
  } finally {
    await extractor.writeJsonManifest().catch((error) => {
      if (options.debug) {
        console.warn(`Could not write JSON manifest: ${error.message}`);
      }
    });
    await context.close();
  }
}

class NetworkTitleExtractor {
  constructor({ query, where, limit, debug, jsonDir }) {
    this.query = query;
    this.where = where;
    this.limit = limit;
    this.debug = debug;
    this.jsonDir = jsonDir;
    this.jsonDumpRunId = createRunId();
    this.jsonDumpCount = 0;
    this.jsonManifest = [];
    this.byKey = new Map();
    this.matches = [];
    this.responsesSeen = 0;
    this.jsonResponses = 0;
    this.matchingResponses = 0;
    this.skippedBinaryResponses = 0;
  }

  async handleResponse(response) {
    this.responsesSeen += 1;
    const sourceUrl = response.url();
    const headers = response.headers();
    const contentType = headers['content-type'] || '';
    const resourceType = response.request().resourceType();

    if (isClearlyNonJsonBody(resourceType, contentType)) {
      this.skippedBinaryResponses += 1;
      return;
    }

    let text;
    try {
      text = await response.text();
    } catch (error) {
      return;
    }

    const json = parseJsonPayload(text);
    if (json === undefined) {
      return;
    }

    this.jsonResponses += 1;
    await this.saveCapturedJson({
      json,
      sourceUrl,
      status: response.status(),
      resourceType,
      contentType,
    });
    const matches = scanJsonForTitles(json, sourceUrl, this.where);
    if (matches.length > 0) {
      this.matchingResponses += 1;
      if (this.debug) {
        console.log(`JSON match: ${matches.length} title candidate(s) from ${sourceUrl}`);
      }
    }

    for (const match of matches) {
      const result = normalizeResult({
        ...match.extracted,
        query: this.query,
        source_response_url: sourceUrl,
        json_path: match.json_path,
        confidence: match.confidence,
      });
      this.addResult(result);
      this.matches.push({
        source_response_url: sourceUrl,
        json_path: match.json_path,
        confidence: match.confidence,
        reasons: match.reasons,
        extracted: result,
        raw_preview: previewJson(match.raw),
      });
    }
  }

  addResult(result) {
    const key = dedupeKey(result);
    if (!key) {
      return;
    }

    const existing = this.byKey.get(key);
    if (!existing) {
      this.byKey.set(key, result);
      return;
    }

    const merged = mergeResult(existing, result);
    this.byKey.set(key, merged);
  }

  resultCount() {
    return this.byKey.size;
  }

  results() {
    return Array.from(this.byKey.values());
  }

  debugMatches() {
    return this.matches;
  }

  async saveCapturedJson({ json, sourceUrl, status, resourceType, contentType }) {
    if (!this.jsonDir) {
      return;
    }

    this.jsonDumpCount += 1;
    const index = String(this.jsonDumpCount).padStart(4, '0');
    const slug = slugify(urlLabel(sourceUrl)) || 'response';
    const filename = `${this.jsonDumpRunId}_${index}_${slug}.json`;
    const filePath = path.join(this.jsonDir, filename);
    await fsp.writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    this.jsonManifest.push({
      index: this.jsonDumpCount,
      file: filename,
      url: sourceUrl,
      status,
      resource_type: resourceType,
      content_type: contentType,
    });
  }

  async writeJsonManifest() {
    if (!this.jsonDir) {
      return;
    }

    const manifestName = `${this.jsonDumpRunId}_manifest.json`;
    const latestName = '_latest_manifest.json';
    const manifest = {
      run_id: this.jsonDumpRunId,
      query: this.query,
      where: this.where,
      captured_at: new Date().toISOString(),
      json_response_count: this.jsonDumpCount,
      files: this.jsonManifest,
    };
    await fsp.writeFile(path.join(this.jsonDir, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await fsp.writeFile(path.join(this.jsonDir, latestName), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
}

function createRunId() {
  return new Date().toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[:.]/g, '')
    .replace(/-/g, '');
}

function urlLabel(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch (error) {
    return url;
  }
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function isClearlyNonJsonBody(resourceType, contentType) {
  const type = contentType.toLowerCase();
  if (type.includes('json') || type.includes('graphql') || type.includes('javascript')) {
    return false;
  }
  if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
    return true;
  }
  return /^(image|audio|video|font)\//i.test(type);
}

function parseJsonPayload(text) {
  if (!text) {
    return undefined;
  }

  let trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith(")]}'")) {
    trimmed = trimmed.slice(4).trim();
  }

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return undefined;
  }
}

function scanJsonForTitles(root, sourceUrl, where) {
  const config = WHERE_CONFIG[where] || WHERE_CONFIG.audiobook;
  const matches = [];
  const seenCandidates = new Set();
  const searchV2 = root?.data?.searchV2;

  if (!searchV2 || typeof searchV2 !== 'object') {
    return matches;
  }

  for (const [sectionKey, sectionValue] of Object.entries(searchV2)) {
    if (!shouldScanSearchSection(sectionKey, config)) {
      continue;
    }
    collectTitleCandidates(
      sectionValue,
      `$.data.searchV2.${sectionKey}`,
      sectionKey,
      config,
      matches,
      seenCandidates,
    );
  }

  return matches;
}

function shouldScanSearchSection(sectionKey, config) {
  if (!sectionKey) {
    return false;
  }
  if (!config.sectionKeys) {
    return true;
  }
  const normalizedSection = normalizeSearchSectionKey(sectionKey);
  return config.sectionKeys.some((key) => normalizeSearchSectionKey(key) === normalizedSection);
}

function normalizeSearchSectionKey(sectionKey) {
  return String(sectionKey || '')
    .replace(/V2$/i, '')
    .replace(/[_\-\s]+/g, '')
    .toLowerCase();
}

function collectTitleCandidates(value, jsonPath, sectionKey, config, matches, seenCandidates) {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      collectTitleCandidates(child, `${jsonPath}[${index}]`, sectionKey, config, matches, seenCandidates);
    });
    return;
  }

  maybeAddTitleCandidate(value, jsonPath, sectionKey, config, matches, seenCandidates);

  for (const [key, child] of Object.entries(value)) {
    collectTitleCandidates(child, appendJsonPath(jsonPath, key), sectionKey, config, matches, seenCandidates);
  }
}

function maybeAddTitleCandidate(obj, jsonPath, sectionKey, config, matches, seenCandidates) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return;
  }
  if (!isLikelySearchResultEntity(obj, jsonPath, sectionKey, config)) {
    return;
  }

  const title = cleanText(obj.name);
  const key = `${title.toLowerCase()}|${jsonPath}`;
  if (!title || seenCandidates.has(key)) {
    return;
  }
  seenCandidates.add(key);

  matches.push({
    json_path: `${jsonPath}.name`,
    confidence: confidenceForTitleCandidate(obj, jsonPath, sectionKey, config),
    reasons: [
      `searchV2 section: ${sectionKey || 'unknown'}`,
      'direct name field',
    ],
    raw: obj,
    extracted: {
      title,
      spotify_uri: obj.uri || obj._uri || '',
      spotify_url: findSpotifyUrl(obj, 3),
    },
  });
}

function isLikelySearchResultEntity(obj, jsonPath, sectionKey, config) {
  const title = cleanText(obj.name);
  if (!title || title.length < 1) {
    return false;
  }
  if (!isDirectSearchResultDataPath(jsonPath)) {
    return false;
  }
  if (isNestedNonResultNamePath(jsonPath)) {
    return false;
  }

  const typename = normalizeTypename(obj.__typename || obj.type || obj.entityType || obj.itemType || obj.kind);
  if (typename && config.typeRegex.test(typename)) {
    return true;
  }

  return Boolean(sectionKey && shouldScanSearchSection(sectionKey, config));
}

function isDirectSearchResultDataPath(jsonPath) {
  return /(?:\.items(?:V2)?\[\d+\](?:\.item)?\.data|\[\d+\]\.data)$/i.test(jsonPath || '');
}

function isNestedNonResultNamePath(jsonPath) {
  return /\.(authorsV2|author|authors|creators|creator|contributors|narrators|publisher|owner|profile|coverArt|visualIdentity|topics|images|icons|avatar|thumbnail|thumbnails)(?:\.|\[|$)/i.test(jsonPath);
}

function normalizeTypename(value) {
  return cleanText(value)
    .replace(/ResponseWrapper$/i, '')
    .replace(/Object$/i, '');
}

function confidenceForTitleCandidate(obj, jsonPath, sectionKey, config) {
  let score = 0.65;
  const typename = normalizeTypename(obj.__typename || obj.type || obj.entityType || obj.itemType || obj.kind);
  if (typename && config.typeRegex.test(typename)) {
    score += 0.2;
  }
  if (/\.data\.searchV2\./.test(jsonPath)) {
    score += 0.05;
  }
  if (sectionKey && shouldScanSearchSection(sectionKey, config)) {
    score += 0.05;
  }
  return Number(Math.min(0.99, score).toFixed(2));
}

function searchSectionFromPath(jsonPath) {
  const match = /^\$\.data\.searchV2\.([A-Za-z0-9_]+)(?:\.|\[|$)/.exec(jsonPath || '');
  return match ? match[1] : '';
}

function evaluateAudiobookCandidate(obj, jsonPath) {
  const typeValues = collectStringsByKeys(obj, TYPE_KEYS, 2);
  const directTypeValues = collectDirectStringsByKeys(obj, TYPE_KEYS);
  const typeText = typeValues.join(' ');
  const spotifyUri = findSpotifyUri(obj, 5);
  const spotifyUrl = findSpotifyUrl(obj, 5);
  const title = pickString(obj, TITLE_KEYS, 3);
  const explicitSubtitle = pickString(obj, SUBTITLE_KEYS, 3);
  const authors = uniqueStrings([
    ...collectPeopleByKeys(obj, AUTHOR_KEYS),
    ...collectPeopleByContributorRole(obj, /author|writer|creator/i),
  ]);
  const narrators = uniqueStrings([
    ...collectPeopleByKeys(obj, NARRATOR_KEYS),
    ...collectPeopleByContributorRole(obj, /narrator|reader|performer|voice/i),
  ]);
  const publisher = pickString(obj, PUBLISHER_KEYS, 4);
  const description = pickString(obj, DESCRIPTION_KEYS, 3);
  const authorsFromDescription = extractLabelFromDescription(description, /author\(s\)|authors?/i);
  const narratorsFromDescription = extractLabelFromDescription(description, /narrator\(s\)|narrators?/i);
  const finalAuthors = uniqueStrings([...authors, ...authorsFromDescription]);
  const finalNarrators = uniqueStrings([...narrators, ...narratorsFromDescription]);
  const subtitle = explicitSubtitle;
  const imageUrl = findImageUrl(obj, 5);
  const hasAudiobookPath = /audiobook/i.test(jsonPath);
  const hasAudiobookKey = Object.keys(obj).some((key) => /audiobook/i.test(key));
  const hasAudiobookType = directTypeValues.some(isAudiobookType)
    || (isAudiobookType(obj?.data?.__typename))
    || (isAudiobookType(obj?.content?.data?.__typename));
  const hasAudiobookUri = /^spotify:audiobook:/i.test(spotifyUri || '');
  const hasAudiobookUrl = /open\.spotify\.com\/audiobook/i.test(spotifyUrl || '');
  const explicitAudiobookEvidence = hasAudiobookType || hasAudiobookUri || hasAudiobookUrl;
  const hasMetadataBundle = Boolean(title && (finalAuthors.length || finalNarrators.length || publisher || subtitle));
  const negativeType = /\b(track|album|artist|playlist|episode|show|podcast)\b/i.test(typeText);

  let score = 0;
  const reasons = [];
  const add = (points, reason) => {
    score += points;
    reasons.push(reason);
  };

  if (hasAudiobookType) add(4, 'type contains audiobook');
  if (hasAudiobookUri) add(5, 'spotify audiobook URI');
  if (hasAudiobookUrl) add(4, 'Spotify audiobook URL');
  if (hasAudiobookPath) add(1.5, 'JSON path contains audiobook');
  if (hasAudiobookKey) add(1, 'object key contains audiobook');
  if (title) add(1, 'title/name field');
  if (subtitle) add(0.5, 'subtitle/byline field');
  if (finalAuthors.length) add(1.5, 'author/creator field');
  if (finalNarrators.length) add(2, 'narrator field');
  if (publisher) add(1, 'publisher field');
  if (description) add(0.5, 'description field');
  if (imageUrl) add(0.5, 'image/artwork field');
  if (negativeType && !explicitAudiobookEvidence && !hasAudiobookPath) score -= 4;

  const looksLikeAudiobook = explicitAudiobookEvidence || ((hasAudiobookPath || hasAudiobookKey) && hasMetadataBundle);
  if (!looksLikeAudiobook || score < 4) {
    return null;
  }

  const confidence = Math.max(0.1, Math.min(0.99, score / 10));
  return {
    json_path: jsonPath,
    confidence: Number(confidence.toFixed(2)),
    reasons,
    raw: obj,
    extracted: {
      title,
      subtitle,
      authors: finalAuthors,
      narrators: finalNarrators,
      publisher,
      description,
      spotify_uri: spotifyUri,
      spotify_url: spotifyUrl || urlFromSpotifyUri(spotifyUri),
      image_url: imageUrl,
    },
  };
}

function appendJsonPath(base, key) {
  if (/^[A-Za-z_$][\w$]*$/.test(key)) {
    return `${base}.${key}`;
  }
  return `${base}[${JSON.stringify(key)}]`;
}

function collectStringsByKeys(obj, keys, maxDepth) {
  const values = collectValuesByKeys(obj, keys, maxDepth);
  return uniqueStrings(values.flatMap((value) => stringsFromAny(value, 2)));
}

function collectDirectStringsByKeys(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return [];
  }

  const keySet = new Set(keys.map(normalizeKey));
  const values = [];
  for (const [key, child] of Object.entries(obj)) {
    if (keySet.has(normalizeKey(key))) {
      values.push(...stringsFromAny(child, 2));
    }
  }
  return uniqueStrings(values);
}

function collectValuesByKeys(value, keys, maxDepth, depth = 0, out = []) {
  if (depth > maxDepth || value === null || typeof value !== 'object') {
    return out;
  }

  const keySet = new Set(keys.map(normalizeKey));
  if (Array.isArray(value)) {
    for (const item of value) {
      collectValuesByKeys(item, keys, maxDepth, depth + 1, out);
    }
    return out;
  }

  for (const [key, child] of Object.entries(value)) {
    if (keySet.has(normalizeKey(key))) {
      out.push(child);
    }
    if (child && typeof child === 'object') {
      collectValuesByKeys(child, keys, maxDepth, depth + 1, out);
    }
  }
  return out;
}

function pickString(obj, keys, maxDepth) {
  const direct = collectDirectStringsByKeys(obj, keys).find(isUsefulText);
  if (direct) {
    return direct;
  }

  for (const value of collectValuesByKeys(obj, keys, maxDepth)) {
    const text = firstStringFromAny(value, 2);
    if (isUsefulText(text)) {
      return text;
    }
  }
  return '';
}

function isAudiobookType(value) {
  return /^audiobook(?:responsewrapper)?$/i.test(cleanText(value || ''));
}

function extractLabelFromDescription(description, labelRegex) {
  const text = cleanText(description);
  if (!text) {
    return [];
  }

  const labels = [
    'Author(s)',
    'Authors',
    'Author',
    'Narrator(s)',
    'Narrators',
    'Narrator',
    'Publisher',
  ];
  const pattern = new RegExp(`(?:^|\\s)(${labels.map(escapeRegExp).join('|')})\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:${labels.map(escapeRegExp).join('|')})\\s*:|\\s+This audiobook\\b|$)`, 'ig');
  const values = [];
  let match = pattern.exec(text);
  while (match) {
    if (labelRegex.test(match[1])) {
      values.push(...splitPeopleList(match[2]));
    }
    match = pattern.exec(text);
  }
  return uniqueStrings(values);
}

function splitPeopleList(text) {
  return uniqueStrings(cleanText(text)
    .split(/\s*;\s*|\s*,\s*(?=[A-ZÀ-ÖØ-Þ])|\s+\band\b\s+/i)
    .map(cleanText)
    .filter(Boolean));
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstStringFromAny(value, maxDepth, depth = 0) {
  if (depth > maxDepth || value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return cleanText(String(value));
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = firstStringFromAny(item, maxDepth, depth + 1);
      if (isUsefulText(text)) {
        return text;
      }
    }
    return '';
  }
  if (typeof value === 'object') {
    for (const key of ['name', 'title', 'text', 'displayName', 'fullName', 'label']) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const text = firstStringFromAny(value[key], maxDepth, depth + 1);
        if (isUsefulText(text)) {
          return text;
        }
      }
    }
    for (const key of ['data', 'item', 'entity', 'content', 'profile']) {
      if (value[key] && typeof value[key] === 'object') {
        const text = firstStringFromAny(value[key], maxDepth, depth + 1);
        if (isUsefulText(text)) {
          return text;
        }
      }
    }
  }
  return '';
}

function stringsFromAny(value, maxDepth, depth = 0) {
  if (depth > maxDepth || value === null || value === undefined) {
    return [];
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const text = cleanText(String(value));
    return isUsefulText(text) ? [text] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => stringsFromAny(item, maxDepth, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.values(value).flatMap((item) => stringsFromAny(item, maxDepth, depth + 1));
  }
  return [];
}

function collectPeopleByKeys(obj, keys) {
  const values = collectValuesByKeys(obj, keys, 4);
  return uniqueStrings(values.flatMap((value) => namesFromAny(value, 3)));
}

function collectPeopleByContributorRole(obj, roleRegex) {
  const containers = collectValuesByKeys(obj, CONTRIBUTOR_KEYS, 5);
  const names = [];

  function visit(value, depth = 0) {
    if (depth > 4 || value === null || value === undefined) {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, depth + 1);
      }
      return;
    }
    if (typeof value !== 'object') {
      return;
    }

    const roleText = stringsFromAny({
      role: value.role,
      roles: value.roles,
      type: value.type,
      category: value.category,
      contributorType: value.contributorType,
    }, 2).join(' ');

    if (roleRegex.test(roleText)) {
      names.push(...namesFromAny(value, 2));
      return;
    }

    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') {
        visit(child, depth + 1);
      }
    }
  }

  for (const container of containers) {
    visit(container);
  }
  return uniqueStrings(names);
}

function namesFromAny(value, maxDepth, depth = 0) {
  if (depth > maxDepth || value === null || value === undefined) {
    return [];
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const text = cleanText(String(value));
    return isUsefulText(text) ? [text] : [];
  }
  if (Array.isArray(value)) {
    return uniqueStrings(value.flatMap((item) => namesFromAny(item, maxDepth, depth + 1)));
  }
  if (typeof value === 'object') {
    for (const key of ['name', 'displayName', 'fullName', 'title', 'text']) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const text = firstStringFromAny(value[key], 2);
        if (isUsefulText(text)) {
          return [text];
        }
      }
    }
    for (const key of ['profile', 'data', 'item', 'artist', 'creator']) {
      if (value[key] && typeof value[key] === 'object') {
        const nested = namesFromAny(value[key], maxDepth, depth + 1);
        if (nested.length) {
          return nested;
        }
      }
    }
  }
  return [];
}

function findSpotifyUri(value, maxDepth) {
  const strings = rawStringsFromAny(value, maxDepth);
  return strings.find((text) => /^spotify:audiobook:/i.test(text)) || '';
}

function findSpotifyUrl(value, maxDepth) {
  const strings = rawStringsFromAny(value, maxDepth);
  return strings.find((text) => /https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?audiobook\//i.test(text)) || '';
}

function rawStringsFromAny(value, maxDepth, depth = 0) {
  if (depth > maxDepth || value === null || value === undefined) {
    return [];
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const text = cleanText(String(value));
    return text ? [text] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => rawStringsFromAny(item, maxDepth, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.values(value).flatMap((item) => rawStringsFromAny(item, maxDepth, depth + 1));
  }
  return [];
}

function findImageUrl(value, maxDepth) {
  const images = [];
  const imageKeyRegex = /^(image|images|imageUrl|image_url|artwork|coverArt|cover|coverUrl|cover_url|thumbnail|thumbnailUrl|thumbnails|sources)$/i;

  function visit(current, depth = 0) {
    if (depth > maxDepth || current === null || current === undefined) {
      return;
    }
    if (typeof current === 'string') {
      const url = cleanText(current);
      if (/^https?:\/\//i.test(url) && /(image|i\.scdn\.co|mosaic|\.jpg|\.jpeg|\.png|\.webp)/i.test(url)) {
        images.push({ url, width: 0, height: 0 });
      }
      return;
    }
    if (Array.isArray(current)) {
      for (const item of current) {
        visit(item, depth + 1);
      }
      return;
    }
    if (typeof current === 'object') {
      if (typeof current.url === 'string') {
        images.push({
          url: current.url,
          width: Number(current.width) || 0,
          height: Number(current.height) || 0,
        });
      }
      for (const [key, child] of Object.entries(current)) {
        if (imageKeyRegex.test(key)) {
          visit(child, depth + 1);
        } else if (child && typeof child === 'object' && depth < 2) {
          visit(child, depth + 1);
        }
      }
    }
  }

  visit(value);
  images.sort((a, b) => (b.width * b.height) - (a.width * a.height));
  return images[0]?.url || '';
}

function urlFromSpotifyUri(uri) {
  const match = /^spotify:audiobook:([^:]+)$/i.exec(uri || '');
  return match ? `https://open.spotify.com/audiobook/${match[1]}` : '';
}

function normalizeKey(key) {
  return String(key).replace(/[_\-\s]/g, '').toLowerCase();
}

function isUsefulText(text) {
  if (!text) {
    return false;
  }
  if (/^https?:\/\//i.test(text)) {
    return false;
  }
  return cleanText(text).length > 0;
}

function cleanText(text) {
  return String(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = cleanText(value);
    if (!text) {
      continue;
    }
    const key = text.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(text);
    }
  }
  return out;
}

function normalizeResult(result) {
  return {
    query: result.query || '',
    title: result.title || '',
    subtitle: result.subtitle || '',
    authors: uniqueStrings(Array.isArray(result.authors) ? result.authors : stringsFromAny(result.authors, 2)),
    narrators: uniqueStrings(Array.isArray(result.narrators) ? result.narrators : stringsFromAny(result.narrators, 2)),
    publisher: result.publisher || '',
    description: result.description || '',
    spotify_uri: result.spotify_uri || '',
    spotify_url: result.spotify_url || '',
    image_url: result.image_url || '',
    source_response_url: result.source_response_url || '',
    json_path: result.json_path || '',
    confidence: Number(result.confidence || 0),
  };
}

function dedupeKey(result) {
  if (result.spotify_uri) {
    return `uri:${result.spotify_uri.toLowerCase()}`;
  }
  if (result.spotify_url) {
    return `url:${result.spotify_url.split('?')[0].toLowerCase()}`;
  }
  const titleKey = normalizeDedupeText(result.title);
  if (!titleKey) {
    return '';
  }
  const subtitleKey = normalizeDedupeText(result.subtitle);
  const authorKey = normalizeDedupeText((result.authors || []).join(' '));
  return `title:${titleKey}|${subtitleKey}|${authorKey}`;
}

function normalizeDedupeText(text) {
  return cleanText(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function mergeResult(existing, incoming) {
  const keepIncomingSource = incoming.confidence > existing.confidence;
  const merged = { ...existing };
  for (const field of RESULT_FIELDS) {
    if (['query', 'confidence', 'source_response_url', 'json_path'].includes(field)) {
      continue;
    }
    if (Array.isArray(existing[field]) || Array.isArray(incoming[field])) {
      merged[field] = uniqueStrings([...(existing[field] || []), ...(incoming[field] || [])]);
    } else if (!merged[field] && incoming[field]) {
      merged[field] = incoming[field];
    }
  }
  merged.confidence = Math.max(existing.confidence, incoming.confidence);
  if (keepIncomingSource) {
    merged.source_response_url = incoming.source_response_url;
    merged.json_path = incoming.json_path;
  }
  return merged;
}

function mergeResults(existing, incoming) {
  const byKey = new Map();
  for (const result of [...existing, ...incoming]) {
    const normalized = normalizeResult(result);
    const key = dedupeKey(normalized);
    if (!key) {
      continue;
    }
    byKey.set(key, byKey.has(key) ? mergeResult(byKey.get(key), normalized) : normalized);
  }
  return Array.from(byKey.values());
}

async function hasLikelySpotifyLogin(context) {
  const cookies = await context.cookies('https://open.spotify.com/');
  return cookies.some((cookie) => ['sp_dc', 'sp_key', 'sp_t'].includes(cookie.name));
}

function buildSpotifySearchUrl(query, where, market) {
  const encodedQuery = encodeURIComponent(query);
  const params = new URLSearchParams();
  if (market) {
    params.set('market', market);
  }
  const config = WHERE_CONFIG[where] || WHERE_CONFIG.audiobook;
  const suffix = config.segment ? `/${config.segment}` : '';
  const queryString = params.toString();
  return `https://open.spotify.com/search/${encodedQuery}${suffix}${queryString ? `?${queryString}` : ''}`;
}

function createManualStartGate() {
  let started = false;
  let resolveStart;
  const promise = new Promise((resolve) => {
    resolveStart = resolve;
  });

  return {
    promise,
    trigger() {
      if (started) {
        return;
      }
      started = true;
      resolveStart();
    },
  };
}

function installExtractButtonInPage() {
  const buttonId = '__spotify-metadata-extractor-button';
  const startedMarker = '__spotifyMetadataExtractorStarted=1';

  function hasStarted() {
    try {
      if (window.sessionStorage && window.sessionStorage.getItem('__spotifyMetadataExtractorStarted') === '1') {
        return true;
      }
    } catch (error) {}
    return typeof window.name === 'string' && window.name.includes(startedMarker);
  }

  function markStarted() {
    try {
      if (window.sessionStorage) {
        window.sessionStorage.setItem('__spotifyMetadataExtractorStarted', '1');
      }
    } catch (error) {}
    if (typeof window.name === 'string' && !window.name.includes(startedMarker)) {
      window.name = `${window.name} ${startedMarker}`.trim();
    }
  }

  function install() {
    if (hasStarted() || !document.documentElement || document.getElementById(buttonId)) {
      return;
    }

    const button = document.createElement('button');
    button.id = buttonId;
    button.type = 'button';
    button.textContent = 'Extract';
    button.title = 'Start Spotify metadata extraction';
    Object.assign(button.style, {
      position: 'fixed',
      top: '14px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      padding: '10px 18px',
      border: '0',
      borderRadius: '999px',
      background: '#1db954',
      color: '#000',
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      fontWeight: '700',
      lineHeight: '1',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
      cursor: 'pointer',
    });
    const pageZoom = Number(window.__spotifyMetadataExtractorZoomPercent) || 100;
    if (pageZoom > 0 && pageZoom !== 100) {
      button.style.zoom = `${10000 / pageZoom}%`;
    }

    button.addEventListener('mouseenter', () => {
      button.style.background = '#1ed760';
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = '#1db954';
    });
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Extracting...';
      button.style.cursor = 'wait';
      try {
        if (typeof window.__spotifyMetadataExtractorStart !== 'function') {
          throw new Error('Extractor bridge is not ready');
        }
        markStarted();
        await window.__spotifyMetadataExtractorStart();
        button.remove();
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Extract';
        button.style.cursor = 'pointer';
        button.title = error && error.message ? error.message : 'Extractor bridge failed';
      }
    });

    document.documentElement.appendChild(button);
  }

  window.__spotifyMetadataExtractorInstallButton = install;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
  window.addEventListener('pageshow', install);
}

function installPageZoom(zoomPercent) {
  const numericZoom = Number(zoomPercent) || 30;
  const zoom = `${numericZoom}%`;
  window.__spotifyMetadataExtractorZoomPercent = numericZoom;

  function applyZoom() {
    if (!document.documentElement) {
      return;
    }
    if (document.body) {
      document.documentElement.style.zoom = '';
      document.body.style.zoom = zoom;
    } else {
      document.documentElement.style.zoom = zoom;
    }
  }

  window.__spotifyMetadataExtractorApplyZoom = applyZoom;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyZoom, { once: true });
  } else {
    applyZoom();
  }
  window.addEventListener('pageshow', applyZoom);
  window.addEventListener('resize', applyZoom);
}

async function applyPageZoom(page, zoomPercent) {
  await page.evaluate((zoom) => {
    const numericZoom = Number(zoom) || 30;
    const zoomValue = `${numericZoom}%`;
    window.__spotifyMetadataExtractorZoomPercent = numericZoom;
    if (document.body) {
      if (document.documentElement) {
        document.documentElement.style.zoom = '';
      }
      document.body.style.zoom = zoomValue;
    } else if (document.documentElement) {
      document.documentElement.style.zoom = zoomValue;
    }
    if (typeof window.__spotifyMetadataExtractorApplyZoom === 'function') {
      window.__spotifyMetadataExtractorApplyZoom();
    }
  }, zoomPercent).catch(() => {});
}

async function ensureExtractButtonVisible(page) {
  await page.evaluate(() => {
    const startedMarker = '__spotifyMetadataExtractorStarted=1';
    try {
      if (window.sessionStorage) {
        window.sessionStorage.removeItem('__spotifyMetadataExtractorStarted');
      }
    } catch (error) {}
    if (typeof window.name === 'string') {
      window.name = window.name.replace(startedMarker, '').trim();
    }
  }).catch(() => {});
  await page.evaluate(installExtractButtonInPage).catch(() => {});
}

async function safeGoto(page, url, options) {
  try {
    return await page.goto(url, options);
  } catch (error) {
    if (/NS_ERROR_ABORT/i.test(error.message || '')) {
      console.warn(`Firefox aborted navigation to ${url}; continuing with the current page.`);
      return null;
    }
    throw error;
  }
}

async function settlePendingResponses(pendingResponses) {
  while (pendingResponses.size > 0) {
    const pending = Array.from(pendingResponses);
    await Promise.allSettled(pending);
    if (pendingResponses.size === pending.length) {
      break;
    }
  }
}

async function extractFromAccessibilityTree(page, query, limit) {
  if (!page.accessibility || typeof page.accessibility.snapshot !== 'function') {
    return [];
  }

  let snapshot;
  try {
    snapshot = await page.accessibility.snapshot({ interestingOnly: false });
  } catch (error) {
    return [];
  }

  const lines = [];
  function walk(node, jsonPath = '$') {
    if (!node) {
      return;
    }
    for (const key of ['name', 'value', 'description']) {
      if (typeof node[key] === 'string' && cleanText(node[key])) {
        lines.push({ text: cleanText(node[key]), path: `${jsonPath}.${key}` });
      }
    }
    if (Array.isArray(node.children)) {
      node.children.forEach((child, index) => walk(child, `${jsonPath}.children[${index}]`));
    }
  }
  walk(snapshot);
  return buildFallbackCandidates(lines, query, 'fallback:accessibility', limit, 0.35);
}

async function extractFromDomText(page, query, limit) {
  const texts = await page.evaluate(() => {
    const bodyText = document.body ? document.body.innerText || '' : '';
    const visibleTextNodes = [];
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && visibleTextNodes.length < 5000) {
      const text = (node.nodeValue || '').trim();
      const parent = node.parentElement;
      if (text && parent) {
        const style = window.getComputedStyle(parent);
        const visible = style.visibility !== 'hidden'
          && style.display !== 'none'
          && Number(style.opacity || '1') > 0
          && parent.getClientRects().length > 0;
        if (visible) {
          visibleTextNodes.push(text);
        }
      }
      node = walker.nextNode();
    }
    return { bodyText, visibleText: visibleTextNodes.join('\n') };
  }).catch(() => ({ bodyText: '', visibleText: '' }));

  const lines = [];
  for (const [sourceName, text] of Object.entries(texts)) {
    text.split(/\r?\n/)
      .map(cleanText)
      .filter(Boolean)
      .forEach((line, index) => lines.push({ text: line, path: `$${sourceName}[${index}]` }));
  }
  return buildFallbackCandidates(lines, query, 'fallback:dom_text', limit, 0.25);
}

async function extractWithOptionalOcr(page, query, limit, outDir) {
  let Tesseract;
  try {
    Tesseract = require('tesseract.js');
  } catch (error) {
    console.warn('OCR fallback requested, but tesseract.js is not installed. Run: npm install tesseract.js');
    return [];
  }

  const screenshotPath = path.join(outDir, 'debug_ocr_screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const ocrResult = await Tesseract.recognize(screenshotPath, 'eng');
  const text = ocrResult?.data?.text || '';
  const lines = text.split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean)
    .map((line, index) => ({ text: line, path: `$ocr[${index}]` }));
  return buildFallbackCandidates(lines, query, 'fallback:ocr', limit, 0.15);
}

function buildFallbackCandidates(rawLines, query, source, limit, confidence) {
  const lines = uniqueLineObjects(rawLines)
    .filter((line) => !isNavigationNoise(line.text));
  const candidates = [];

  for (let i = 0; i < lines.length && candidates.length < limit; i += 1) {
    const line = lines[i].text;
    const parsed = parseAudiobookLine(line);
    if (parsed) {
      candidates.push(normalizeResult({
        query,
        title: parsed.title,
        subtitle: parsed.subtitle,
        authors: parsed.authors,
        source_response_url: source,
        json_path: lines[i].path,
        confidence,
      }));
      continue;
    }

    if (/^audiobook$/i.test(line) || /\baudiobook\b/i.test(line)) {
      const titleLine = findNearbyTitle(lines, i);
      if (!titleLine) {
        continue;
      }
      const subtitleLine = findNearbySubtitle(lines, i, titleLine.text);
      candidates.push(normalizeResult({
        query,
        title: titleLine.text,
        subtitle: subtitleLine?.text || '',
        authors: subtitleLine ? extractAuthorsFromText(subtitleLine.text) : [],
        source_response_url: source,
        json_path: titleLine.path,
        confidence,
      }));
    }
  }

  return mergeResults([], candidates).slice(0, limit);
}

function uniqueLineObjects(lines) {
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    const text = cleanText(line.text);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ text, path: line.path || '$' });
  }
  return out;
}

function parseAudiobookLine(line) {
  const text = cleanText(line);
  if (!/\baudiobook\b/i.test(text)) {
    return null;
  }

  const byMatch = /^(.*?)\s*(?:,|\||-|:|\u2013|\u2014)?\s*audiobook(?:\s+(?:by|from)\s+(.+))?$/i.exec(text);
  if (!byMatch) {
    return null;
  }

  const title = cleanText(byMatch[1]);
  const subtitle = cleanText(byMatch[2] || '');
  if (!title || /^audiobook$/i.test(title) || isNavigationNoise(title)) {
    return null;
  }

  return {
    title,
    subtitle,
    authors: subtitle ? extractAuthorsFromText(subtitle) : [],
  };
}

function findNearbyTitle(lines, index) {
  for (let offset = 1; offset <= 4; offset += 1) {
    const before = lines[index - offset];
    if (before && likelyTitleLine(before.text)) {
      return before;
    }
  }
  for (let offset = 1; offset <= 3; offset += 1) {
    const after = lines[index + offset];
    if (after && likelyTitleLine(after.text)) {
      return after;
    }
  }
  return null;
}

function findNearbySubtitle(lines, index, title) {
  for (let offset = 1; offset <= 4; offset += 1) {
    const line = lines[index + offset];
    if (line && line.text !== title && !/^audiobook$/i.test(line.text) && !isNavigationNoise(line.text)) {
      return line;
    }
  }
  for (let offset = 1; offset <= 3; offset += 1) {
    const line = lines[index - offset];
    if (line && line.text !== title && !/^audiobook$/i.test(line.text) && !isNavigationNoise(line.text)) {
      return line;
    }
  }
  return null;
}

function likelyTitleLine(text) {
  if (!text || isNavigationNoise(text) || /^audiobook$/i.test(text)) {
    return false;
  }
  if (text.length < 2 || text.length > 180) {
    return false;
  }
  return !/^(\d+|play|pause|save|remove)$/i.test(text);
}

function extractAuthorsFromText(text) {
  const cleaned = cleanText(text)
    .replace(/^by\s+/i, '')
    .replace(/\bauthor(?:s)?\b/ig, '')
    .trim();
  if (!cleaned) {
    return [];
  }
  return uniqueStrings(cleaned.split(/\s*;\s*|\s+\band\b\s+/i).map(cleanText).filter(Boolean));
}

function isNavigationNoise(text) {
  return /^(home|search|your library|premium|install app|sign up|log in|settings|profile|play|pause|next|previous|advertisement|preview of spotify)$/i.test(cleanText(text));
}

async function writeOutputs(outDir, results, debugMatches) {
  const csvPath = path.join(outDir, 'spotify_results.csv');
  const jsonPath = path.join(outDir, 'spotify_results.json');
  const debugPath = path.join(outDir, 'debug_network_matches.json');
  const exportedResults = results.map(toExportResult);

  await fsp.writeFile(jsonPath, `${JSON.stringify(exportedResults, null, 2)}\n`, 'utf8');
  await fsp.writeFile(csvPath, toCsv(exportedResults), 'utf8');
  await fsp.writeFile(debugPath, `${JSON.stringify(debugMatches, null, 2)}\n`, 'utf8');
}

function toExportResult(result) {
  return {
    title: result.title || '',
  };
}

function toCsv(results) {
  const rows = [EXPORT_FIELDS.join(',')];
  for (const result of results) {
    rows.push(EXPORT_FIELDS.map((field) => csvEscape(result[field])).join(','));
  }
  return `\uFEFF${rows.join('\n')}\n`;
}

function csvEscape(value) {
  let text = '';
  if (Array.isArray(value)) {
    text = value.join('; ');
  } else if (value !== null && value !== undefined) {
    text = String(value);
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function printResultsTable(results) {
  if (results.length === 0) {
    console.log('\nNo title candidates were found.');
    return;
  }

  const rows = results.slice(0, 50).map((result, index) => ({
    '#': index + 1,
    title: truncate(toExportResult(result).title, 96),
  }));

  console.log('');
  console.table(rows);
  if (results.length > rows.length) {
    console.log(`Showing first ${rows.length} of ${results.length} results.`);
  }
}

function printCaptureSummary(outDir, extractor, results) {
  console.log('\nCapture summary');
  console.log(`- Network responses seen: ${extractor.responsesSeen}`);
  console.log(`- JSON responses parsed: ${extractor.jsonResponses}`);
  console.log(`- Responses with title candidates: ${extractor.matchingResponses}`);
  console.log(`- Deduped exported results: ${results.length}`);
  console.log(`- Raw parsed JSON files: ${extractor.jsonDir}`);
  console.log(`- CSV: ${path.join(outDir, 'spotify_results.csv')}`);
  console.log(`- JSON: ${path.join(outDir, 'spotify_results.json')}`);
  console.log(`- Debug matches: ${path.join(outDir, 'debug_network_matches.json')}`);
}

function truncate(value, length) {
  const text = cleanText(value || '');
  if (text.length <= length) {
    return text;
  }
  return `${text.slice(0, Math.max(0, length - 3))}...`;
}

function previewJson(value) {
  const json = JSON.stringify(value, null, 2);
  if (json.length <= 12_000) {
    return JSON.parse(json);
  }
  return {
    truncated: true,
    preview: json.slice(0, 12_000),
  };
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
