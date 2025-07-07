// Listen for fetch-conversation requests from content script
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background script: Received message:', request.type);

    if (request.type === 'fetch-conversation') {
        console.log('Background script: Attempting to fetch from 192.168.2.101:8000/pc/items');

        // Test if fetch API is available
        if (typeof fetch === 'undefined') {
            console.error('Background script: fetch is not defined');
            sendResponse({ success: false, error: 'fetch is not defined' });
            return;
        }

        fetch('http://192.168.2.101:8000/pc/items', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            mode: 'cors',
            credentials: 'omit'
        })
            .then(response => {
                console.log('Background script: Fetch response received');
                console.log('Background script: Response ok:', response.ok);
                console.log('Background script: Response status:', response.status);
                console.log('Background script: Response headers:', [...response.headers.entries()]);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return response.text();
            })
            .then(data => {
                console.log('Background script: Fetch successful, data length:', data.length);
                console.log('Background script: Data preview:', data.substring(0, 200));
                sendResponse({ success: true, data });
            })
            .catch(error => {
                console.error('Background script: Fetch error details:', error);
                console.error('Background script: Error message:', error.message);
                console.error('Background script: Error stack:', error.stack);
                sendResponse({ success: false, error: error.toString() });
            });
        // Return true to indicate async response
        return true;
    }

    if (request.type === 'send-message') {
        console.log('Background script: Sending message');
        fetch('http://192.168.2.101:8000/pc/message', {
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
                console.log('Background script: Message sent successfully:', data);
                sendResponse({ success: true, data });
            })
            .catch(error => {
                console.error('Background script: Message send error:', error);
                sendResponse({ success: false, error: error.toString() });
            });
        return true;
    }

    if (request.type === 'send-file') {
        console.log('Background script: Sending file');
        fetch('http://192.168.2.101:8000/pc/file', {
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
                console.error('Background script: File send error:', error);
                sendResponse({ success: false, error: error.toString() });
            });
        return true;
    }
});
browser.browserAction.onClicked.addListener((tab) => {
    browser.tabs.sendMessage(tab.id, 'toggle-sidebar');
});
