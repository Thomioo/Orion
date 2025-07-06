// sidebar.js: Handles conversation UI and communication with Go server

const API_BASE = 'http://192.168.2.101:8000'; // Adjust if needed

const conversationDiv = document.createElement('div');
conversationDiv.id = 'conversation';
conversationDiv.style.height = '80vh';
conversationDiv.style.overflowY = 'auto';
conversationDiv.style.margin = '1em 0';
document.body.appendChild(conversationDiv);

const inputDiv = document.createElement('div');
inputDiv.style.display = 'flex';
inputDiv.style.gap = '0.5em';
inputDiv.style.margin = '1em';

const input = document.createElement('input');
input.type = 'text';
input.placeholder = 'Type a message...';
input.style.flex = '1';

const sendBtn = document.createElement('button');
sendBtn.textContent = 'Send';

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.style.display = 'none';

const attachBtn = document.createElement('button');
attachBtn.textContent = '📎';

inputDiv.appendChild(input);
inputDiv.appendChild(sendBtn);
inputDiv.appendChild(attachBtn);
document.body.appendChild(inputDiv);
document.body.appendChild(fileInput);

attachBtn.onclick = () => fileInput.click();

sendBtn.onclick = sendMessage;
input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
fileInput.onchange = sendFile;

function addMessage(msg, isOwn = false, fileUrl = null) {
    const msgDiv = document.createElement('div');
    msgDiv.style.textAlign = isOwn ? 'right' : 'left';
    msgDiv.style.margin = '0.5em';
    msgDiv.style.wordBreak = 'break-word';
    if (fileUrl) {
        const a = document.createElement('a');
        a.href = fileUrl;
        a.textContent = msg;
        a.target = '_blank';
        msgDiv.appendChild(a);
    } else {
        msgDiv.textContent = msg;
    }
    conversationDiv.appendChild(msgDiv);
    conversationDiv.scrollTop = conversationDiv.scrollHeight;
}

function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    browser.runtime.sendMessage({ type: 'send-message', text: text })
        .then(response => {
            if (response.success) {
                addMessage(text, true);
                input.value = '';
                loadConversation();
            } else {
                console.error('Error sending message:', response.error);
            }
        })
        .catch(err => {
            console.error('Error communicating with background script:', err);
        });
}

function sendFile() {
    const file = fileInput.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);

    browser.runtime.sendMessage({ type: 'send-file', formData: formData })
        .then(response => {
            if (response.success) {
                addMessage(file.name, true, response.data.url);
                loadConversation();
            } else {
                console.error('Error sending file:', response.error);
            }
        })
        .catch(err => {
            console.error('Error communicating with background script:', err);
        });
}

function loadConversation() {
    // Use background script to fetch conversation
    browser.runtime.sendMessage({ type: 'fetch-conversation' })
        .then(response => {
            if (response.success) {
                try {
                    const history = JSON.parse(response.data);
                    conversationDiv.innerHTML = '';
                    history.forEach(item => {
                        if (item.fileUrl) {
                            addMessage(item.text, false, item.fileUrl);
                        } else {
                            addMessage(item.text, false);
                        }
                    });
                } catch (e) {
                    console.error('Error parsing conversation data:', e);
                }
            } else {
                console.error('Error fetching conversation:', response.error);
            }
        })
        .catch(err => {
            console.error('Error communicating with background script:', err);
        });
}

window.addEventListener('DOMContentLoaded', loadConversation);
