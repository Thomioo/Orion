// sidebar.js: Handles conversation UI and communication with Go server

const API_BASE = 'http://localhost:8000'; // Adjust if needed

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
    fetch(`${API_BASE}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
    }).then(r => r.json()).then(res => {
        addMessage(text, true);
        input.value = '';
        loadConversation();
    });
}

function sendFile() {
    const file = fileInput.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    fetch(`${API_BASE}/file`, {
        method: 'POST',
        body: formData
    }).then(r => r.json()).then(res => {
        addMessage(file.name, true, res.url);
        loadConversation();
    });
}

function loadConversation() {
    fetch(`${API_BASE}/conversation`)
        .then(r => r.json())
        .then(history => {
            conversationDiv.innerHTML = '';
            history.forEach(item => {
                if (item.fileUrl) {
                    addMessage(item.text, false, item.fileUrl);
                } else {
                    addMessage(item.text, false);
                }
            });
        });
}

window.addEventListener('DOMContentLoaded', loadConversation);
