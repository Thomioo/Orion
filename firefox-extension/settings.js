// Robust cross-browser extension API selection
const extApi = (typeof browser !== 'undefined' && browser.storage) ? browser :
    (typeof chrome !== 'undefined' && chrome.storage) ? chrome :
        null;

if (!extApi) {
    alert('Extension storage API not available.');
    throw new Error('No extension storage API found.');
}
const DEFAULT_SETTINGS = {
    serverHost: '192.168.2.101',
    serverPort: 8000,
    resizableSidebar: false
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

    document.getElementById('settingsForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const newSettings = {
            serverHost: serverHost.value.trim() || DEFAULT_SETTINGS.serverHost,
            serverPort: parseInt(serverPort.value) || DEFAULT_SETTINGS.serverPort,
            resizableSidebar: resizableSidebar.checked
        };
        extApi.storage.local.set({ orionSettings: newSettings }, () => {
            status.textContent = 'Settings saved!';
            setTimeout(() => status.textContent = '', 2000);
        });
    });

    // Show settings page on first install (if opened as a tab, focus the tab)
    if (window.location.search.includes('autofocus')) {
        window.focus();
    }
});
