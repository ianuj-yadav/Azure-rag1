/* ==========================================================================
   AZURE RAG STUDIO — CLIENT ENGINE & DOCUMENT PREVIEW CONTROLLER
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    fetchCurrentDocument();
    setupDragAndDrop();
});

function scrollToDocWorkspace() {
    const el = document.getElementById('doc-workspace');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function scrollToAI(promptText = null) {
    const el = document.getElementById('ai-assistant');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    if (promptText) {
        const input = document.getElementById('chatInput');
        if (input) {
            input.value = promptText;
            input.focus();
        }
    }
}

/* ==========================================================================
   DOCUMENT UPLOAD & PREVIEW LOGIC
   ========================================================================== */
async function fetchCurrentDocument() {
    try {
        const res = await fetch('/api/current-document');
        if (res.ok) {
            const doc = await res.json();
            updateDocPreview(doc);
        }
    } catch (err) {
        console.error("Failed fetching active document:", err);
    }
}

function updateDocPreview(doc) {
    if (!doc) return;
    const titleEl = document.getElementById('docTitle');
    const typePill = document.getElementById('docTypePill');
    const pagesEl = document.getElementById('docPages');
    const chunksEl = document.getElementById('docChunks');
    const previewEl = document.getElementById('docPreviewText');
    const indicatorEl = document.getElementById('chatDocIndicator');

    if (titleEl) titleEl.textContent = doc.filename || 'Active_Document.pdf';
    if (typePill) typePill.textContent = doc.file_type || 'PDF';
    if (pagesEl) pagesEl.textContent = doc.pages || '1';
    if (chunksEl) chunksEl.textContent = doc.chunk_count || '12';
    if (previewEl) previewEl.textContent = doc.preview_text || 'Document parsed successfully.';
    if (indicatorEl) indicatorEl.textContent = `📄 Active: ${doc.filename || 'Document'}`;

    if (doc.chunks && Array.isArray(doc.chunks)) {
        updateInspector(doc.chunks, doc.filename);
    }
}

async function loadSampleDocument(docName, btnEl) {
    document.querySelectorAll('.sample-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    try {
        const res = await fetch('/api/select-sample-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doc_name: docName })
        });
        if (res.ok) {
            const doc = await res.json();
            updateDocPreview(doc);
        }
    } catch (err) {
        console.error("Error switching sample document:", err);
    }
}

function setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFileToServer(files[0]);
        }
    });
}

function handleFileUpload(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
        uploadFileToServer(files[0]);
    }
}

async function uploadFileToServer(file) {
    const titleEl = document.getElementById('docTitle');
    const previewEl = document.getElementById('docPreviewText');
    if (titleEl) titleEl.textContent = "Uploading " + file.name + "...";
    if (previewEl) previewEl.textContent = "Ingesting, parsing paragraphs, and indexing vectors...";

    try {
        const res = await fetch('/api/upload-document', {
            method: 'POST',
            headers: { 'X-File-Name': file.name },
            body: file
        });
        if (res.ok) {
            const doc = await res.json();
            updateDocPreview(doc);
        }
    } catch (err) {
        console.error("Upload failed:", err);
        if (previewEl) previewEl.textContent = "Error parsing document. Please try again.";
    }
}

/* ==========================================================================
   RAG CHAT & MARKDOWN FORMATTING
   ========================================================================== */
function askDirectPrompt(promptText) {
    const input = document.getElementById('chatInput');
    if (input) {
        input.value = promptText;
        submitChatQuery(promptText);
    }
}

function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleFormSubmit(e);
    }
}

function handleFormSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('chatInput');
    if (!input) return;
    const query = input.value.trim();
    if (!query) return;
    submitChatQuery(query);
}

async function submitChatQuery(query) {
    const input = document.getElementById('chatInput');
    if (input) input.value = '';

    appendMessage(query, 'user');
    const loadingId = appendMessage("Searching document paragraphs and synthesizing grounded answer...", 'assistant', true);

    try {
        const res = await fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query, doc_context: true })
        });

        const data = await res.json();
        removeMessage(loadingId);

        appendMessage(data.response || "No response received.", 'assistant');
        if (data.chunks) {
            updateInspector(data.chunks, data.document || "Active Document");
        }
    } catch (err) {
        removeMessage(loadingId);
        appendMessage("Network error querying document RAG engine. Please check connection.", 'assistant');
    }
}

function parseMarkdownToHtml(md) {
    if (!md) return '';

    // Convert Blockquote Grounded Execution Header
    let html = md.replace(/^> \*\*(.*?)\*\* (.*?)$/gm, '<div class="rag-badge-box"><strong>$1</strong> • $2</div>');

    // Convert Citations [Citation: ...] into Interactive Pill Badges
    html = html.replace(/\[Citation:\s*(.*?)\]/g, '<span class="citation-pill">📌 $1</span>');

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold & Italics
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

    // Inline Code
    html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');

    // Bullet points
    const lines = html.split('\n');
    let inList = false;
    let out = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.startsWith('- ')) {
            if (!inList) {
                out.push('<ul>');
                inList = true;
            }
            out.push(`<li>${line.substring(2)}</li>`);
        } else {
            if (inList) {
                out.push('</ul>');
                inList = false;
            }
            if (line.length > 0 && !line.startsWith('<div') && !line.startsWith('<h') && !line.startsWith('<ul') && !line.startsWith('<li')) {
                out.push(`<p>${line}</p>`);
            } else {
                out.push(line);
            }
        }
    }
    if (inList) out.push('</ul>');
    return out.join('\n');
}

function appendMessage(text, role, isLoading = false) {
    const stream = document.getElementById('chatStream');
    if (!stream) return null;

    const msgId = 'msg-' + Math.random().toString(36).substring(2, 9);
    const div = document.createElement('div');
    div.className = `message ${role}-msg`;
    div.id = msgId;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = role === 'user' ? '👤' : '⚡';

    const content = document.createElement('div');
    content.className = 'msg-content';

    if (role === 'user') {
        content.textContent = text;
    } else {
        if (isLoading) {
            content.innerHTML = `<div class="markdown-body"><p><em>⏳ ${text}</em></p></div>`;
        } else {
            content.innerHTML = `<div class="markdown-body">${parseMarkdownToHtml(text)}</div>`;
        }
    }

    div.appendChild(avatar);
    div.appendChild(content);
    stream.appendChild(div);
    stream.scrollTop = stream.scrollHeight;

    return msgId;
}

function removeMessage(msgId) {
    if (!msgId) return;
    const el = document.getElementById(msgId);
    if (el) el.remove();
}

function clearChat() {
    const stream = document.getElementById('chatStream');
    if (!stream) return;
    stream.innerHTML = `
        <div class="message assistant-msg">
            <div class="msg-avatar">⚡</div>
            <div class="msg-content">
                <div class="markdown-body">
                    <h3>Document Workspace Cleared</h3>
                    <p>Ready for your next document inquiry. Ask anything below!</p>
                </div>
            </div>
        </div>
    `;
}

function updateInspector(chunks, docName = "Active Document") {
    const container = document.getElementById('chunkContainer');
    const badge = document.getElementById('chunkBadge');
    if (!container) return;

    if (badge) badge.textContent = `${chunks ? chunks.length : 0} Chunks from ${docName}`;

    if (!chunks || chunks.length === 0) {
        container.innerHTML = `
            <div class="empty-inspector">
                <p>No document chunks retrieved yet.</p>
                <span>Ask a question to inspect semantic vector matches.</span>
            </div>
        `;
        return;
    }

    container.innerHTML = chunks.map((c, i) => `
        <div class="chunk-item">
            <div class="chunk-top">
                <span class="chunk-id">Excerpts • Chunk #${c.id || i + 1}</span>
                <span class="chunk-score">Score: ${(c.score || 0.94).toFixed(3)}</span>
            </div>
            <div class="chunk-text">${c.content || 'Document content excerpt...'}</div>
        </div>
    `).join('');
}
