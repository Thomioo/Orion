// Prevent multiple executions of content script
if (window.orionContentScriptLoaded) {
    console.log('Content script already loaded, skipping');
} else {
    window.orionContentScriptLoaded = true;
    console.log('Orion content script loaded');
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
                    sidebar.innerHTML = bodyContent;
                    const styleTag = doc.querySelector('style');
                    if (styleTag) {
                        // More comprehensive CSS scoping to prevent conflicts
                        let scopedStyle = styleTag.textContent;

                        // Replace all selectors to be scoped to #sleek-sidebar
                        scopedStyle = scopedStyle
                            .replace(/\bbody\b/g, '#sleek-sidebar')
                            .replace(/\.hello\b/g, '#sleek-sidebar .hello')
                            .replace(/#conversation\b/g, '#sleek-sidebar #conversation')
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
                                right: -26vw !important;
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
                            #sleek-sidebar.open {
                                right: 1vh !important;
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

                    // Set up sidebar functionality directly here
                    setupSidebarFunctionality();

                    // Prevent scroll propagation when hovering over sidebar
                    setupScrollPrevention();

                    // Slide in
                    setTimeout(() => sidebar.classList.add('open'), 10);
                });
        } else {
            // If open, hide and remove from DOM; if closed, show
            if (sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                setTimeout(() => {
                    if (sidebar.parentNode) sidebar.parentNode.removeChild(sidebar);
                }, 300); // match transition duration
            } else {
                sidebar.classList.add('open');
            }
        }
    }
});

// Sidebar functionality
function setupSidebarFunctionality() {
    console.log('Setting up sidebar functionality');

    // Load conversation data
    loadConversation();

    // Set up attach button icon
    setupAttachIcon();

    // Set up attach button functionality
    setupAttachButton();
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
}

function setupAttachIcon() {
    // Check if browser.runtime is available
    if (typeof browser !== 'undefined' && browser.runtime) {
        const attachIcon = document.getElementById('attachIcon');
        if (attachIcon) {
            const iconUrl = browser.runtime.getURL('imgs/attachment.png');
            console.log('Setting icon URL:', iconUrl);
            attachIcon.src = iconUrl;

            // Add error handling for image load
            attachIcon.onerror = function () {
                console.log('Image failed to load, falling back to emoji');
            };

            attachIcon.onload = function () {
                console.log('Image loaded successfully');
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
