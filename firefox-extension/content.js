// Ask background script to fetch conversation and print to console
console.log('Content script: Sending message to background script');
browser.runtime.sendMessage({ type: 'fetch-conversation' })
    .then(response => {
        console.log('Content script: Received response from background script:', response);
        if (response.success) {
            console.log('Conversation:', response.data);
        } else {
            console.error('Error fetching conversation:', response.error);
        }
    })
    .catch(err => {
        console.error('Error communicating with background script:', err);
        console.error('Error details:', err.message, err.stack);
    });
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
