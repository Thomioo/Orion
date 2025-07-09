# Orion Chrome Extension

This is the Chrome version of the Orion extension, converted from the Firefox extension.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" by toggling the switch in the top right corner
3. Click "Load unpacked" button
4. Select the `chrome-extension` folder from this project
5. The Orion extension should now appear in your extensions list

## Usage

1. Click the Orion extension icon in the toolbarto toggle the sidebar
2. Configure your server settings by clicking the extension icon and selecting "Options" or right-clicking the extension icon and selecting "Options"
3. Set your server host and port in the settings page
4. The extension will connect to your Orion server and display conversations in the sidebar

## Features

- **YouTube Integration**: Automatically detects YouTube videos and tracks viewing progress
- **Real-time Messaging**: Send and receive messages through the sidebar
- **File Sharing**: Attach and download files
- **QR Code**: Scan to connect mobile devices when no messages are present
- **Resizable Sidebar**: Drag the left edge to resize (can be disabled in settings)
- **Cross-platform**: Works on any website

## Key Differences from Firefox Version

- Uses Manifest V3 (Chrome's latest extension standard)
- Uses `chrome` API instead of `browser` API
- Background script runs as a service worker instead of persistent background page
- Updated permissions structure for better security

## Configuration

The extension settings include:
- **Server Host**: IP address or hostname of your Orion server
- **Server Port**: Port number your Orion server is running on
- **Resizable Sidebar**: Toggle to enable/disable sidebar resizing

## Keyboard Shortcut

- `Ctrl+Shift+Y`: Toggle the Orion sidebar

## Troubleshooting

1. **Extension not loading**: Make sure you've enabled Developer mode in Chrome extensions
2. **Can't connect to server**: Verify your server host/port settings and ensure your Orion server is running
3. **Keyboard shortcut not working**: Check if another extension is using the same shortcut

## Development

The extension consists of:
- `manifest.json`: Extension configuration
- `background.js`: Service worker handling API requests
- `content.js`: Script injected into web pages
- `settings.html/js`: Configuration interface
- `sidebar.html`: Sidebar interface
- `imgs/`: Extension icons and assets
