// Prevent multiple executions of content script
if (window.orionContentScriptLoaded) {
    console.log('Content script already loaded, skipping');
} else {
    window.orionContentScriptLoaded = true;
    console.log('Orion content script loaded');

    // Check if current page is a YouTube video and start monitoring
    checkYouTubeVideo();
}

// YouTube video detection and time tracking
function checkYouTubeVideo() {
    const currentUrl = window.location.href;
    console.log('Current URL:', currentUrl);

    // Check if URL is a YouTube video
    if (isYouTubeVideoUrl(currentUrl)) {
        console.log('YouTube video detected!');
        startYouTubeTimeTracking();
    } else {
        console.log('Not a YouTube video URL');
    }
}

function isYouTubeVideoUrl(url) {
    // Match various YouTube video URL formats:
    // https://www.youtube.com/watch?v=VIDEO_ID
    // https://youtu.be/VIDEO_ID
    // https://m.youtube.com/watch?v=VIDEO_ID
    const youtubeVideoRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/;
    return youtubeVideoRegex.test(url);
}

function startYouTubeTimeTracking() {
    console.log('Starting YouTube time tracking...');

    // Wait for video element to load
    const checkForVideo = setInterval(() => {
        const videoElement = document.querySelector('video');

        if (videoElement) {
            console.log('YouTube video element found');
            clearInterval(checkForVideo);

            // Log initial time
            logVideoTime(videoElement);

            // Set up periodic time logging (every 1 second for real-time updates)
            const timeLogger = setInterval(() => {
                if (document.querySelector('video') === videoElement && !videoElement.paused) {
                    logVideoTime(videoElement);
                }
            }, 1000);

            // Log time when video is paused/played
            videoElement.addEventListener('pause', () => {
                console.log('Video paused');
                logVideoTime(videoElement);
            });

            videoElement.addEventListener('play', () => {
                console.log('Video resumed');
                logVideoTime(videoElement);
            });

            // Clean up interval if user navigates away
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;

            history.pushState = function () {
                originalPushState.apply(history, arguments);
                setTimeout(() => {
                    if (!isYouTubeVideoUrl(window.location.href)) {
                        clearInterval(timeLogger);
                    }
                }, 100);
            };

            history.replaceState = function () {
                originalReplaceState.apply(history, arguments);
                setTimeout(() => {
                    if (!isYouTubeVideoUrl(window.location.href)) {
                        clearInterval(timeLogger);
                    }
                }, 100);
            };

            window.addEventListener('popstate', () => {
                setTimeout(() => {
                    if (!isYouTubeVideoUrl(window.location.href)) {
                        clearInterval(timeLogger);
                    }
                }, 100);
            });
        }
    }, 500); // Check every 500ms for video element

    // Stop checking after 10 seconds if no video found
    setTimeout(() => {
        clearInterval(checkForVideo);
    }, 10000);
}

function logVideoTime(videoElement) {
    if (!videoElement) return;

    const currentTime = videoElement.currentTime;
    const duration = videoElement.duration;
    const timeElapsed = formatTime(currentTime);
    const totalDuration = formatTime(duration);
    const percentComplete = duration > 0 ? ((currentTime / duration) * 100).toFixed(1) : 0;

    // Create a properly formatted YouTube timestamp link
    const timeInSeconds = Math.floor(currentTime);
    const timestampLink = createYouTubeTimestampLink(window.location.href, timeInSeconds);

    console.log(`YouTube Video Link: ${timestampLink}`);
    console.log(`YouTube Video Time - Elapsed: ${timeElapsed} / ${totalDuration} (${percentComplete}%)`);

    // Send YouTube video info to server for mobile notification
    sendYouTubeVideoInfo(videoElement, timestampLink);
}

function sendYouTubeVideoInfo(videoElement, timestampLink) {
    const videoId = extractYouTubeVideoId(window.location.href);
    if (!videoId) return;

    // Get video title from page
    const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer') ||
        document.querySelector('h1.title') ||
        document.querySelector('title');

    const title = videoTitle ? videoTitle.textContent.trim() : 'YouTube Video';

    const videoInfo = {
        videoId: videoId,
        title: title,
        currentTime: Math.floor(videoElement.currentTime),
        duration: Math.floor(videoElement.duration),
        timestampLink: timestampLink,
        isPlaying: !videoElement.paused,
        url: window.location.href
    };

    console.log('Sending YouTube video info:', videoInfo);

    // Send to background script to forward to server
    browser.runtime.sendMessage({
        type: 'youtube-video-info',
        videoInfo: videoInfo
    }).then(response => {
        console.log('YouTube video info sent successfully:', response);
    }).catch(err => {
        console.error('Error sending YouTube video info:', err);
    });
}

function createYouTubeTimestampLink(currentUrl, timeInSeconds) {
    try {
        // Extract video ID from various YouTube URL formats
        const videoId = extractYouTubeVideoId(currentUrl);

        if (videoId) {
            return `https://youtu.be/${videoId}?t=${timeInSeconds}`;
        } else {
            console.error('Could not extract video ID from URL:', currentUrl);
            return currentUrl;
        }
    } catch (error) {
        console.error('Error creating timestamp link:', error);
        return currentUrl;
    }
}

function extractYouTubeVideoId(url) {
    // Match various YouTube URL formats and extract the video ID:
    // https://www.youtube.com/watch?v=VIDEO_ID
    // https://youtu.be/VIDEO_ID
    // https://m.youtube.com/watch?v=VIDEO_ID
    // https://youtube.com/watch?v=VIDEO_ID
    const patterns = [
        // Standard youtube.com watch URLs (most common)
        /[?&]v=([a-zA-Z0-9_-]{11})(?:[&#]|$)/,
        // youtu.be short URLs
        /youtu\.be\/([a-zA-Z0-9_-]{11})(?:[?&#]|$)/,
        // Embed URLs
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:[?&#]|$)/,
        // Direct video URLs
        /youtube\.com\/v\/([a-zA-Z0-9_-]{11})(?:[?&#]|$)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            console.log(`Extracted video ID: ${match[1]} from URL: ${url}`);
            return match[1];
        }
    }

    console.error(`Could not extract video ID from URL: ${url}`);
    return null;
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

// Listen for toggle-sidebar message from background.js
browser.runtime.onMessage.addListener((msg) => {
    if (msg === 'toggle-sidebar') {
        let sidebar = document.getElementById('sleek-sidebar');
        if (!sidebar) {
            sidebar = document.createElement('div');
            sidebar.id = 'sleek-sidebar';
            fetch(browser.runtime.getURL('sidebar.html'))
                .then(response => response.text())
                .then(html => {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const bodyContent = doc.body.innerHTML;

                    // Add resize handle (will be conditionally enabled later)
                    sidebar.innerHTML = `
                        <div id="sleek-sidebar-resize-handle" style="display: none;"></div>
                        ${bodyContent}
                    `;
                    const styleTag = doc.querySelector('style');
                    if (styleTag) {
                        // More comprehensive CSS scoping to prevent conflicts
                        let scopedStyle = styleTag.textContent;

                        // Replace all selectors to be scoped to #sleek-sidebar
                        scopedStyle = scopedStyle
                            .replace(/\bbody\b/g, '#sleek-sidebar')
                            .replace(/\.hello\b/g, '#sleek-sidebar .hello')
                            .replace(/#conversation\b/g, '#sleek-sidebar #conversation')
                            .replace(/#qrContainer\b/g, '#sleek-sidebar #qrContainer')
                            .replace(/#qrContainer\.hidden\b/g, '#sleek-sidebar #qrContainer.hidden')
                            .replace(/#qrCode\b/g, '#sleek-sidebar #qrCode')
                            .replace(/#qrText\b/g, '#sleek-sidebar #qrText')
                            .replace(/#qrUrl\b/g, '#sleek-sidebar #qrUrl')
                            .replace(/\.inputDiv\b/g, '#sleek-sidebar .inputDiv')
                            .replace(/\.input-container\b/g, '#sleek-sidebar .input-container')
                            .replace(/#inputField\b/g, '#sleek-sidebar #inputField')
                            .replace(/#inputField:focus\b/g, '#sleek-sidebar #inputField:focus')
                            .replace(/#inputField::placeholder\b/g, '#sleek-sidebar #inputField::placeholder')
                            .replace(/#attachFileButton\b/g, '#sleek-sidebar #attachFileButton')
                            .replace(/#attachFileButton img\b/g, '#sleek-sidebar #attachFileButton img')
                            .replace(/#attachFileButton:hover\b/g, '#sleek-sidebar #attachFileButton:hover')
                            .replace(/#attachFileButton:active\b/g, '#sleek-sidebar #attachFileButton:active');

                        // Add !important to all CSS properties to override host styles
                        scopedStyle = scopedStyle.replace(/;/g, ' !important;');

                        const style = document.createElement('style');
                        style.textContent = `
                            #sleek-sidebar {
                                position: fixed !important;
                                top: 1vh !important;
                                height: calc(98vh) !important;
                                z-index: 2147483647 !important;
                                transition: right 0.3s cubic-bezier(.4,0,.2,1) !important;
                                box-shadow: -2px 0 8px rgba(0,0,0,0.2) !important;
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                                isolation: isolate !important;
                                /* Reset inherited styles without breaking our layout */
                                margin: 0 !important;
                                padding: 0 !important;
                                border: none !important;
                                background: none !important;
                                text-decoration: none !important;
                                text-transform: none !important;
                                letter-spacing: normal !important;
                                word-spacing: normal !important;
                                line-height: normal !important;
                                text-shadow: none !important;
                                box-shadow: -2px 0 8px rgba(0,0,0,0.2) !important;
                            }
                            #sleek-sidebar-resize-handle {
                                position: absolute !important;
                                left: 0 !important;
                                top: 0 !important;
                                width: 5px !important;
                                height: 100% !important;
                                cursor: ew-resize !important;
                                background: transparent !important;
                                z-index: 10 !important;
                            }
                            #sleek-sidebar-resize-handle:hover {
                                background: transparent !important;
                            }
                            #sleek-sidebar.resizing {
                                transition: none !important;
                            }
                            #sleek-sidebar * {
                                box-sizing: border-box !important;
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                                font-size: inherit !important;
                                line-height: normal !important;
                                font-weight: normal !important;
                                font-style: normal !important;
                                text-transform: none !important;
                                letter-spacing: normal !important;
                                word-spacing: normal !important;
                            }
                            /* Force paperclip image to correct size with maximum specificity */
                            #sleek-sidebar #attachFileButton img,
                            #sleek-sidebar #attachFileButton img[src],
                            #sleek-sidebar div #attachFileButton img,
                            #sleek-sidebar .input-container #attachFileButton img {
                                height: 24px !important;
                                width: 24px !important;
                                max-height: 24px !important;
                                max-width: 24px !important;
                                min-height: 24px !important;
                                min-width: 24px !important;
                                object-fit: contain !important;
                                display: block !important;
                                border: none !important;
                                margin: 0 !important;
                                padding: 0 !important;
                                transform: none !important;
                                scale: 1 !important;
                                zoom: 1 !important;
                                flex: none !important;
                                position: static !important;
                            }
                            /* Consistent font sizing for all sidebar elements */
                            #sleek-sidebar {
                                font-size: 14px !important;
                            }
                            #sleek-sidebar .hello {
                                font-size: 2em !important;
                            }
                            #sleek-sidebar #inputField {
                                font-size: 1em !important;
                            }
                            #sleek-sidebar #conversation {
                                font-size: 1em !important;
                            }
                            #sleek-sidebar #conversation * {
                                font-size: inherit !important;
                            }
                            /* Prevent scroll propagation to background page */
                            #sleek-sidebar {
                                overflow: hidden !important;
                            }
                            #sleek-sidebar #conversation {
                                overflow-y: auto !important;
                                overscroll-behavior: contain !important;
                                /* Hide scrollbar */
                                scrollbar-width: none !important; /* Firefox */
                                -ms-overflow-style: none !important; /* IE and Edge */
                            }
                            /* Hide scrollbar for WebKit browsers (Chrome, Safari, etc.) */
                            #sleek-sidebar #conversation::-webkit-scrollbar {
                                display: none !important;
                                width: 0 !important;
                                height: 0 !important;
                            }
                            ${scopedStyle}
                        `;
                        document.head.appendChild(style);
                    }
                    document.body.appendChild(sidebar);

                    // Set initial dimensions - check for saved width first
                    const savedWidth = localStorage.getItem('orion-sidebar-width');
                    let initialWidth;
                    if (savedWidth) {
                        // Use saved width but still apply constraints
                        const parsedWidth = parseInt(savedWidth, 10);
                        initialWidth = Math.max(300, Math.min(parsedWidth, window.innerWidth * 0.6));
                    } else {
                        // Default to 26% of viewport width
                        initialWidth = Math.max(300, Math.min(window.innerWidth * 0.26, window.innerWidth * 0.6));
                    }
                    sidebar.style.setProperty('width', initialWidth + 'px', 'important');

                    // Set up sidebar functionality directly here
                    setupSidebarFunctionality();

                    // Prevent scroll propagation when hovering over sidebar
                    setupScrollPrevention();

                    // Set initial closed position based on width
                    const sidebarWidth = sidebar.offsetWidth;
                    sidebar.style.setProperty('right', `-${sidebarWidth + 10}px`, 'important');

                    // Slide in
                    setTimeout(() => {
                        sidebar.classList.add('open');
                        sidebar.style.setProperty('right', '1vh', 'important');
                    }, 10);
                });
        } else {
            // If open, hide and remove from DOM; if closed, show
            if (sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                const sidebarWidth = sidebar.offsetWidth;
                sidebar.style.setProperty('right', `-${sidebarWidth + 10}px`, 'important');
                setTimeout(() => {
                    if (sidebar.parentNode) sidebar.parentNode.removeChild(sidebar);
                }, 300); // match transition duration
            } else {
                sidebar.classList.add('open');
                sidebar.style.setProperty('right', '1vh', 'important');
            }
        }
    }
});

// Sidebar functionality
function setupSidebarFunctionality() {
    console.log('Setting up sidebar functionality');

    // Load conversation data
    loadConversation();

    // Set up icons
    setupIcons();

    // Set up attach button functionality
    setupAttachButton();

    // Set up QR code functionality
    setupQRCode();

    // Check settings to see if resize functionality should be enabled
    browser.runtime.sendMessage({ type: 'get-settings' })
        .then(response => {
            if (response.success && response.settings.resizableSidebar) {
                console.log('Resizable sidebar enabled in settings');
                setupSidebarResize();
            } else {
                console.log('Resizable sidebar disabled in settings');
            }
        })
        .catch(err => {
            console.error('Error getting settings, defaulting to resizable enabled:', err);
            // Default to enabled if we can't get settings
            setupSidebarResize();
        });
}

function setupScrollPrevention() {
    const sidebar = document.getElementById('sleek-sidebar');
    const conversation = document.getElementById('conversation');

    if (!sidebar || !conversation) {
        console.error('Sidebar or conversation element not found for scroll prevention');
        return;
    }

    // Prevent wheel events from propagating to the background page when over sidebar
    sidebar.addEventListener('wheel', function (e) {
        e.stopPropagation();

        // If the wheel event is over the conversation area, handle it there
        const conversationRect = conversation.getBoundingClientRect();
        const isOverConversation = e.clientX >= conversationRect.left &&
            e.clientX <= conversationRect.right &&
            e.clientY >= conversationRect.top &&
            e.clientY <= conversationRect.bottom;

        if (isOverConversation) {
            // Let the conversation handle its own scrolling
            const scrollTop = conversation.scrollTop;
            const scrollHeight = conversation.scrollHeight;
            const clientHeight = conversation.clientHeight;

            // Prevent default if we're at scroll boundaries to avoid page scroll
            if ((e.deltaY > 0 && scrollTop + clientHeight >= scrollHeight) ||
                (e.deltaY < 0 && scrollTop <= 0)) {
                e.preventDefault();
            }
        } else {
            // Over other parts of sidebar, prevent scrolling entirely
            e.preventDefault();
        }
    }, { passive: false });

    // Also prevent touch scroll propagation on mobile
    sidebar.addEventListener('touchmove', function (e) {
        e.stopPropagation();
    }, { passive: false });
}

// WebSocket functionality for real-time updates
let websocket = null;
let reconnectInterval = null;

function connectWebSocket() {
    // Get server URL from background script
    browser.runtime.sendMessage({ type: 'get-server-url' })
        .then(response => {
            if (response.success) {
                const wsUrl = response.serverUrl.replace('http://', 'ws://') + '/pc/ws';
                console.log('Connecting to WebSocket:', wsUrl);

                try {
                    websocket = new WebSocket(wsUrl);

                    websocket.onopen = function (event) {
                        console.log('WebSocket connected');
                        if (reconnectInterval) {
                            clearInterval(reconnectInterval);
                            reconnectInterval = null;
                        }
                    };

                    websocket.onmessage = function (event) {
                        const message = JSON.parse(event.data);
                        console.log('WebSocket message received:', message);

                        if (message.type === 'initial' || message.type === 'update') {
                            displayConversationData(message.data);
                        }
                    };

                    websocket.onclose = function (event) {
                        console.log('WebSocket disconnected, attempting to reconnect...');
                        websocket = null;

                        // Attempt to reconnect every 3 seconds
                        if (!reconnectInterval) {
                            reconnectInterval = setInterval(() => {
                                connectWebSocket();
                            }, 3000);
                        }
                    };

                    websocket.onerror = function (error) {
                        console.error('WebSocket error:', error);
                        // Fallback to HTTP
                        loadConversationHTTP();
                    };
                } catch (error) {
                    console.error('Failed to create WebSocket connection:', error);
                    // Fallback to HTTP
                    loadConversationHTTP();
                }
            } else {
                console.error('Failed to get server URL');
                loadConversationHTTP();
            }
        })
        .catch(err => {
            console.error('Error getting server URL:', err);
            loadConversationHTTP();
        });
}

function loadConversation() {
    // Try WebSocket first, fallback to HTTP
    connectWebSocket();
}

function loadConversationHTTP() {
    browser.runtime.sendMessage({ type: 'fetch-conversation' })
        .then(response => {
            if (response.success) {
                try {
                    const data = JSON.parse(response.data);
                    console.log('Loaded flow data via HTTP:', data);
                    displayConversationData(data);
                } catch (e) {
                    console.error('Error parsing flow data:', e);
                }
            } else {
                console.error('Error fetching conversation:', response.error);
            }
        })
        .catch(err => {
            console.error('Error communicating with background script:', err);
        });
}

function displayConversationData(data) {
    const conversationDiv = document.getElementById('conversation');
    if (!conversationDiv) {
        console.error('Conversation div not found');
        return;
    }

    // Clear existing content
    conversationDiv.innerHTML = '';

    // Process items if they exist
    if (data.items && data.items.length > 0) {
        data.items.forEach(item => {
            console.log(`Item from ${item.from}: ${item.content} (${item.type})`);

            // Create message element
            const messageDiv = document.createElement('div');
            messageDiv.style.cssText = `
                margin: 10px;
                padding: 8px 12px;
                border-radius: 12px;
                max-width: 70%;
                word-wrap: break-word;
                ${item.from === 'PC' ?
                    'background: #2B5A87; margin-left: auto; text-align: right;' :
                    'background: #333; margin-right: auto; text-align: left;'
                }   
            `;

            // Add content based on type
            if (item.type === 'text') {
                // Check if content contains URLs and make them clickable
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                if (urlRegex.test(item.content)) {
                    // Content has URLs, replace with clickable links
                    const htmlContent = item.content.replace(urlRegex, '<a href="$1" target="_blank" style="color: #4A9EFF; text-decoration: underline;">$1</a>');
                    messageDiv.innerHTML = htmlContent;
                } else {
                    // No URLs, just set as text
                    messageDiv.textContent = item.content;
                }
            } else if (item.type === 'file') {
                // Parse filename and unique filename from content
                const parts = item.content.split('|');
                const displayName = parts[0];
                const uniqueFilename = parts[1] || parts[0]; // fallback for old format

                // Make file message clickable for download
                const fileSpan = document.createElement('span');
                fileSpan.style.cssText = 'color: #4A9EFF; text-decoration: underline; cursor: pointer;';
                fileSpan.textContent = displayName;
                fileSpan.addEventListener('click', function () {
                    downloadFile(uniqueFilename, displayName);
                });

                // messageDiv.innerHTML = '📎 ';
                messageDiv.appendChild(fileSpan);
            }

            // Add timestamp
            const timeDiv = document.createElement('div');
            timeDiv.style.cssText = `
                font-size: 0.7em;
                color: #aaa;
                margin-top: 4px;
            `;
            const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            timeDiv.textContent = `${item.from} • ${time}`;
            messageDiv.appendChild(timeDiv);

            conversationDiv.appendChild(messageDiv);
        });

        // Scroll to bottom
        conversationDiv.scrollTop = conversationDiv.scrollHeight;
    } else {
        conversationDiv.innerHTML = '<div style="color: #aaa; padding: 20px; text-align: center;">No messages yet</div>';
    }

    // Update QR code visibility based on conversation content
    checkMessagesAndToggleQR();
}

function setupIcons() {
    // Check if browser.runtime is available
    if (typeof browser !== 'undefined' && browser.runtime) {
        // Set up header icon
        const orionIcon = document.getElementById('orionIcon');
        if (orionIcon) {
            const headerIconUrl = browser.runtime.getURL('imgs/icon_shiny.png');
            console.log('Setting header icon URL:', headerIconUrl);
            orionIcon.src = headerIconUrl;

            orionIcon.onerror = function () {
                console.log('Header icon failed to load');
            };

            orionIcon.onload = function () {
                console.log('Header icon loaded successfully');
            };
        } else {
            console.error('orionIcon element not found');
        }

        // Set up attachment icon
        const attachIcon = document.getElementById('attachIcon');
        if (attachIcon) {
            const iconUrl = browser.runtime.getURL('imgs/attachment.png');
            console.log('Setting attachment icon URL:', iconUrl);
            attachIcon.src = iconUrl;

            // Add error handling for image load
            attachIcon.onerror = function () {
                console.log('Attachment image failed to load, falling back to emoji');
            };

            attachIcon.onload = function () {
                console.log('Attachment image loaded successfully');
            };
        } else {
            console.error('attachIcon element not found');
        }
    } else {
        console.error('browser.runtime not available');
    }
}

function setupAttachButton() {
    const attachButton = document.getElementById('attachFileButton');
    const fileInput = document.getElementById('fileInput');
    const inputField = document.getElementById('inputField');

    // Set up attach button functionality
    if (attachButton && fileInput) {
        attachButton.addEventListener('click', function () {
            fileInput.click();
        });

        fileInput.addEventListener('change', function () {
            if (this.files.length > 0) {
                console.log('File selected:', this.files[0].name);
                sendFile(this.files[0]);
            }
        });
    } else {
        console.error('Attach button or file input not found');
    }

    // Set up input field functionality
    if (inputField) {
        inputField.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    } else {
        console.error('Input field not found');
    }
}

// QR Code functionality
function generateQRCode(text, elementId) {
    // Use QR Server API for larger QR code
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(text)}`;
    const img = document.createElement('img');
    img.src = qrUrl;
    img.alt = 'QR Code';
    img.style.cssText = 'width: 180px !important; height: 180px !important; max-width: 180px !important; max-height: 180px !important; display: block !important;';

    const container = document.getElementById(elementId);
    if (container) {
        container.innerHTML = '';
        container.appendChild(img);
    }
}

function setupQRCode() {
    console.log('Setting up QR code');

    // Get server settings and generate QR code
    browser.runtime.sendMessage({ type: 'get-settings' })
        .then(response => {
            let settings;
            if (response && response.success && response.settings) {
                settings = response.settings;
            } else {
                // Fallback to default settings
                settings = {
                    serverHost: '192.168.2.101',
                    serverPort: 8000
                };
            }

            const mobileUrl = `http://${settings.serverHost}:${settings.serverPort}/mobile`;

            // Generate QR code
            generateQRCode(mobileUrl, 'qrCode');

            // Update URL display
            const qrUrlElement = document.getElementById('qrUrl');
            if (qrUrlElement) {
                qrUrlElement.textContent = mobileUrl;
            }

            console.log('QR code set up for URL:', mobileUrl);
        })
        .catch(error => {
            console.error('Error setting up QR code:', error);
            // Fallback URL
            const fallbackUrl = 'http://192.168.2.101:8000/mobile';
            generateQRCode(fallbackUrl, 'qrCode');
            const qrUrlElement = document.getElementById('qrUrl');
            if (qrUrlElement) {
                qrUrlElement.textContent = fallbackUrl;
            }
        });

    // Set up initial QR code visibility
    checkMessagesAndToggleQR();

    // Listen for settings changes to update QR code
    if (typeof browser !== 'undefined' && browser.storage) {
        browser.storage.onChanged.addListener(function (changes, namespace) {
            if (namespace === 'local' && changes.orionSettings) {
                console.log('Settings changed, updating QR code');
                setupQRCode();
            }
        });
    }
}

function checkMessagesAndToggleQR() {
    const conversation = document.getElementById('conversation');
    const qrContainer = document.getElementById('qrContainer');

    if (!conversation || !qrContainer) {
        console.log('Elements not found for QR toggle');
        return;
    }

    // Check if conversation has real message elements (not just the "No messages yet" placeholder)
    const hasRealMessages = conversation.children.length > 0 &&
        !conversation.innerHTML.includes('No messages yet');

    console.log('Checking QR visibility:', {
        childrenCount: conversation.children.length,
        innerHTML: conversation.innerHTML.substring(0, 100) + '...',
        hasRealMessages: hasRealMessages
    });

    if (hasRealMessages) {
        // Use direct style manipulation for higher specificity
        qrContainer.style.setProperty('display', 'none', 'important');
        console.log('QR code hidden - messages present');
    } else {
        // Show the QR container
        qrContainer.style.setProperty('display', 'flex', 'important');
        console.log('QR code shown - no messages');
    }
}

function sendMessage() {
    const inputField = document.getElementById('inputField');
    if (!inputField) {
        console.error('Input field not found');
        return;
    }

    const messageText = inputField.value.trim();
    if (!messageText) {
        console.log('Empty message, not sending');
        return;
    }

    console.log('Sending message:', messageText);

    // Send message via background script
    browser.runtime.sendMessage({
        type: 'send-message',
        text: messageText
    })
        .then(response => {
            if (response.success) {
                console.log('Message sent successfully:', response);
                inputField.value = ''; // Clear input field
                // WebSocket will handle the update automatically
            } else {
                console.error('Error sending message:', response.error);
            }
        })
        .catch(err => {
            console.error('Error communicating with background script:', err);
        });
}

function sendFile(file) {
    console.log('Sending file:', file.name);

    // Create FormData for file upload
    const formData = new FormData();
    formData.append('file', file);

    // Send file via background script
    browser.runtime.sendMessage({
        type: 'send-file',
        formData: formData
    })
        .then(response => {
            if (response.success) {
                console.log('File sent successfully:', response);
                // Clear file input
                const fileInput = document.getElementById('fileInput');
                if (fileInput) {
                    fileInput.value = '';
                }
                // WebSocket will handle the update automatically
            } else {
                console.error('Error sending file:', response.error);
            }
        })
        .catch(err => {
            console.error('Error communicating with background script:', err);
        });
}

function downloadFile(uniqueFilename, displayName) {
    console.log('Downloading file:', displayName, 'unique:', uniqueFilename);

    // Use background script's download handler to avoid HTTP warnings
    browser.runtime.sendMessage({
        type: 'download-file',
        uniqueFilename: uniqueFilename,
        displayName: displayName
    })
        .then(response => {
            if (response.success) {
                console.log('File download started successfully, ID:', response.downloadId);
            } else {
                console.error('Failed to start download:', response.error);
            }
        })
        .catch(err => {
            console.error('Error communicating with background script for download:', err);
        });
}

function setupSidebarResize() {
    const sidebar = document.getElementById('sleek-sidebar');
    const resizeHandle = document.getElementById('sleek-sidebar-resize-handle');

    if (!sidebar || !resizeHandle) {
        console.error('Sidebar or resize handle not found for resize functionality');
        return;
    }

    // Show the resize handle
    resizeHandle.style.display = 'block';

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;

        // Add resizing class to disable transitions during resize
        sidebar.classList.add('resizing');

        // Change cursor for the entire document during resize
        document.body.style.cursor = 'ew-resize';

        console.log('Started resizing sidebar');
    });

    document.addEventListener('mousemove', function (e) {
        if (!isResizing) return;

        e.preventDefault();

        // Calculate new width (drag left to make wider, right to make narrower)
        const deltaX = startX - e.clientX;
        const newWidth = startWidth + deltaX;

        // Apply constraints
        const minWidth = 300;
        const maxWidth = window.innerWidth * 0.6; // 60% of viewport width
        const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

        // Update sidebar width
        sidebar.style.setProperty('width', constrainedWidth + 'px', 'important');

        // Update right position for open state
        if (sidebar.classList.contains('open')) {
            sidebar.style.setProperty('right', '1vh', 'important');
        }
    });

    document.addEventListener('mouseup', function (e) {
        if (!isResizing) return;

        isResizing = false;

        // Remove resizing class to re-enable transitions
        sidebar.classList.remove('resizing');

        // Reset cursor
        document.body.style.cursor = '';

        // Save the current width to localStorage
        const currentWidth = sidebar.offsetWidth;
        localStorage.setItem('orion-sidebar-width', currentWidth.toString());

        console.log('Finished resizing sidebar, saved width:', currentWidth);
    });

    // Handle touch events for mobile support
    resizeHandle.addEventListener('touchstart', function (e) {
        e.preventDefault();
        isResizing = true;
        startX = e.touches[0].clientX;
        startWidth = sidebar.offsetWidth;
        sidebar.classList.add('resizing');
    });

    document.addEventListener('touchmove', function (e) {
        if (!isResizing) return;
        e.preventDefault();

        const deltaX = startX - e.touches[0].clientX;
        const newWidth = startWidth + deltaX;
        const minWidth = 300;
        const maxWidth = window.innerWidth * 0.6;
        const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

        sidebar.style.setProperty('width', constrainedWidth + 'px', 'important');
        if (sidebar.classList.contains('open')) {
            sidebar.style.setProperty('right', '1vh', 'important');
        }
    });

    document.addEventListener('touchend', function (e) {
        if (!isResizing) return;
        isResizing = false;
        sidebar.classList.remove('resizing');

        // Save the current width to localStorage
        const currentWidth = sidebar.offsetWidth;
        localStorage.setItem('orion-sidebar-width', currentWidth.toString());

        console.log('Finished touch resizing sidebar, saved width:', currentWidth);
    });
}
