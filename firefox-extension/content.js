// Inject sidebar if not already present
if (!document.getElementById('sleek-sidebar')) {
    const sidebar = document.createElement('div');
    sidebar.id = 'sleek-sidebar';
    // Fetch sidebar.html from the extension
    fetch(browser.runtime.getURL('sidebar.html'))
        .then(response => response.text())
        .then(html => {
            // Parse the HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            // Get the body content
            const bodyContent = doc.body.innerHTML;
            sidebar.innerHTML = bodyContent;
            // Get the style content
            const styleTag = doc.querySelector('style');
            if (styleTag) {
                // Scope the styles to the sidebar only
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
        });
    document.body.appendChild(sidebar);
}

// Listen for toggle messages
browser.runtime.onMessage.addListener((msg) => {
    if (msg === 'toggle-sidebar') {
        const sidebar = document.getElementById('sleek-sidebar');
        if (sidebar) {
            sidebar.classList.toggle('open');
        }
    }
});
