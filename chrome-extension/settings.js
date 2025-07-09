// Robust cross-browser extension API selection
const extApi = (typeof chrome !== 'undefined' && chrome.storage) ? chrome :
    (typeof browser !== 'undefined' && browser.storage) ? browser :
        null;

if (!extApi) {
    alert('Extension storage API not available.');
    throw new Error('No extension storage API found.');
}
const DEFAULT_SETTINGS = {
    serverHost: '192.168.2.101',
    serverPort: 8000,
    resizableSidebar: true
};

document.addEventListener('DOMContentLoaded', () => {
    const serverHost = document.getElementById('serverHost');
    const serverPort = document.getElementById('serverPort');
    const resizableSidebar = document.getElementById('resizableSidebar');
    const status = document.getElementById('status');

    // Load settings
    extApi.storage.local.get('orionSettings', (res) => {
        const s = res && res.orionSettings ? res.orionSettings : DEFAULT_SETTINGS;
        serverHost.value = s.serverHost;
        serverPort.value = s.serverPort;
        resizableSidebar.checked = !!s.resizableSidebar;
    });

    // Show status message with animation
    function showStatus(message, type = 'success') {
        status.textContent = message;
        status.className = `status ${type} show`;
        setTimeout(() => {
            status.classList.remove('show');
        }, 3000);
    }

    document.getElementById('settingsForm').addEventListener('submit', (e) => {
        e.preventDefault();

        // Validate inputs
        const hostValue = serverHost.value.trim();
        const portValue = parseInt(serverPort.value);

        if (!hostValue) {
            showStatus('Please enter a valid server host', 'error');
            return;
        }

        if (isNaN(portValue) || portValue < 1 || portValue > 65535) {
            showStatus('Please enter a valid port number (1-65535)', 'error');
            return;
        }

        // Save settings
        const settings = {
            serverHost: hostValue,
            serverPort: portValue,
            resizableSidebar: resizableSidebar.checked
        };

        extApi.storage.local.set({ orionSettings: settings }, () => {
            if (extApi.runtime.lastError) {
                showStatus('Error saving settings: ' + extApi.runtime.lastError.message, 'error');
            } else {
                showStatus('Settings saved successfully!', 'success');
            }
        });
    });
});
