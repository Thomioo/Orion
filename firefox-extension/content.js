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
                        const scopedStyle = styleTag.textContent.replace(/body/g, '#sleek-sidebar');
                        const style = document.createElement('style');
                        style.textContent = `
                            #sleek-sidebar {
                                position: fixed;
                                top: 1vh;
                                right: -26vw;
                                z-index: 999999;
                                transition: right 0.3s cubic-bezier(.4,0,.2,1);
                                box-shadow: -2px 0 8px rgba(0,0,0,0.2);
                            }
                            #sleek-sidebar.open {
                                right: 1vh;
                            }
                            ${scopedStyle}
                        `;
                        document.head.appendChild(style);
                    }
                    document.body.appendChild(sidebar);

                    // Set up sidebar functionality directly here
                    setupSidebarFunctionality();

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

function loadConversation() {
    browser.runtime.sendMessage({ type: 'fetch-conversation' })
        .then(response => {
            if (response.success) {
                try {
                    const data = JSON.parse(response.data);
                    console.log('Loaded flow data:', data);

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
                                messageDiv.innerHTML = `📎 ${item.content}`;
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

    if (attachButton && fileInput) {
        attachButton.addEventListener('click', function () {
            fileInput.click();
        });

        fileInput.addEventListener('change', function () {
            if (this.files.length > 0) {
                console.log('File selected:', this.files[0].name);
                // You can add file handling logic here
            }
        });
    } else {
        console.error('Attach button or file input not found');
    }
}
