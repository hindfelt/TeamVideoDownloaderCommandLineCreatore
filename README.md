# Teams Recording Downloader

A Chrome (Manifest V3) extension that downloads your Microsoft Teams / SharePoint
Stream meeting recordings **entirely in the browser** — including the AES-128
encryption Microsoft now applies to the media segments. No command line required
for the common case; an ffmpeg/yt-dlp fallback and a standalone Python script are
included for the cases where it isn't enough.

## What it does

Modern Teams/Stream recordings are served as MPEG-DASH with **DASH-SEA
(`urn:mpeg:dash:sea`) AES-128-CBC "clear-key" encryption**. The AES key is
fetched over HTTP and the media CDN (`*.svc.ms`) is authorized with a short-lived
`x-spopactoken` bearer header that the OnePlayer's service worker sends — a header
the extension `webRequest` API can't see. ffmpeg and yt-dlp can't decrypt this
scheme on their own.

This extension handles the whole pipeline:

1. **Intercept** — a page-world script hooks `window.fetch` to capture the DASH
   `videomanifest` URL and the `x-spopactoken` as the player requests them.
2. **Download** — the content script parses the DASH manifest, then downloads the
   audio and video segments in parallel (with retry/back-off for SharePoint's
   throttling).
3. **Decrypt** — encrypted segments are decrypted in-browser with the Web Crypto
   API (AES-128-CBC), using the key fetched from the manifest's key endpoint.
4. **Mux** — a Web Worker remuxes the fragmented audio + video into a single flat
   (non-fragmented) MP4 that seeks correctly in VLC/QuickTime, off the UI thread.
5. **Save** — the finished `.mp4` is dropped straight into your Downloads.

When a recording is detected, a floating **⬇ Download recording** button appears
in the bottom-right of the page with live progress.

### Fallbacks

The toolbar popup also offers two clipboard helpers for when you'd rather use a
terminal:

- **Copy ffmpeg Command** — builds an `ffmpeg` command with the captured
  auth headers (cookies/authorization) baked in.
- **Copy yt-dlp Command** — builds a `yt-dlp --cookies-from-browser chrome`
  command for the recording page.

`destream.py` is a standalone Python downloader/decryptor for fully manual use
(see the header of that file for usage).

## Limitations

- **Hard DRM is not supported.** Recordings protected with Widevine, PlayReady,
  or FairPlay cannot be decrypted client-side and are detected and skipped.
- Auth tokens are short-lived. If a download fails with 401/expired, refresh the
  recording page, play it for a few seconds, and try again.

## Installation

### From source (developer mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/hindfelt/TeamVideoDownloaderCommandLineCreatore.git
   ```
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select the project directory.

### From the Chrome Web Store

Install the published listing, then pin it from the extensions menu.

## Usage

1. Open a Teams/SharePoint Stream recording and **play it for a few seconds** so
   the player requests the manifest.
2. Click the **⬇ Download recording** button that appears bottom-right (or use the
   toolbar popup's copy buttons as a fallback).
3. Watch the progress; the `.mp4` lands in your Downloads when muxing finishes.

## File structure

```
├── manifest.json     # MV3 extension config
├── intercept.js      # page (MAIN) world: hooks fetch, captures manifest + token
├── content.js        # isolated world: DASH parse, download, decrypt, orchestrate
├── mux-worker.js     # Web Worker: fMP4 → flat MP4 remuxer
├── background.js     # service worker: captures manifest URL + auth headers/cookies
├── popup.html        # toolbar popup UI
├── popup.js          # ffmpeg / yt-dlp command builders
├── destream.py       # standalone Python downloader/decryptor (manual fallback)
└── icons/            # team_lit.png / team_unlit.png
```

## Permissions

- `storage` — extension state.
- Host access to `*.sharepoint.com`, `*.svc.ms`, `teams.microsoft.com`, and
  `teams.cloud.microsoft` — to read the recording pages and fetch the media
  segments and decryption key.

## Credits

The download/decrypt/mux pipeline is adapted from
[brendangooden/ms-teams-sharepoint-downloader](https://github.com/brendangooden/ms-teams-sharepoint-downloader)
(MIT License, © 2025 Brendan Gooden).

## Disclaimer

This tool is for downloading recordings **you are authorized to access**. Make
sure you have permission before downloading any content.
