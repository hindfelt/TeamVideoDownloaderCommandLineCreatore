# Teams Recording Downloader Chrome Extension

A Chrome extension that helps you download Microsoft Teams meeting recordings by extracting the video manifest URL and generating the appropriate ffmpeg command.
Ofc you must have FFMPEG to then run the command.

## Features

- Automatically detects Teams meeting recording pages
- Extracts video manifest URLs from Teams recordings
- Generates ready-to-use ffmpeg commands
- Copies commands to clipboard with one click
- Provides visual feedback when a manifest URL is detected

## Prerequisites

- Google Chrome browser
- ffmpeg installed on your system (for actual video downloading)

## Installation

### Development Installation
1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/teams-recording-downloader.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the extension directory

### Manual Installation
1. Download the latest release from the releases page
2. Follow steps 2-4 from the Development Installation section

## Usage

1. Navigate to a Teams meeting recording in your browser

2. When the extension icon becomes active (lit up), click it

3. Click the "Copy ffmpeg Command" button in the popup

4. Open your terminal/command prompt

5. Paste and run the copied ffmpeg command to download the recording

## File Structure

```
└── extension/
    ├── manifest.json         # Extension configuration
    ├── popup.html           # Popup interface
    ├── popup.js            # Popup functionality
    ├── content.js          # Content script for URL detection
    ├── background.js       # Background service worker
    └── icons/              # Extension icons
        ├── teams_lit.png
        └── teams_unlit.png
```

## Technical Details

The extension works by:
1. Monitoring network requests for video manifest URLs
2. Using the Performance API to track resource loading
3. Generating ffmpeg commands with proper formatting
4. Managing clipboard operations for easy command copying

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Disclaimer

This tool is meant for personal use to download your own Teams meeting recordings. Please ensure you have the necessary permissions before downloading any content.
