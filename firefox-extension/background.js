// Default server configuration
const DEFAULT_SETTINGS = {
    serverHost: '192.168.2.101',
    serverPort: 8000,
    resizableSidebar: true
};

// Handle extension installation
browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Open settings page on first install
        browser.runtime.openOptionsPage();
    }
});

// Function to get server URL from settings
function getServerUrl() {
    return new Promise((resolve) => {
        browser.storage.local.get('orionSettings', (result) => {
            const settings = result.orionSettings || DEFAULT_SETTINGS;
            const serverUrl = `http://${settings.serverHost}:${settings.serverPort}`;
            resolve(serverUrl);
        });
    });
}

// Listen for fetch-conversation requests from content script
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // console.log('Background script: Received message:', request.type);

    if (request.type === 'get-settings') {
        // console.log('Background script: Getting settings');
        browser.storage.local.get('orionSettings', (result) => {
            const settings = result.orionSettings || DEFAULT_SETTINGS;
            sendResponse({ success: true, settings: settings });
        });
        return true;
    }

    if (request.type === 'get-server-url') {
        // console.log('Background script: Providing server URL');
        getServerUrl().then(serverUrl => {
            sendResponse({ success: true, serverUrl: serverUrl });
        });
        return true; // Async response
    }

    if (request.type === 'fetch-conversation') {
        getServerUrl().then(serverUrl => {
            // console.log('Background script: Attempting to fetch from', serverUrl + '/pc/items');

            // Test if fetch API is available
            if (typeof fetch === 'undefined') {
                // console.error('Background script: fetch is not defined');
                sendResponse({ success: false, error: 'fetch is not defined' });
                return;
            }

            fetch(serverUrl + '/pc/items', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                mode: 'cors',
                credentials: 'omit'
            })
                .then(response => {
                    // console.log('Background script: Fetch response received');
                    // console.log('Background script: Response ok:', response.ok);
                    // console.log('Background script: Response status:', response.status);
                    console.log('Background script: Response headers:', [...response.headers.entries()]);

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    return response.text();
                })
                .then(data => {
                    // console.log('Background script: Fetch successful, data length:', data.length);
                    console.log('Background script: Data preview:', data.substring(0, 200));
                    sendResponse({ success: true, data });
                })
                .catch(error => {
                    // console.error('Background script: Fetch error details:', error);
                    // console.error('Background script: Error message:', error.message);
                    // console.error('Background script: Error stack:', error.stack);
                    sendResponse({ success: false, error: error.toString() });
                });
        });
        // Return true to indicate async response
        return true;
    }

    if (request.type === 'send-message') {
        // console.log('Background script: Sending message');
        getServerUrl().then(serverUrl => {
            fetch(serverUrl + '/pc/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: request.text }),
                mode: 'cors',
                credentials: 'omit'
            })
                .then(response => response.json())
                .then(data => {
                    // console.log('Background script: Message sent successfully:', data);
                    sendResponse({ success: true, data });
                })
                .catch(error => {
                    // console.error('Background script: Message send error:', error);
                    sendResponse({ success: false, error: error.toString() });
                });
        });
        return true;
    }

    if (request.type === 'send-file') {
        // console.log('Background script: Sending file');
        getServerUrl().then(serverUrl => {
            fetch(serverUrl + '/pc/file', {
                method: 'POST',
                body: request.formData,
                mode: 'cors',
                credentials: 'omit'
            })
                .then(response => response.json())
                .then(data => {
                    sendResponse({ success: true, data });
                })
                .catch(error => {
                    // console.error('Background script: File send error:', error);
                    sendResponse({ success: false, error: error.toString() });
                });
        });
        return true;
    }

    if (request.type === 'download-file') {
        // console.log('Background script: Downloading file:', request.displayName);
        getServerUrl().then(serverUrl => {
            const downloadUrl = `${serverUrl}/uploads/${request.uniqueFilename}`;

            // Use browser.downloads API to download the file
            browser.downloads.download({
                url: downloadUrl,
                filename: request.displayName,
                saveAs: false // Don't show save dialog, use default download location
            })
                .then(downloadId => {
                    // console.log('Background script: Download started with ID:', downloadId);
                    sendResponse({ success: true, downloadId: downloadId });
                })
                .catch(error => {
                    // console.error('Background script: Download error:', error);
                    sendResponse({ success: false, error: error.toString() });
                });
        });
        return true;
    }

    if (request.type === 'youtube-video-info') {
        // console.log('Background script: Sending YouTube video info:', request.videoInfo);
        getServerUrl().then(serverUrl => {
            fetch(serverUrl + '/pc/youtube-info', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request.videoInfo),
                mode: 'cors',
                credentials: 'omit'
            })
                .then(response => response.json())
                .then(data => {
                    // console.log('Background script: YouTube info sent successfully:', data);
                    sendResponse({ success: true, data });
                })
                .catch(error => {
                    // console.error('Background script: YouTube info send error:', error);
                    sendResponse({ success: false, error: error.toString() });
                });
        });
        return true;
    }

    if (request.type === 'connect-websocket') {
        // console.log('Background script: WebSocket connection requested from tab:', sender.tab.id);
        connectedTabs.add(sender.tab.id);

        // Start WebSocket connection if not already connected
        if (!websocket) {
            connectWebSocketBackground();
        }

        // Send response immediately for now, but send connection status later
        sendResponse({ success: true });

        // If we already have an active WebSocket, notify the tab immediately
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            browser.tabs.sendMessage(sender.tab.id, {
                type: 'websocket-status',
                connected: true
            }).catch(err => {
                // console.log('Failed to send WebSocket status to tab:', sender.tab.id, err);
            });
        }

        return true;
    }

    if (request.type === 'disconnect-websocket') {
        // console.log('Background script: WebSocket disconnection requested from tab:', sender.tab.id);
        connectedTabs.delete(sender.tab.id);

        // If no tabs are connected, close WebSocket
        if (connectedTabs.size === 0 && websocket) {
            websocket.close();
            websocket = null;
        }

        sendResponse({ success: true });
        return true;
    }
});
browser.browserAction.onClicked.addListener((tab) => {
    browser.tabs.sendMessage(tab.id, 'toggle-sidebar');
});

// WebSocket management
let websocket = null;
let reconnectInterval = null;
const connectedTabs = new Set();

// Function to connect to WebSocket from background script
function connectWebSocketBackground() {
    getServerUrl().then(serverUrl => {
        const wsUrl = serverUrl.replace('http://', 'ws://') + '/pc/ws';
        // console.log('Background: Connecting to WebSocket:', wsUrl);

        try {
            websocket = new WebSocket(wsUrl);

            websocket.onopen = function (event) {
                // console.log('Background: WebSocket connected');
                if (reconnectInterval) {
                    clearInterval(reconnectInterval);
                    reconnectInterval = null;
                }

                // Notify all connected tabs that WebSocket is connected
                for (const tabId of connectedTabs) {
                    browser.tabs.sendMessage(tabId, {
                        type: 'websocket-status',
                        connected: true
                    }).catch(err => {
                        // console.log('Failed to send WebSocket status to tab:', tabId, err);
                        connectedTabs.delete(tabId);
                    });
                }
            };

            websocket.onmessage = function (event) {
                const message = JSON.parse(event.data);
                // console.log('Background: WebSocket message received:', message);

                // Broadcast to all connected tabs
                for (const tabId of connectedTabs) {
                    browser.tabs.sendMessage(tabId, {
                        type: 'websocket-data',
                        data: message
                    }).catch(err => {
                        // console.log('Failed to send to tab:', tabId, err);
                        connectedTabs.delete(tabId);
                    });
                }
            };

            websocket.onclose = function (event) {
                // console.log('Background: WebSocket disconnected, code:', event.code, 'reason:', event.reason);
                websocket = null;

                // Notify all connected tabs that WebSocket is disconnected
                for (const tabId of connectedTabs) {
                    browser.tabs.sendMessage(tabId, {
                        type: 'websocket-status',
                        connected: false,
                        errorMessage: `Connection closed (${event.code}): ${event.reason || 'Unknown reason'}`
                    }).catch(err => {
                        // console.log('Failed to send WebSocket status to tab:', tabId, err);
                        connectedTabs.delete(tabId);
                    });
                }

                // Attempt to reconnect every 3 seconds if we have connected tabs
                if (!reconnectInterval && connectedTabs.size > 0) {
                    reconnectInterval = setInterval(() => {
                        if (connectedTabs.size > 0) {
                            connectWebSocketBackground();
                        } else {
                            clearInterval(reconnectInterval);
                            reconnectInterval = null;
                        }
                    }, 3000);
                }
            };

            websocket.onerror = function (error) {
                // console.error('Background: WebSocket error:', error);
                websocket = null;

                // Notify all connected tabs that WebSocket has an error
                for (const tabId of connectedTabs) {
                    browser.tabs.sendMessage(tabId, {
                        type: 'websocket-status',
                        connected: false,
                        error: true,
                        errorMessage: 'WebSocket connection error'
                    }).catch(err => {
                        // console.log('Failed to send WebSocket error status to tab:', tabId, err);
                        connectedTabs.delete(tabId);
                    });
                }

                // Start reconnection attempts if not already running
                if (!reconnectInterval) {
                    reconnectInterval = setInterval(() => {
                        if (connectedTabs.size > 0) {
                            connectWebSocketBackground();
                        } else {
                            clearInterval(reconnectInterval);
                            reconnectInterval = null;
                        }
                    }, 3000);
                }
            };

        } catch (error) {
            // console.error('Background: Failed to create WebSocket connection:', error);
        }
    });
}
