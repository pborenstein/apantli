        // Error handling utilities
        function showError(message) {
            const errorBanner = document.getElementById('error-banner');
            errorBanner.textContent = message;
            errorBanner.style.display = 'block';
            setTimeout(() => {
                errorBanner.style.display = 'none';
            }, 5000);
        }

        function hideError() {
            const errorBanner = document.getElementById('error-banner');
            errorBanner.style.display = 'none';
        }

        // Fetch with error handling
        async function fetchWithErrorHandling(url) {
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                return await res.json();
            } catch (err) {
                showError(`Failed to load data: ${err.message}`);
                return null;
            }
        }

        // Load expanded requests from localStorage
        let expandedRequests = new Set(JSON.parse(localStorage.getItem('apantli_expandedRequests') || '[]'));
        // Load folded messages from localStorage
        let foldedMessages = new Set(JSON.parse(localStorage.getItem('apantli_foldedMessages') || '[]'));
        let detailViewMode = {}; // Track view mode per request: 'conversation' or 'json'
        let conversationMessages = {}; // Store conversation messages by requestId:messageIndex

        function saveExpandedRequests() {
            localStorage.setItem('apantli_expandedRequests', JSON.stringify([...expandedRequests]));
        }

        function saveFoldedMessages() {
            localStorage.setItem('apantli_foldedMessages', JSON.stringify([...foldedMessages]));
        }

        // Table sorting state: { tableId: { column: index, direction: 'asc'|'desc'|null, originalData: [] } }
        let tableSortState = {};

        // Server-side sort state for requests table
        let requestsSortState = { column: null, direction: 'desc' }; // Default: timestamp DESC

        // Extract text from content (handles both string and multimodal array formats)
        function extractContentText(content) {
            if (!content) return '';

            // If content is a string, return as-is
            if (typeof content === 'string') {
                return content;
            }

            // If content is an array (multimodal format), extract text parts
            if (Array.isArray(content)) {
                return content.map(part => {
                    if (typeof part === 'string') return part;
                    if (part.type === 'text' && part.text) return part.text;
                    if (part.type === 'image_url') return '[Image]';
                    return '';
                }).filter(Boolean).join('\n\n');
            }

            // Fallback for unexpected formats
            return String(content);
        }

        // Extract conversation messages from request/response
        function extractConversation(requestObj) {
            try {
                const request = JSON.parse(requestObj.request_data);
                const response = JSON.parse(requestObj.response_data);

                const messages = [];

                // Extract request messages
                if (request.messages && Array.isArray(request.messages)) {
                    request.messages.forEach(msg => {
                        messages.push({
                            role: msg.role,
                            content: extractContentText(msg.content),
                            isRequest: true
                        });
                    });
                }

                // Extract response message
                if (response.choices && response.choices[0] && response.choices[0].message) {
                    const assistantMsg = response.choices[0].message;
                    messages.push({
                        role: assistantMsg.role || 'assistant',
                        content: extractContentText(assistantMsg.content),
                        isRequest: false
                    });
                }

                return messages;
            } catch (e) {
                return null;
            }
        }

        // Estimate token count for a message (rough approximation)
        function estimateTokens(text) {
            if (!text) return 0;
            // Rough estimate: ~4 characters per token
            return Math.ceil(text.length / 4);
        }

        // Format message content with markdown-like code block detection
        function formatMessageContent(content) {
            if (!content) return '';

            // Escape HTML
            const escaped = escapeHtml(content);

            // Convert markdown code blocks to HTML
            let formatted = escaped.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
                return `<pre><code>${code.trim()}</code></pre>`;
            });

            // Convert inline code
            formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

            return formatted;
        }

        // Toggle message fold state
        function toggleMessageFold(button, messageId) {
            const messageContent = button.closest('.message-content');
            const messageText = messageContent.querySelector('.message-text');
            const isFolded = messageText.classList.toggle('folded');
            button.textContent = isFolded ? '▶' : '▼';

            if (isFolded) {
                foldedMessages.add(messageId);
            } else {
                foldedMessages.delete(messageId);
            }
            saveFoldedMessages();
        }

        // Copy text to clipboard
        function copyToClipboard(text, button) {
            navigator.clipboard.writeText(text).then(() => {
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                setTimeout(() => {
                    button.textContent = originalText;
                }, 1500);
            }).catch(err => {
                console.error('Failed to copy:', err);
            });
        }

        // Copy conversation message to clipboard by ID
        function copyConversationMessage(requestId, messageIndex, button) {
            const key = `${requestId}:${messageIndex}`;
            const content = conversationMessages[key];
            if (content) {
                copyToClipboard(content, button);
            } else {
                console.error('Message not found:', key);
            }
        }

        // Copy entire conversation to clipboard
        function copyEntireConversation(requestId, button) {
            const requestObj = requestsObjects.find(r => r.timestamp === requestId);
            if (!requestObj) return;

            const messages = extractConversation(requestObj);
            if (!messages) return;

            // Format as: <role>content</role>
            const fullConversation = messages.map(msg => {
                return `<${msg.role}>\n${msg.content}\n</${msg.role}>`;
            }).join('\n\n');

            copyToClipboard(fullConversation, button);
        }

        // Copy JSON request/response to clipboard
        function copyJsonToClipboard(requestId, type, button) {
            const requestObj = requestsObjects.find(r => r.timestamp === requestId);
            if (!requestObj) return;

            let textToCopy = '';

            try {
                if (type === 'request' || type === 'both') {
                    const req = JSON.parse(requestObj.request_data);
                    const requestJson = JSON.stringify(req, null, 2);
                    textToCopy += type === 'both' ? 'Request:\n' + requestJson : requestJson;
                }

                if (type === 'both') {
                    textToCopy += '\n\n';
                }

                if (type === 'response' || type === 'both') {
                    const resp = JSON.parse(requestObj.response_data);
                    const responseJson = JSON.stringify(resp, null, 2);
                    textToCopy += type === 'both' ? 'Response:\n' + responseJson : responseJson;
                }

                copyToClipboard(textToCopy, button);
            } catch (e) {
                console.error('Failed to parse JSON:', e);
            }
        }

        // Render conversation view
        function renderConversationView(requestObj) {
            const messages = extractConversation(requestObj);
            if (!messages) {
                return '<p class="error">Could not extract conversation from request/response data</p>';
            }

            const requestId = requestObj.timestamp;
            let html = '<div class="conversation-view">';

            messages.forEach((msg, index) => {
                // Store message content for copy button
                const messageKey = `${requestId}:${index}`;
                conversationMessages[messageKey] = msg.content;

                const icon = msg.role === 'user' ? '⊙' : msg.role === 'assistant' ? '◈' : '⚙';
                const roleLabel = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
                const tokens = estimateTokens(msg.content);
                const formattedContent = formatMessageContent(msg.content);
                const isFolded = foldedMessages.has(messageKey);

                html += `
                    <div class="message">
                        <div class="message-icon">${icon}</div>
                        <div class="message-content">
                            <div class="message-header">
                                <div>
                                    <span class="message-role" data-role="${msg.role}">${roleLabel}</span>
                                    <span class="message-meta">~${tokens.toLocaleString()} tokens</span>
                                </div>
                                <div class="message-actions">
                                    <button class="fold-btn" onclick="event.stopPropagation(); toggleMessageFold(this, '${messageKey}')" title="Fold/unfold message">${isFolded ? '▶' : '▼'}</button>
                                    <button class="copy-btn" onclick="copyConversationMessage('${requestId}', ${index}, this)">Copy</button>
                                </div>
                            </div>
                            <div class="message-text${isFolded ? ' folded' : ''}">${formattedContent}</div>
                        </div>
                    </div>
                `;
            });

            html += '</div>';
            return html;
        }

        // Toggle between conversation and JSON view
        function toggleDetailView(requestId, mode) {
            detailViewMode[requestId] = mode;
            const requestObj = requestsObjects.find(r => r.timestamp === requestId);
            if (!requestObj) return;

            const detailRow = document.getElementById('detail-' + requestId);
            const contentDiv = detailRow.querySelector('.detail-content');

            if (mode === 'conversation') {
                contentDiv.innerHTML = renderConversationView(requestObj);
            } else {
                // JSON view
                let requestHtml = '<span class="error">Error parsing request</span>';
                let responseHtml = '<span class="error">Error parsing response</span>';

                try {
                    const req = JSON.parse(requestObj.request_data);
                    requestHtml = renderJsonTree(req);
                } catch(e) {}

                try {
                    const resp = JSON.parse(requestObj.response_data);
                    responseHtml = renderJsonTree(resp);
                } catch(e) {}

                contentDiv.innerHTML = `
                    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                        <button class="copy-btn" onclick="copyJsonToClipboard('${requestId}', 'request', this)">Copy Request</button>
                        <button class="copy-btn" onclick="copyJsonToClipboard('${requestId}', 'response', this)">Copy Response</button>
                        <button class="copy-btn" onclick="copyJsonToClipboard('${requestId}', 'both', this)">Copy Both</button>
                    </div>
                    <b>Request:</b>
                    <div class="json-view json-tree">${requestHtml}</div>
                    <b>Response:</b>
                    <div class="json-view json-tree">${responseHtml}</div>
                `;
            }

            // Update toggle buttons and "Copy All" button visibility
            const toggleDiv = detailRow.querySelector('.detail-toggle');
            toggleDiv.innerHTML = `
                <button class="toggle-btn ${mode === 'conversation' ? 'active' : ''}" data-mode="conversation" onclick="event.stopPropagation(); toggleDetailView('${requestId}', 'conversation')">Conversation</button>
                <button class="toggle-btn ${mode === 'json' ? 'active' : ''}" data-mode="json" onclick="event.stopPropagation(); toggleDetailView('${requestId}', 'json')">Raw JSON</button>
                ${mode === 'conversation' ? `<button class="copy-btn" onclick="event.stopPropagation(); copyEntireConversation('${requestId}', this)">Copy All</button>` : ''}
            `;
        }

        function sortTable(tableId, columnIndex, data, renderCallback) {
            if (!tableSortState[tableId]) {
                tableSortState[tableId] = { column: null, direction: null, originalData: [...data] };
            }

            const state = tableSortState[tableId];

            // Cycle through: null -> asc -> desc -> null
            if (state.column === columnIndex) {
                if (state.direction === 'asc') {
                    state.direction = 'desc';
                } else if (state.direction === 'desc') {
                    state.direction = null;
                    state.column = null;
                } else {
                    state.direction = 'asc';
                }
            } else {
                state.column = columnIndex;
                state.direction = 'asc';
            }

            let sortedData;
            if (state.direction === null) {
                // Return to original order
                sortedData = [...state.originalData];
            } else {
                sortedData = [...data].sort((a, b) => {
                    let aVal = a[columnIndex];
                    let bVal = b[columnIndex];

                    // Handle null/undefined
                    if (aVal == null) return state.direction === 'asc' ? 1 : -1;
                    if (bVal == null) return state.direction === 'asc' ? -1 : 1;

                    // Detect type and compare
                    if (typeof aVal === 'number' && typeof bVal === 'number') {
                        return state.direction === 'asc' ? aVal - bVal : bVal - aVal;
                    }

                    // String comparison (case-insensitive)
                    const aStr = String(aVal).toLowerCase();
                    const bStr = String(bVal).toLowerCase();
                    const comparison = aStr.localeCompare(bStr);
                    return state.direction === 'asc' ? comparison : -comparison;
                });
            }

            renderCallback(sortedData, state);
        }

        function makeSortableHeader(tableId, headers, onSort) {
            return headers.map((header, i) =>
                `<th class="sortable" onclick="${onSort}(${i})">${header}</th>`
            ).join('');
        }

        function updateSortIndicators(tableElement, state) {
            const headers = tableElement.querySelectorAll('th.sortable');
            headers.forEach((th, i) => {
                th.classList.remove('sort-asc', 'sort-desc');
                if (state && state.column === i) {
                    th.classList.add(state.direction === 'asc' ? 'sort-asc' : 'sort-desc');
                }
            });
        }

        function applySortIfNeeded(tableId, data) {
            const state = tableSortState[tableId];
            if (!state || state.direction === null) {
                return data;
            }

            return [...data].sort((a, b) => {
                let aVal = a[state.column];
                let bVal = b[state.column];

                if (aVal == null) return state.direction === 'asc' ? 1 : -1;
                if (bVal == null) return state.direction === 'asc' ? -1 : 1;

                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return state.direction === 'asc' ? aVal - bVal : bVal - aVal;
                }

                const aStr = String(aVal).toLowerCase();
                const bStr = String(bVal).toLowerCase();
                const comparison = aStr.localeCompare(bStr);
                return state.direction === 'asc' ? comparison : -comparison;
            });
        }

        function onTabChange(tab) {
            if (tab === 'stats') refreshStats();
            if (tab === 'calendar') loadCalendar();
            if (tab === 'models') loadModels();
            if (tab === 'requests') loadRequests();
        }

        let modelsData = [];

        async function loadModels() {
            const res = await fetch('/models');
            const data = await res.json();

            // Convert to array format for sorting: [name, provider, litellm_model, enabled, input_cost, output_cost]
            modelsData = data.models.map(m => [
                m.name,
                m.provider,
                m.litellm_model,
                m.enabled !== undefined ? m.enabled : true,
                m.input_cost_per_million || 0,
                m.output_cost_per_million || 0
            ]);

            if (!tableSortState['models-list']) {
                tableSortState['models-list'] = { column: null, direction: null, originalData: [...modelsData] };
            } else {
                tableSortState['models-list'].originalData = [...modelsData];
            }
            renderModelsTable(applySortIfNeeded('models-list', modelsData), tableSortState['models-list']);
        }

        function sortModelsTable(columnIndex) {
            sortTable('models-list', columnIndex, modelsData, renderModelsTable);
        }

        function renderModelsTable(data, sortState) {
            const table = document.getElementById('models-list');
            table.innerHTML = `
                <thead>
                    <tr>
                        <th class="sortable" onclick="sortModelsTable(0)">Name</th>
                        <th class="sortable" onclick="sortModelsTable(1)">Provider</th>
                        <th class="sortable" onclick="sortModelsTable(2)">LiteLLM Model</th>
                        <th class="sortable" onclick="sortModelsTable(3)">Status</th>
                        <th class="sortable" onclick="sortModelsTable(4)">Input Cost/1M</th>
                        <th class="sortable" onclick="sortModelsTable(5)">Output Cost/1M</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => {
                        const name = row[0];
                        const enabled = row[3];
                        const escapedName = name.replace(/'/g, "\\'");
                        const toggleButton = enabled
                            ? `<button class="btn-sm btn-success" onclick="toggleModel('${escapedName}', false)">Enabled</button>`
                            : `<button class="btn-sm btn-secondary" onclick="toggleModel('${escapedName}', true)">Disabled</button>`;

                        return `
                            <tr>
                                <td>${name}</td>
                                <td>${row[1]}</td>
                                <td>${row[2]}</td>
                                <td>${toggleButton}</td>
                                <td>${row[4] ? '$' + row[4].toFixed(2) : 'N/A'}</td>
                                <td>${row[5] ? '$' + row[5].toFixed(2) : 'N/A'}</td>
                                <td class="actions-cell">
                                    <button class="btn-sm btn-danger" onclick="deleteModel('${escapedName}')">Delete</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            `;
            updateSortIndicators(table, sortState);
        }

        async function toggleModel(modelName, enabled) {
            try {
                const res = await fetch(`/api/models/${encodeURIComponent(modelName)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled })
                });

                if (!res.ok) {
                    const error = await res.json();
                    alert('Error: ' + (error.error || 'Failed to toggle model'));
                    return;
                }

                // Reload models to reflect changes
                await loadModels();
                showToast(`Model ${modelName} ${enabled ? 'enabled' : 'disabled'}`);
            } catch (error) {
                console.error('Error toggling model:', error);
                alert('Failed to toggle model: ' + error.message);
            }
        }

        async function deleteModel(modelName) {
            if (!confirm(`Are you sure you want to delete the model "${modelName}"?\n\nThis will remove it from config.yaml.`)) {
                return;
            }

            try {
                const res = await fetch(`/api/models/${encodeURIComponent(modelName)}`, {
                    method: 'DELETE'
                });

                if (!res.ok) {
                    const error = await res.json();
                    alert('Error: ' + (error.error || 'Failed to delete model'));
                    return;
                }

                // Reload models to reflect changes
                await loadModels();
                showToast(`Model ${modelName} deleted`);
            } catch (error) {
                console.error('Error deleting model:', error);
                alert('Failed to delete model: ' + error.message);
            }
        }

        function showToast(message) {
            // Simple toast notification
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;
            document.body.appendChild(toast);

            setTimeout(() => {
                toast.classList.add('show');
            }, 10);

            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function renderJsonTree(obj, isRoot = true) {
            if (obj === null) return '<span class="json-null">null</span>';
            if (obj === undefined) return '<span class="json-null">undefined</span>';

            const type = typeof obj;
            if (type === 'string') return `<span class="json-string">"${escapeHtml(obj)}"</span>`;
            if (type === 'number') return `<span class="json-number">${obj}</span>`;
            if (type === 'boolean') return `<span class="json-boolean">${obj}</span>`;

            if (Array.isArray(obj)) {
                if (obj.length === 0) return '<span>[]</span>';

                const id = 'json-' + Math.random().toString(36).substr(2, 9);
                let html = `<span class="json-toggle" onclick="toggleJson('${id}')">▼</span>[`;
                html += `<div id="${id}" class="json-line">`;
                obj.forEach((item, i) => {
                    html += renderJsonTree(item, false);
                    if (i < obj.length - 1) html += ',';
                    html += '<br>';
                });
                html += '</div>]';
                return html;
            }

            if (type === 'object') {
                const keys = Object.keys(obj);
                if (keys.length === 0) return '<span>{}</span>';

                const id = 'json-' + Math.random().toString(36).substr(2, 9);
                let html = `<span class="json-toggle" onclick="toggleJson('${id}')">▼</span>{`;
                html += `<div id="${id}" class="json-line">`;
                keys.forEach((key, i) => {
                    html += `<span class="json-key">"${escapeHtml(key)}"</span>: `;
                    html += renderJsonTree(obj[key], false);
                    if (i < keys.length - 1) html += ',';
                    html += '<br>';
                });
                html += '</div>}';
                return html;
            }

            return String(obj);
        }

        function toggleJson(id) {
            const el = document.getElementById(id);
            const toggle = el.previousElementSibling;
            if (el.classList.contains('json-collapsed')) {
                el.classList.remove('json-collapsed');
                toggle.textContent = '▼';
            } else {
                el.classList.add('json-collapsed');
                toggle.textContent = '▶';
            }
        }

        let requestsData = [];
        let requestsObjects = []; // Store original request objects for detail rows
        let serverAggregates = { total: 0, total_tokens: 0, total_cost: 0, avg_cost: 0 }; // Server-side aggregates

        async function loadRequests() {
            if (!alpineData) return;
            try {
                const query = alpineData.buildQuery(alpineData.dateFilter);
                const offset = (alpineData.currentPage - 1) * alpineData.itemsPerPage;
                let url = `/requests${query}${query ? '&' : '?'}offset=${offset}&limit=${alpineData.itemsPerPage}`;

                // Add filter parameters
                const filters = alpineData.requestFilters;
                if (filters.provider) {
                    url += `&provider=${encodeURIComponent(filters.provider)}`;
                }
                if (filters.model) {
                    url += `&model=${encodeURIComponent(filters.model)}`;
                }
                if (filters.minCost !== '' && filters.minCost !== null) {
                    url += `&min_cost=${filters.minCost}`;
                }
                if (filters.maxCost !== '' && filters.maxCost !== null) {
                    url += `&max_cost=${filters.maxCost}`;
                }
                if (filters.search) {
                    url += `&search=${encodeURIComponent(filters.search)}`;
                }

                // Add sort parameters
                const sortColumnMap = ['timestamp', 'model', 'total_tokens', 'cost', 'duration_ms'];
                if (requestsSortState.column !== null) {
                    url += `&sort_by=${sortColumnMap[requestsSortState.column]}`;
                    url += `&sort_dir=${requestsSortState.direction}`;
                }

                const res = await fetch(url);
                const data = await res.json();

                // Store server-side aggregates for ALL matching requests
                serverAggregates = {
                    total: data.total,
                    total_tokens: data.total_tokens,
                    total_cost: data.total_cost,
                    avg_cost: data.avg_cost
                };

                // Store total for pagination
                alpineData.totalItems = data.total;

                // Store original objects and convert to array format for sorting
                requestsObjects = data.requests;
                requestsData = data.requests.map(r => [
                    new Date(r.timestamp.endsWith('Z') || r.timestamp.includes('+') ? r.timestamp : r.timestamp + 'Z').getTime(), // For sorting by time
                    r.model,
                    r.total_tokens,
                    r.cost,
                    r.duration_ms,
                    r.timestamp // Store timestamp for detail row lookup
                ]);

                // Populate filter dropdowns from current page data
                populateFilterDropdowns();

                // Initialize or update sort state
                if (!tableSortState['requests-list']) {
                    tableSortState['requests-list'] = { column: null, direction: null, originalData: [...requestsData] };
                } else {
                    // Update originalData to match current filtered results
                    tableSortState['requests-list'].originalData = [...requestsData];
                }

                // Update summary and render table
                updateRequestSummary();
                renderRequestsTable(requestsData, tableSortState['requests-list']);
            } catch(e) {
                document.getElementById('requests-list').innerHTML = '<tr><td colspan="5">Error loading requests</td></tr>';
            }
        }

        // Populate filter dropdowns once on load (not per page)
        let filterValuesLoaded = false;
        async function populateFilterDropdowns() {
            if (filterValuesLoaded) return;

            try {
                const res = await fetch('/stats/filters');
                const data = await res.json();

                const providerSelect = document.getElementById('filter-provider');
                const currentProvider = alpineData.requestFilters.provider;
                providerSelect.innerHTML = '<option value="">All</option>';
                data.providers.forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.name;
                    option.textContent = p.name;
                    if (p.name === currentProvider) option.selected = true;
                    providerSelect.appendChild(option);
                });

                const modelSelect = document.getElementById('filter-model');
                const currentModel = alpineData.requestFilters.model;
                modelSelect.innerHTML = '<option value="">All</option>';
                data.models.forEach(m => {
                    const option = document.createElement('option');
                    option.value = m.name;
                    option.textContent = m.name;
                    if (m.name === currentModel) option.selected = true;
                    modelSelect.appendChild(option);
                });

                filterValuesLoaded = true;
            } catch (e) {
                console.error('Failed to load filter values:', e);
            }
        }


        function updateRequestSummary() {
            const summary = document.getElementById('request-summary');

            // Use server-side aggregates for ALL matching requests, not just paginated results
            if (serverAggregates.total === 0) {
                summary.style.display = 'none';
                return;
            }

            document.getElementById('summary-count').textContent = serverAggregates.total.toLocaleString();
            document.getElementById('summary-cost').textContent = '$' + serverAggregates.total_cost.toFixed(4);
            document.getElementById('summary-tokens').textContent = serverAggregates.total_tokens.toLocaleString();
            document.getElementById('summary-avg-cost').textContent = '$' + serverAggregates.avg_cost.toFixed(4);

            summary.style.display = 'flex';
        }

        function sortRequestsTable(columnIndex) {
            // Update sort state
            if (requestsSortState.column === columnIndex) {
                // Toggle direction or clear
                if (requestsSortState.direction === 'desc') {
                    requestsSortState.direction = 'asc';
                } else if (requestsSortState.direction === 'asc') {
                    // Clear sort
                    requestsSortState.column = null;
                    requestsSortState.direction = 'desc';
                }
            } else {
                // New column, default to desc
                requestsSortState.column = columnIndex;
                requestsSortState.direction = 'desc';
            }

            // Reload data from server with new sort
            loadRequests();
        }

        function renderRequestsTable(data, sortState) {
            const tbody = document.createElement('tbody');

            // Calculate min/max for gradient tinting
            const tokens = data.map(r => r[2]);
            const costs = data.map(r => r[3]);
            const durations = data.map(r => r[4]);

            const minTokens = Math.min(...tokens);
            const maxTokens = Math.max(...tokens);
            const minCost = Math.min(...costs);
            const maxCost = Math.max(...costs);
            const minDuration = Math.min(...durations);
            const maxDuration = Math.max(...durations);

            data.forEach(row => {
                const timestamp = row[5];
                const requestObj = requestsObjects.find(r => r.timestamp === timestamp);
                if (!requestObj) return;

                const requestId = timestamp;
                const currentMode = detailViewMode[requestId] || 'conversation';

                // Calculate cost breakdown
                const promptTokens = requestObj.prompt_tokens || 0;
                const completionTokens = requestObj.completion_tokens || 0;
                const totalTokens = requestObj.total_tokens || 0;
                const cost = requestObj.cost || 0;

                // Rough cost split based on token counts (not exact but reasonable)
                const promptCost = totalTokens > 0 ? (promptTokens / totalTokens) * cost : 0;
                const completionCost = cost - promptCost;

                // Calculate gradient colors for this row
                const tokenColor = getValueTint(row[2], minTokens, maxTokens, '#3b82f6');
                const costColor = getValueTint(row[3], minCost, maxCost, '#10b981');
                const durationColor = getValueTint(row[4], minDuration, maxDuration, '#f59e0b');

                // Calculate glow intensity (higher values = more glow)
                const tokenGlow = (row[2] - minTokens) / (maxTokens - minTokens || 1);
                const costGlow = (row[3] - minCost) / (maxCost - minCost || 1);
                const durationGlow = (row[4] - minDuration) / (maxDuration - minDuration || 1);

                // Get provider color for model
                const provider = requestObj.provider || 'unknown';
                const modelColor = getProviderColor(provider);

                // Create main row
                const mainRow = document.createElement('tr');
                mainRow.id = 'row-' + requestId;
                mainRow.className = 'request-row' + (expandedRequests.has(requestId) ? ' expanded' : '');
                mainRow.onclick = () => toggleDetail(requestId);
                mainRow.innerHTML = `
                    <td>${escapeHtml(new Date(timestamp.endsWith('Z') || timestamp.includes('+') ? timestamp : timestamp + 'Z').toLocaleString())}</td>
                    <td style="color: ${modelColor}; font-weight: 600; text-shadow: 0 0 6px ${modelColor}30;">${escapeHtml(row[1])}</td>
                    <td style="color: ${tokenColor}; font-weight: 600; text-shadow: 0 0 ${6 * tokenGlow}px ${tokenColor}40;">${row[2].toLocaleString()}</td>
                    <td style="color: ${costColor}; font-weight: 600; text-shadow: 0 0 ${6 * costGlow}px ${costColor}40;">$${row[3].toFixed(4)}</td>
                    <td style="color: ${durationColor}; font-weight: 600; text-shadow: 0 0 ${6 * durationGlow}px ${durationColor}40;">${row[4]}ms</td>
                `;

                // Create detail row, restore expanded state
                const detailRow = document.createElement('tr');
                detailRow.id = 'detail-' + requestId;
                detailRow.style.display = expandedRequests.has(requestId) ? 'table-row' : 'none';

                // Extract parameters from request data
                let paramsHtml = '';
                try {
                    const req = JSON.parse(requestObj.request_data);
                    const params = [];

                    if (req.temperature !== null && req.temperature !== undefined) {
                        params.push(`temp: ${req.temperature}`);
                    }
                    if (req.max_tokens !== null && req.max_tokens !== undefined) {
                        params.push(`max: ${req.max_tokens}`);
                    }
                    if (req.timeout !== null && req.timeout !== undefined) {
                        params.push(`timeout: ${req.timeout}s`);
                    }
                    if (req.num_retries !== null && req.num_retries !== undefined) {
                        params.push(`retries: ${req.num_retries}`);
                    }
                    if (req.top_p !== null && req.top_p !== undefined) {
                        params.push(`top_p: ${req.top_p}`);
                    }

                    if (params.length > 0) {
                        paramsHtml = `
                            <div class="detail-stat">
                                <span class="detail-stat-label">Params: </span>
                                <span class="detail-stat-value">${params.join(', ')}</span>
                            </div>
                        `;
                    }
                } catch(e) {
                    // Ignore parsing errors
                }

                // Build detail content
                const detailHeader = `
                    <div class="detail-header">
                        <div class="detail-stats">
                            <div class="detail-stat">
                                <span class="detail-stat-label">Model: </span>
                                <span class="detail-stat-value">${escapeHtml(requestObj.model)}</span>
                            </div>
                            <div class="detail-stat">
                                <span class="detail-stat-label">Provider: </span>
                                <span class="detail-stat-value">${escapeHtml(requestObj.provider || 'unknown')}</span>
                            </div>
                            <div class="detail-stat">
                                <span class="detail-stat-label">Tokens: </span>
                                <span class="detail-stat-value">${promptTokens.toLocaleString()} in / ${completionTokens.toLocaleString()} out = ${totalTokens.toLocaleString()} total</span>
                            </div>
                            <div class="detail-stat">
                                <span class="detail-stat-label">Cost: </span>
                                <span class="detail-stat-value">$${cost.toFixed(4)} ($${promptCost.toFixed(4)} in + $${completionCost.toFixed(4)} out)</span>
                            </div>
                            <div class="detail-stat">
                                <span class="detail-stat-label">Duration: </span>
                                <span class="detail-stat-value">${requestObj.duration_ms}ms</span>
                            </div>
                            ${paramsHtml}
                        </div>
                    </div>
                `;

                const toggleButtons = `
                    <div class="detail-toggle">
                        <button class="toggle-btn ${currentMode === 'conversation' ? 'active' : ''}" data-mode="conversation" onclick="event.stopPropagation(); toggleDetailView('${requestId}', 'conversation')">Conversation</button>
                        <button class="toggle-btn ${currentMode === 'json' ? 'active' : ''}" data-mode="json" onclick="event.stopPropagation(); toggleDetailView('${requestId}', 'json')">Raw JSON</button>
                        ${currentMode === 'conversation' ? `<button class="copy-btn" onclick="event.stopPropagation(); copyEntireConversation('${requestId}', this)">Copy All</button>` : ''}
                    </div>
                `;

                // Generate initial content
                let contentHtml = '';
                if (currentMode === 'conversation') {
                    contentHtml = renderConversationView(requestObj);
                } else {
                    let requestHtml = '<span class="error">Error parsing request</span>';
                    let responseHtml = '<span class="error">Error parsing response</span>';

                    try {
                        const req = JSON.parse(requestObj.request_data);
                        requestHtml = renderJsonTree(req);
                    } catch(e) {}

                    try {
                        const resp = JSON.parse(requestObj.response_data);
                        responseHtml = renderJsonTree(resp);
                    } catch(e) {}

                    contentHtml = `
                        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                            <button class="copy-btn" onclick="copyJsonToClipboard('${requestId}', 'request', this)">Copy Request</button>
                            <button class="copy-btn" onclick="copyJsonToClipboard('${requestId}', 'response', this)">Copy Response</button>
                            <button class="copy-btn" onclick="copyJsonToClipboard('${requestId}', 'both', this)">Copy Both</button>
                        </div>
                        <b>Request:</b>
                        <div class="json-view json-tree">${requestHtml}</div>
                        <b>Response:</b>
                        <div class="json-view json-tree">${responseHtml}</div>
                    `;
                }

                detailRow.innerHTML = `
                    <td colspan="5" class="request-detail">
                        ${detailHeader}
                        ${toggleButtons}
                        <div class="detail-content">
                            ${contentHtml}
                        </div>
                    </td>
                `;

                tbody.appendChild(mainRow);
                tbody.appendChild(detailRow);
            });

            const table = document.getElementById('requests-list');
            table.innerHTML = `
                <thead>
                    <tr>
                        <th class="sortable" onclick="sortRequestsTable(0)">Time</th>
                        <th class="sortable" onclick="sortRequestsTable(1)">Model</th>
                        <th class="sortable" onclick="sortRequestsTable(2)">Tokens</th>
                        <th class="sortable" onclick="sortRequestsTable(3)">Cost</th>
                        <th class="sortable" onclick="sortRequestsTable(4)">Duration</th>
                    </tr>
                </thead>
            `;
            table.appendChild(tbody);

            // Update sort indicators using server-side state
            updateSortIndicators(table, requestsSortState);
        }

        function toggleDetail(id) {
            const detailRow = document.getElementById('detail-' + id);
            const mainRow = document.getElementById('row-' + id);
            if (detailRow) {
                const isHidden = detailRow.style.display === 'none' || !detailRow.style.display;
                detailRow.style.display = isHidden ? 'table-row' : 'none';

                // Toggle expanded class on main row
                if (mainRow) {
                    mainRow.classList.toggle('expanded', isHidden);
                }

                // Track expanded state
                if (isHidden) {
                    expandedRequests.add(id);
                } else {
                    expandedRequests.delete(id);
                }
                saveExpandedRequests();
            }
        }

        // Make Alpine data accessible to functions
        let alpineData = null;
        document.addEventListener('alpine:initialized', async () => {
            alpineData = Alpine.$data(document.body);

            // Always fetch database date range on init so charts know the full range
            try {
                const res = await fetch('/stats/date-range');
                const data = await res.json();
                if (data.start_date && data.end_date) {
                    alpineData.dbDateRange.startDate = data.start_date;
                    alpineData.dbDateRange.endDate = data.end_date;
                }
            } catch (e) {
                // Ignore errors - will fall back to data bounds
            }

            // Trigger initial data load now that Alpine is ready
            onTabChange(alpineData.currentTab || 'stats');
        });

        // Debounced resize handler to re-render charts
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (alpineData && alpineData.currentTab === 'stats') {
                    renderProviderTrends();
                }
            }, 250);
        });

        let byModelData = [];
        let byProviderData = [];
        let errorsData = [];

        // Provider trends chart state
        let hiddenProviders = new Set();

        // Provider colors (shared with bar chart)
        const PROVIDER_COLORS = {
            'openai': '#10a37f',
            'anthropic': '#d97757',
            'google': '#4285f4',
            'default': '#999999'
        };

        function getProviderColor(provider) {
            return PROVIDER_COLORS[provider] || PROVIDER_COLORS.default;
        }

        // Generate color tints for models within a provider
        function getModelColor(provider, modelIndex, totalModels) {
            const baseColor = getProviderColor(provider);

            // Parse hex color to RGB
            const r = parseInt(baseColor.slice(1, 3), 16);
            const g = parseInt(baseColor.slice(3, 5), 16);
            const b = parseInt(baseColor.slice(5, 7), 16);

            // Generate tint: darker for first model, lighter for subsequent
            // Lightness range: 0% (darkest) to 75% (lightest)
            const lightness = totalModels === 1 ? 0 : (modelIndex / (totalModels - 1)) * 0.75;

            // Mix with white to create tint
            const nr = Math.round(r + (255 - r) * lightness);
            const ng = Math.round(g + (255 - g) * lightness);
            const nb = Math.round(b + (255 - b) * lightness);

            return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
        }

        // Generate vibrant color tint based on value (higher = brighter/glowier for dark mode)
        function getValueTint(value, min, max, baseColor = '#3b82f6') {
            if (max === min) return baseColor;

            // Normalize value to 0-1 range
            const normalized = (value - min) / (max - min);

            // Parse base color to RGB
            const r = parseInt(baseColor.slice(1, 3), 16);
            const g = parseInt(baseColor.slice(3, 5), 16);
            const b = parseInt(baseColor.slice(5, 7), 16);

            // Subtle brighten: 0.7 to 1.0 range (much more subtle)
            // Higher values = slightly brighter
            const factor = 0.7 + (normalized * 0.3);
            const nr = Math.min(255, Math.round(r + (255 - r) * (factor - 0.7)));
            const ng = Math.min(255, Math.round(g + (255 - g) * (factor - 0.7)));
            const nb = Math.min(255, Math.round(b + (255 - b) * (factor - 0.7)));

            return `rgb(${nr}, ${ng}, ${nb})`;
        }

        async function renderProviderTrends() {
            if (!alpineData) return;

            const container = document.getElementById('provider-trends-chart');
            const filter = alpineData.dateFilter;

            // Detect single-day view (Today, Yesterday, or custom single-day range)
            const isSingleDay = filter.startDate && filter.endDate && filter.startDate === filter.endDate;

            try {
                if (isSingleDay) {
                    // Fetch hourly data for single-day view
                    const timezoneOffset = -new Date().getTimezoneOffset();
                    const res = await fetch(`/stats/hourly?date=${filter.startDate}&timezone_offset=${timezoneOffset}`);
                    const data = await res.json();

                    if (!data.hourly || data.hourly.length === 0) {
                        container.innerHTML = '<div class="chart-empty">No data available for selected date</div>';
                        return;
                    }

                    renderHourlyChart(container, data.hourly, data.date);
                } else {
                    // Fetch daily data for multi-day view
                    const query = alpineData.buildQuery(filter);
                    const res = await fetch(`/stats/daily${query}`);
                    const data = await res.json();

                    if (!data.daily || data.daily.length === 0) {
                        container.innerHTML = '<div class="chart-empty">No data available for selected date range</div>';
                        return;
                    }

                    // Sort daily data by date ascending for proper line rendering
                    const dailyData = data.daily.sort((a, b) => a.date.localeCompare(b.date));

                    // Generate complete date range (including empty days)
                    // Use filter dates if set, otherwise use dbDateRange for "All Time",
                    // falling back to data bounds only if neither is available
                    const allDates = [];
                    let rangeStart, rangeEnd;

                    if (filter.startDate && filter.endDate) {
                        // Explicit filter range (This Week, This Month, etc.)
                        rangeStart = filter.startDate;
                        rangeEnd = filter.endDate;
                    } else if (alpineData.dbDateRange.startDate && alpineData.dbDateRange.endDate) {
                        // "All Time" - use database range
                        rangeStart = alpineData.dbDateRange.startDate;
                        rangeEnd = alpineData.dbDateRange.endDate;
                    } else if (dailyData.length > 0) {
                        // Fallback to data bounds
                        rangeStart = dailyData[0].date;
                        rangeEnd = dailyData[dailyData.length - 1].date;
                    }

                    if (rangeStart && rangeEnd) {
                        const start = new Date(rangeStart + 'T00:00:00');
                        const end = new Date(rangeEnd + 'T00:00:00');
                        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                            const dateStr = d.toISOString().split('T')[0];
                            allDates.push(dateStr);
                        }
                    }

                    // Group data by model (includes provider for coloring)
                    const modelData = {};
                    dailyData.forEach(day => {
                        day.by_model.forEach(m => {
                            const modelKey = `${m.provider}:${m.model}`;
                            if (!modelData[modelKey]) {
                                modelData[modelKey] = {
                                    provider: m.provider,
                                    model: m.model,
                                    data: []
                                };
                            }
                            modelData[modelKey].data.push({
                                date: day.date,
                                cost: m.cost
                            });
                        });
                    });

                    // Fill in missing dates with 0 cost for each model
                    Object.values(modelData).forEach(modelInfo => {
                        const existingDates = new Set(modelInfo.data.map(d => d.date));
                        allDates.forEach(date => {
                            if (!existingDates.has(date)) {
                                modelInfo.data.push({ date, cost: 0 });
                            }
                        });
                        // Re-sort after filling gaps
                        modelInfo.data.sort((a, b) => a.date.localeCompare(b.date));
                    });

                    // Sort models by total cost and assign colors
                    const sortedModels = Object.values(modelData).sort((a, b) => {
                        const aCost = a.data.reduce((sum, d) => sum + d.cost, 0);
                        const bCost = b.data.reduce((sum, d) => sum + d.cost, 0);
                        return bCost - aCost;
                    });

                    // Group by provider and assign colors
                    const modelsByProvider = {};
                    sortedModels.forEach(m => {
                        if (!modelsByProvider[m.provider]) {
                            modelsByProvider[m.provider] = [];
                        }
                        modelsByProvider[m.provider].push(m);
                    });

                    // Assign colors to models
                    Object.entries(modelsByProvider).forEach(([provider, models]) => {
                        models.forEach((m, index) => {
                            m.color = getModelColor(provider, index, models.length);
                        });
                    });

                    renderChart(container, sortedModels, allDates);
                }
            } catch (e) {
                console.error('Failed to load provider trends:', e);
                container.innerHTML = '<div class="chart-empty">Failed to load chart data</div>';
            }
        }

        function renderHourlyChart(container, hourlyData, date) {
            const width = container.offsetWidth - 140; // Subtract container padding (60 + 80)
            const height = 260;
            const margin = { top: 20, right: 0, bottom: 25, left: 0 };
            const chartWidth = width - margin.left - margin.right;
            const chartHeight = height - margin.top - margin.bottom;

            // Calculate max cost for scaling
            const maxCost = Math.max(...hourlyData.map(h => h.cost), 0.0001);
            const minCost = 0;

            // Group data by model for stacked bars
            const modelTotals = {};
            hourlyData.forEach(hour => {
                hour.by_model.forEach(m => {
                    const modelKey = `${m.provider}:${m.model}`;
                    if (!modelTotals[modelKey]) {
                        modelTotals[modelKey] = {
                            provider: m.provider,
                            model: m.model,
                            costs: new Array(24).fill(0)
                        };
                    }
                    modelTotals[modelKey].costs[hour.hour] = m.cost;
                });
            });

            // Sort models by total cost and assign colors
            const sortedModels = Object.values(modelTotals).sort((a, b) => {
                const aCost = a.costs.reduce((sum, c) => sum + c, 0);
                const bCost = b.costs.reduce((sum, c) => sum + c, 0);
                return bCost - aCost;
            });

            // Group by provider and assign colors
            const modelsByProvider = {};
            sortedModels.forEach(m => {
                if (!modelsByProvider[m.provider]) {
                    modelsByProvider[m.provider] = [];
                }
                modelsByProvider[m.provider].push(m);
            });

            Object.entries(modelsByProvider).forEach(([provider, models]) => {
                models.forEach((m, index) => {
                    m.color = getModelColor(provider, index, models.length);
                });
            });
            const barWidth = chartWidth / 24;

            // Y scale: cost to pixel (inverted because SVG Y increases downward)
            const yScale = (cost) => chartHeight - ((cost - minCost) / (maxCost - minCost)) * chartHeight;

            // Format hour for display (0-23 to "12am", "1am", ... "11pm")
            const formatHour = (hour) => {
                if (hour === 0) return '12am';
                if (hour < 12) return hour + 'am';
                if (hour === 12) return '12pm';
                return (hour - 12) + 'pm';
            };

            // Create SVG
            let svg = `
                <svg class="chart-svg" viewBox="0 0 ${width} ${height + 40}" xmlns="http://www.w3.org/2000/svg">
                    <g transform="translate(${margin.left}, ${margin.top})">
            `;

            // Add grid lines
            const gridSteps = 5;
            for (let i = 0; i <= gridSteps; i++) {
                const y = (i / gridSteps) * chartHeight;
                svg += `<line class="chart-grid" x1="0" y1="${y}" x2="${chartWidth}" y2="${y}" />`;
            }

            // Add Y axis
            svg += `<line class="chart-axis" x1="0" y1="0" x2="0" y2="${chartHeight}" />`;
            for (let i = 0; i <= gridSteps; i++) {
                const y = (i / gridSteps) * chartHeight;
                const cost = maxCost - (i / gridSteps) * (maxCost - minCost);
                svg += `<text class="chart-axis-text" x="-10" y="${y + 4}" text-anchor="end">$${cost.toFixed(3)}</text>`;
            }

            // Add X axis
            svg += `<line class="chart-axis" x1="0" y1="${chartHeight}" x2="${chartWidth}" y2="${chartHeight}" />`;

            // Add X axis labels (show every 3 hours to avoid crowding: 0, 3, 6, 9, 12, 15, 18, 21)
            for (let hour = 0; hour < 24; hour += 3) {
                const x = hour * barWidth + barWidth / 2;
                svg += `<text class="chart-axis-text" x="${x}" y="${chartHeight + 20}" text-anchor="middle">${formatHour(hour)}</text>`;
            }

            // Draw stacked bars for each hour
            for (let hour = 0; hour < 24; hour++) {
                const x = hour * barWidth;
                let yOffset = chartHeight;
                const hourLabel = formatHour(hour);

                sortedModels.forEach(modelInfo => {
                    const cost = modelInfo.costs[hour];
                    if (cost > 0) {
                        const barHeight = chartHeight - yScale(cost);
                        yOffset -= barHeight;
                        const modelLabel = escapeHtml(modelInfo.model);
                        svg += `<rect class="chart-bar" x="${x + 2}" y="${yOffset}" width="${barWidth - 4}" height="${barHeight}" fill="${modelInfo.color}"
                                     onmouseover="showChartTooltip(event, '${hourLabel}', '${modelLabel}', ${cost})"
                                     onmouseout="hideChartTooltip()" />`;
                    }
                });
            }

            // Add legend grouped by provider
            let legendY = 0;
            const legendX = chartWidth + 10;

            Object.entries(modelsByProvider).forEach(([provider, models]) => {
                // Add provider name
                svg += `<text class="chart-legend-text" x="${legendX}" y="${legendY + 8}" style="font-weight: bold;">${provider}</text>`;
                legendY += 18;

                // Add models for this provider
                models.forEach(m => {
                    svg += `
                        <circle cx="${legendX}" cy="${legendY + 4}" r="4" fill="${m.color}" />
                        <text class="chart-legend-text" x="${legendX + 10}" y="${legendY + 8}">${escapeHtml(m.model)}</text>
                    `;
                    legendY += 16;
                });

                legendY += 4; // Extra space between providers
            });

            svg += `
                    </g>
                </svg>
            `;

            // Display date as title
            const dateObj = new Date(date + 'T00:00:00');
            const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

            container.innerHTML = `
                <div class="chart-title">Hourly Usage - ${dateStr}</div>
                ${svg}
            `;
        }

        function renderChart(container, modelData, dates) {
            const width = container.offsetWidth - 140; // Subtract container padding (60 + 80)
            const height = 260;
            const margin = { top: 20, right: 0, bottom: 25, left: 0 };
            const chartWidth = width - margin.left - margin.right;
            const chartHeight = height - margin.top - margin.bottom;

            // Calculate scales
            const maxCost = Math.max(...modelData.flatMap(m => m.data.map(d => d.cost)), 0.0001);
            const minCost = 0;

            // Calculate bar width based on number of dates
            const barWidth = chartWidth / dates.length;

            // Y scale: cost to pixel (inverted because SVG Y increases downward)
            const yScale = (cost) => chartHeight - ((cost - minCost) / (maxCost - minCost)) * chartHeight;

            // Format date for display
            const formatDate = (dateStr) => {
                const date = new Date(dateStr + 'T00:00:00');
                return `${date.getMonth() + 1}/${date.getDate()}`;
            };

            // Create SVG
            let svg = `
                <svg class="chart-svg" viewBox="0 0 ${width} ${height + 40}" xmlns="http://www.w3.org/2000/svg">
                    <g transform="translate(${margin.left}, ${margin.top})">
            `;

            // Add grid lines
            const gridSteps = 5;
            for (let i = 0; i <= gridSteps; i++) {
                const y = (i / gridSteps) * chartHeight;
                svg += `<line class="chart-grid" x1="0" y1="${y}" x2="${chartWidth}" y2="${y}" />`;
            }

            // Add Y axis
            svg += `<line class="chart-axis" x1="0" y1="0" x2="0" y2="${chartHeight}" />`;
            for (let i = 0; i <= gridSteps; i++) {
                const y = (i / gridSteps) * chartHeight;
                const cost = maxCost - (i / gridSteps) * (maxCost - minCost);
                svg += `<text class="chart-axis-text" x="-10" y="${y + 4}" text-anchor="end">$${cost.toFixed(3)}</text>`;
            }

            // Add X axis
            svg += `<line class="chart-axis" x1="0" y1="${chartHeight}" x2="${chartWidth}" y2="${chartHeight}" />`;

            // Add X axis labels (show fewer labels to avoid crowding)
            const labelStep = Math.ceil(dates.length / 8);
            dates.forEach((date, i) => {
                if (i % labelStep === 0 || i === dates.length - 1) {
                    const x = i * barWidth + barWidth / 2;
                    svg += `<text class="chart-axis-text" x="${x}" y="${chartHeight + 20}" text-anchor="middle">${formatDate(date)}</text>`;
                }
            });

            // Draw stacked bars for each date
            dates.forEach((date, dateIndex) => {
                const x = dateIndex * barWidth;
                let yOffset = chartHeight;
                const dateLabel = formatDate(date);

                // Stack bars from each model for this date
                modelData.forEach(modelInfo => {
                    const dataPoint = modelInfo.data[dateIndex];
                    if (dataPoint && dataPoint.cost > 0) {
                        const barHeight = chartHeight - yScale(dataPoint.cost);
                        yOffset -= barHeight;
                        const modelLabel = escapeHtml(modelInfo.model);
                        svg += `<rect class="chart-bar" x="${x + 2}" y="${yOffset}" width="${barWidth - 4}" height="${barHeight}" fill="${modelInfo.color}"
                                     onmouseover="showChartTooltip(event, '${dateLabel}', '${modelLabel}', ${dataPoint.cost})"
                                     onmouseout="hideChartTooltip()" />`;
                    }
                });
            });

            svg += `
                    </g>
                </svg>
            `;

            // Add legend grouped by provider
            const modelsByProvider = {};
            modelData.forEach(m => {
                if (!modelsByProvider[m.provider]) {
                    modelsByProvider[m.provider] = [];
                }
                modelsByProvider[m.provider].push(m);
            });

            let legend = '';
            Object.entries(modelsByProvider).forEach(([provider, models]) => {
                // Create provider section as a grid item
                legend += `<div class="chart-legend-provider">`;
                legend += `<div class="chart-legend-provider-name">${provider}</div>`;

                // Add models for this provider
                models.forEach(m => {
                    const totalCost = m.data.reduce((sum, d) => sum + d.cost, 0);
                    legend += `
                        <div class="chart-legend-item">
                            <div class="chart-legend-color" style="background: ${m.color}"></div>
                            <div class="chart-legend-label">${escapeHtml(m.model)} ($${totalCost.toFixed(4)})</div>
                        </div>
                    `;
                });
                legend += `</div>`;
            });

            container.innerHTML = svg + `<div class="chart-legend">${legend}</div>`;
        }

        function showChartTooltip(event, date, provider, cost) {
            const tooltip = document.getElementById('chart-tooltip');
            if (cost === null) {
                // Badge tooltip (date is title, provider is description)
                tooltip.innerHTML = `
                    <div class="chart-tooltip-date">${date}</div>
                    <div class="chart-tooltip-item">
                        <span>${provider}</span>
                    </div>
                `;
            } else {
                // Chart tooltip (standard format)
                tooltip.innerHTML = `
                    <div class="chart-tooltip-date">${date}</div>
                    <div class="chart-tooltip-item">
                        <span>${provider}:</span>
                        <span>$${cost.toFixed(4)}</span>
                    </div>
                `;
            }
            tooltip.style.display = 'block';
            tooltip.style.left = (event.pageX + 10) + 'px';
            tooltip.style.top = (event.pageY - 30) + 'px';
        }

        function hideChartTooltip() {
            const tooltip = document.getElementById('chart-tooltip');
            tooltip.style.display = 'none';
        }

        function toggleProvider(provider) {
            if (hiddenProviders.has(provider)) {
                hiddenProviders.delete(provider);
            } else {
                hiddenProviders.add(provider);
            }
            renderProviderTrends();
        }

        async function refreshStats() {
            if (!alpineData) return;
            const query = alpineData.buildQuery(alpineData.dateFilter);

            // Fetch stats and daily data in parallel for faster loading
            const [statsRes, _] = await Promise.all([
                fetch(`/stats${query}`),
                renderProviderTrends() // Start chart fetch in parallel
            ]);
            const data = await statsRes.json();

            // Totals
            document.getElementById('totals').innerHTML = `
                <div class="metric">
                    <div class="metric-value">${data.totals.requests}</div>
                    <div class="metric-label">REQUESTS</div>
                </div>
                <div class="metric">
                    <div class="metric-value">$${data.totals.cost.toFixed(4)}</div>
                    <div class="metric-label">TOTAL COST</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${(data.totals.prompt_tokens + data.totals.completion_tokens).toLocaleString()}</div>
                    <div class="metric-label">TOTAL TOKENS</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${data.totals.avg_duration_ms.toFixed(0)}ms</div>
                    <div class="metric-label">AVG DURATION</div>
                </div>
            `;

            // By model - convert to sortable format and merge with performance data
            const performanceMap = new Map((data.performance || []).map(p => [p.model, p]));

            byModelData = data.by_model.map(m => {
                const perf = performanceMap.get(m.model);
                return [
                    m.model,                                    // 0: model
                    m.requests,                                 // 1: requests
                    m.cost,                                     // 2: cost
                    m.tokens,                                   // 3: tokens
                    m.cost / m.requests,                        // 4: avg cost per request
                    m.tokens / m.requests,                      // 5: avg tokens per request
                    perf ? perf.avg_tokens_per_sec : null,      // 6: speed (tokens/sec)
                    perf ? perf.avg_duration_ms : null          // 7: avg duration
                ];
            });

            if (!tableSortState['by-model']) {
                tableSortState['by-model'] = { column: null, direction: null, originalData: [...byModelData] };
            } else {
                tableSortState['by-model'].originalData = [...byModelData];
            }
            renderByModelTable(applySortIfNeeded('by-model', byModelData), tableSortState['by-model']);

            // By provider - convert to sortable format
            byProviderData = data.by_provider.map(p => [p.provider, p.requests, p.cost, p.tokens]);
            if (!tableSortState['by-provider']) {
                tableSortState['by-provider'] = { column: null, direction: null, originalData: [...byProviderData] };
            } else {
                tableSortState['by-provider'].originalData = [...byProviderData];
            }
            renderByProviderTable(applySortIfNeeded('by-provider', byProviderData), tableSortState['by-provider']);

            // Errors - convert to sortable format
            errorsData = data.recent_errors.map(e => [new Date(e.timestamp.endsWith('Z') || e.timestamp.includes('+') ? e.timestamp : e.timestamp + 'Z').getTime(), e.model, e.error, e.timestamp]);
            if (!tableSortState['errors']) {
                tableSortState['errors'] = { column: null, direction: null, originalData: [...errorsData] };
            } else {
                tableSortState['errors'].originalData = [...errorsData];
            }
            renderErrorsTable(applySortIfNeeded('errors', errorsData), tableSortState['errors']);
        }

        // Navigate to requests tab with filters
        function filterRequests(filters) {
            if (!alpineData) return;

            // Set the filters
            Object.assign(alpineData.requestFilters, filters);

            // Switch to requests tab
            alpineData.currentTab = 'requests';
        }

        function sortByModelTable(columnIndex) {
            sortTable('by-model', columnIndex, byModelData, renderByModelTable);
        }

        function renderByModelTable(data, sortState) {
            // Find best performers
            const validCostPerRequest = data.filter(r => r[4] != null);
            const validTokensPerRequest = data.filter(r => r[5] != null);
            const validSpeed = data.filter(r => r[6] != null);

            const mostEconomical = validCostPerRequest.length > 0
                ? validCostPerRequest.reduce((min, curr) => curr[4] < min[4] ? curr : min)[0]
                : null;
            const mostTokenRich = validTokensPerRequest.length > 0
                ? validTokensPerRequest.reduce((max, curr) => curr[5] > max[5] ? curr : max)[0]
                : null;
            const fastest = validSpeed.length > 0
                ? validSpeed.reduce((max, curr) => curr[6] > max[6] ? curr : max)[0]
                : null;

            const table = document.getElementById('by-model');
            table.innerHTML = `
                <thead>
                    <tr>
                        <th class="sortable" onclick="sortByModelTable(0)">Model</th>
                        <th class="sortable" onclick="sortByModelTable(1)">Requests</th>
                        <th class="sortable" onclick="sortByModelTable(2)">Total Cost</th>
                        <th class="sortable" onclick="sortByModelTable(3)">Tokens</th>
                        <th class="sortable" onclick="sortByModelTable(4)">$/Request</th>
                        <th class="sortable" onclick="sortByModelTable(5)">Tokens/Req</th>
                        <th class="sortable" onclick="sortByModelTable(6)">Speed</th>
                        <th class="sortable" onclick="sortByModelTable(7)">Duration</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => {
                        const badges = [];
                        if (row[0] === mostEconomical) badges.push('<span class="badge badge-economical" onmouseover="showChartTooltip(event, \'Most Economical\', \'Lowest cost per request\', null)" onmouseout="hideChartTooltip()">$</span>');
                        if (row[0] === mostTokenRich) badges.push('<span class="badge badge-tokens" onmouseover="showChartTooltip(event, \'Most Token-Rich\', \'Highest tokens per request\', null)" onmouseout="hideChartTooltip()">▰</span>');
                        if (row[0] === fastest) badges.push('<span class="badge badge-speed" onmouseover="showChartTooltip(event, \'Fastest\', \'Highest tokens per second\', null)" onmouseout="hideChartTooltip()">⚡︎</span>');

                        return `
                        <tr class="clickable-row" onclick="filterRequests({ model: '${escapeHtml(row[0])}', provider: '', search: '', minCost: '', maxCost: '' })">
                            <td>${escapeHtml(row[0])} ${badges.join(' ')}</td>
                            <td>${row[1]}</td>
                            <td>$${row[2].toFixed(4)}</td>
                            <td>${row[3].toLocaleString()}</td>
                            <td>$${row[4].toFixed(4)}</td>
                            <td>${Math.round(row[5]).toLocaleString()}</td>
                            <td>${row[6] != null ? row[6].toFixed(1) + ' tok/s' : '—'}</td>
                            <td>${row[7] != null ? Math.round(row[7]) + 'ms' : '—'}</td>
                        </tr>
                    `}).join('')}
                </tbody>
            `;
            updateSortIndicators(table, sortState);
        }

        function renderModelEfficiency(modelData) {
            const container = document.getElementById('model-efficiency');

            if (!modelData || modelData.length === 0) {
                container.innerHTML = '<div class="chart-empty">No model data available</div>';
                return;
            }

            // Calculate efficiency metrics
            const efficiencyData = modelData.map(row => ({
                model: row[0],
                requests: row[1],
                cost: row[2],
                tokens: row[3],
                avgCostPerRequest: row[2] / row[1],
                avgTokensPerRequest: row[3] / row[1]
            }));

            // Find most economical (lowest avg cost)
            const mostEconomical = efficiencyData.reduce((min, curr) =>
                curr.avgCostPerRequest < min.avgCostPerRequest ? curr : min
            );

            // Find most token-rich (highest avg tokens)
            const mostTokenRich = efficiencyData.reduce((max, curr) =>
                curr.avgTokensPerRequest > max.avgTokensPerRequest ? curr : max
            );

            // Render efficiency cards
            const cards = efficiencyData.map(data => {
                const isEconomical = data.model === mostEconomical.model;
                const isTokenRich = data.model === mostTokenRich.model;
                const highlightClass = isEconomical ? 'highlight-economical' : (isTokenRich ? 'highlight-tokens' : '');

                return `
                    <div class="efficiency-card ${highlightClass}">
                        <div class="efficiency-model-name">
                            ${data.model}
                            ${isEconomical ? '<span class="efficiency-badge economical">Most Economical</span>' : ''}
                            ${isTokenRich ? '<span class="efficiency-badge token-rich">Most Token-Rich</span>' : ''}
                        </div>
                        <div class="efficiency-metrics">
                            <div class="efficiency-metric">
                                <div class="efficiency-metric-label">Avg Cost/Request</div>
                                <div class="efficiency-metric-value">$${data.avgCostPerRequest.toFixed(4)}</div>
                            </div>
                            <div class="efficiency-metric">
                                <div class="efficiency-metric-label">Avg Tokens/Request</div>
                                <div class="efficiency-metric-value">${Math.round(data.avgTokensPerRequest).toLocaleString()}</div>
                            </div>
                            <div class="efficiency-metric">
                                <div class="efficiency-metric-label">Total Requests</div>
                                <div class="efficiency-metric-value">${data.requests.toLocaleString()}</div>
                            </div>
                            <div class="efficiency-metric">
                                <div class="efficiency-metric-label">Total Cost</div>
                                <div class="efficiency-metric-value">$${data.cost.toFixed(4)}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = `
                <div class="efficiency-grid">
                    ${cards}
                </div>
                <div class="efficiency-summary">
                    Most economical: <strong>${mostEconomical.model}</strong> at $${mostEconomical.avgCostPerRequest.toFixed(4)}/request
                    &nbsp;•&nbsp;
                    Most token-rich: <strong>${mostTokenRich.model}</strong> at ${Math.round(mostTokenRich.avgTokensPerRequest).toLocaleString()} tokens/request
                </div>
            `;
        }

        function renderModelPerformance(performanceData) {
            const container = document.getElementById('model-performance');

            if (!performanceData || performanceData.length === 0) {
                container.innerHTML = '<div class="chart-empty">No performance data available (requires requests with completion tokens)</div>';
                return;
            }

            // Find fastest model
            const fastest = performanceData.reduce((max, curr) =>
                curr.avg_tokens_per_sec > max.avg_tokens_per_sec ? curr : max
            );

            // Render performance cards
            const cards = performanceData.map(data => {
                const isFastest = data.model === fastest.model;
                const highlightClass = isFastest ? 'highlight-tokens' : '';

                return `
                    <div class="efficiency-card ${highlightClass}">
                        <div class="efficiency-model-name">
                            ${data.model}
                            ${isFastest ? '<span class="efficiency-badge token-rich">Fastest</span>' : ''}
                        </div>
                        <div class="efficiency-metrics">
                            <div class="efficiency-metric">
                                <div class="efficiency-metric-label">Avg Speed</div>
                                <div class="efficiency-metric-value">${data.avg_tokens_per_sec.toFixed(1)} tok/s</div>
                            </div>
                            <div class="efficiency-metric">
                                <div class="efficiency-metric-label">Speed Range</div>
                                <div class="efficiency-metric-value">${data.min_tokens_per_sec.toFixed(1)} - ${data.max_tokens_per_sec.toFixed(1)}</div>
                            </div>
                            <div class="efficiency-metric">
                                <div class="efficiency-metric-label">Avg Duration</div>
                                <div class="efficiency-metric-value">${Math.round(data.avg_duration_ms)}ms</div>
                            </div>
                            <div class="efficiency-metric">
                                <div class="efficiency-metric-label">Requests Measured</div>
                                <div class="efficiency-metric-value">${data.requests.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = `
                <div class="efficiency-grid">
                    ${cards}
                </div>
                <div class="efficiency-summary">
                    Fastest: <strong>${fastest.model}</strong> at ${fastest.avg_tokens_per_sec.toFixed(1)} tokens/second
                    &nbsp;•&nbsp;
                    Note: Duration includes network latency and prompt processing time
                </div>
            `;
        }

        function sortByProviderTable(columnIndex) {
            sortTable('by-provider', columnIndex, byProviderData, renderByProviderTable);
        }

        function renderByProviderTable(data, sortState) {
            const table = document.getElementById('by-provider');
            table.innerHTML = `
                <thead>
                    <tr>
                        <th class="sortable" onclick="sortByProviderTable(0)">Provider</th>
                        <th class="sortable" onclick="sortByProviderTable(1)">Requests</th>
                        <th class="sortable" onclick="sortByProviderTable(2)">Cost</th>
                        <th class="sortable" onclick="sortByProviderTable(3)">Tokens</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr class="clickable-row" onclick="filterRequests({ provider: '${escapeHtml(row[0])}', model: '', search: '', minCost: '', maxCost: '' })">
                            <td>${row[0]}</td>
                            <td>${row[1]}</td>
                            <td>$${row[2].toFixed(4)}</td>
                            <td>${row[3].toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            `;
            updateSortIndicators(table, sortState);
        }

        function sortErrorsTable(columnIndex) {
            sortTable('errors', columnIndex, errorsData, renderErrorsTable);
        }

        function renderErrorsTable(data, sortState) {
            const table = document.getElementById('errors');
            if (data.length === 0) {
                table.innerHTML = '<tr><td>No errors</td></tr>';
                return;
            }

            table.innerHTML = `
                <thead>
                    <tr>
                        <th class="sortable" onclick="sortErrorsTable(0)">Time</th>
                        <th class="sortable" onclick="sortErrorsTable(1)">Model</th>
                        <th class="sortable" onclick="sortErrorsTable(2)">Error</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr class="clickable-row" onclick="filterRequests({ model: '${escapeHtml(row[1])}', provider: '', search: '', minCost: '', maxCost: '' })">
                            <td>${new Date(row[3].endsWith('Z') || row[3].includes('+') ? row[3] : row[3] + 'Z').toLocaleString()}</td>
                            <td>${row[1]}</td>
                            <td class="error">${row[2]}</td>
                        </tr>
                    `).join('')}
                </tbody>
            `;
            updateSortIndicators(table, sortState);
        }

        async function clearErrors() {
            if (!confirm('Clear all errors from the database?')) return;
            await fetch('/errors', { method: 'DELETE' });
            refreshStats();
        }

        // Calendar functionality - multi-month scrollable with bar graphs
        let calendarData = {};
        let rangeSelectionStart = null;
        let rangeSelectionEnd = null;
        let isSelecting = false;

        function formatDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        async function loadCalendar() {
            if (!alpineData) return;

            const filter = alpineData.dateFilter;
            const timezoneOffset = -new Date().getTimezoneOffset();

            let startDate, endDate;

            if (filter.startDate && filter.endDate) {
                startDate = filter.startDate;
                endDate = filter.endDate;
            } else {
                const rangeRes = await fetch('/stats/date-range');
                const rangeData = await rangeRes.json();

                if (!rangeData.start_date || !rangeData.end_date) {
                    document.getElementById('calendar-container').innerHTML = '<div class="calendar-empty">No data available</div>';
                    return;
                }

                startDate = rangeData.start_date;
                endDate = rangeData.end_date;
            }

            const res = await fetch(`/stats/daily?start_date=${startDate}&end_date=${endDate}&timezone_offset=${timezoneOffset}`);
            const data = await res.json();

            calendarData = {};
            data.daily.forEach(day => {
                calendarData[day.date] = day;
            });

            renderAllMonths(startDate, endDate);
        }

        function renderAllMonths(startDate, endDate) {
            const container = document.getElementById('calendar-container');
            const start = new Date(startDate + 'T00:00:00');
            const end = new Date(endDate + 'T00:00:00');

            const monthsData = {};
            const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
            const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

            for (let d = new Date(startMonth); d <= endMonth; d.setMonth(d.getMonth() + 1)) {
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                monthsData[key] = {
                    year: d.getFullYear(),
                    month: d.getMonth()
                };
            }

            // Calculate intensity levels based on quartiles (GitHub style)
            const costs = Object.values(calendarData).map(d => d.cost).filter(c => c > 0);
            costs.sort((a, b) => a - b);

            const intensityLevels = {
                q1: costs[Math.floor(costs.length * 0.25)] || 0,
                q2: costs[Math.floor(costs.length * 0.50)] || 0,
                q3: costs[Math.floor(costs.length * 0.75)] || 0
            };

            let html = '';
            Object.values(monthsData).reverse().forEach(({ year, month }) => {
                html += renderMonth(year, month, intensityLevels);
            });

            container.innerHTML = html;
            attachCalendarListeners();
        }

        function renderMonth(year, month, intensityLevels) {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                              'July', 'August', 'September', 'October', 'November', 'December'];

            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const daysInMonth = lastDay.getDate();

            // Group days into weeks
            const weeks = [];
            let currentWeek = null;

            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month, day);
                const dateStr = formatDate(date);
                const dayOfWeek = date.getDay();

                if (dayOfWeek === 0 || day === 1) {
                    if (currentWeek) weeks.push(currentWeek);
                    const weekStart = getWeekStart(dateStr);
                    currentWeek = {
                        number: getWeekNumber(weekStart),
                        startDate: weekStart,
                        days: []
                    };
                }

                currentWeek.days.push({
                    date: dateStr,
                    dayNum: day,
                    data: calendarData[dateStr] || { requests: 0, cost: 0 }
                });
            }
            if (currentWeek) weeks.push(currentWeek);

            // Helper to get intensity level
            function getIntensityClass(cost) {
                if (cost === 0) return 'level-0';
                if (cost <= intensityLevels.q1) return 'level-1';
                if (cost <= intensityLevels.q2) return 'level-2';
                if (cost <= intensityLevels.q3) return 'level-3';
                return 'level-4';
            }

            let html = `
                <div class="calendar-month">
                  <h3 class="month-header">${monthNames[month]} ${year}</h3>
                  <div class="calendar-weeks">
            `;

            weeks.forEach((week, weekIndex) => {
                const weekEnd = getWeekEnd(week.startDate);
                const weekTotalCost = week.days.reduce((sum, d) => sum + d.data.cost, 0);
                const weekTotalRequests = week.days.reduce((sum, d) => sum + d.data.requests, 0);

                html += `
                    <div class="week-row" data-week-start="${week.startDate}">
                        <div class="week-label"
                             data-week-num="${week.number}"
                             title="Week ${week.number}: Click for week stats">
                            ${week.number}
                        </div>
                        <div class="week-grid">
                `;

                // Calculate how many leading/trailing empty squares needed
                // First day in this week's days array tells us where we start
                const firstDayInWeek = new Date(week.days[0].date + 'T00:00:00').getDay();
                const lastDayInWeek = new Date(week.days[week.days.length - 1].date + 'T00:00:00').getDay();

                // Add leading empty squares (days before first day of this week's data)
                for (let i = 0; i < firstDayInWeek; i++) {
                    html += `<div class="day-square empty"></div>`;
                }

                // Render GitHub-style squares for the week
                week.days.forEach(day => {
                    const intensityClass = getIntensityClass(day.data.cost);
                    const dayName = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });

                    html += `
                        <div class="day-square ${intensityClass}"
                             data-date="${day.date}"
                             title="${dayName} ${day.dayNum}: $${day.data.cost.toFixed(4)} (${day.data.requests} req)">
                        </div>
                    `;
                });

                // Add trailing empty squares (days after last day of this week's data)
                for (let i = lastDayInWeek; i < 6; i++) {
                    html += `<div class="day-square empty"></div>`;
                }

                html += `
                        </div>
                        <div class="week-total">
                            $${weekTotalCost.toFixed(2)}<br>
                            <span class="week-requests">${weekTotalRequests} req</span>
                        </div>
                    </div>
                `;
            });

            html += `</div></div>`;
            return html;
        }

        function attachCalendarListeners() {
            // Day square click handlers
            document.querySelectorAll('.day-square').forEach(el => {
                const date = el.dataset.date;
                el.addEventListener('mousedown', (e) => onCalendarDayMouseDown(date, e));
                el.addEventListener('mouseenter', () => onCalendarDayMouseEnter(date));
                el.addEventListener('mouseup', () => onCalendarDayMouseUp(date));
            });

            // Week row hover/click handlers
            document.querySelectorAll('.week-row').forEach(el => {
                const weekStart = el.dataset.weekStart;
                el.addEventListener('mouseenter', () => {
                    el.classList.add('week-highlighted');
                });
                el.addEventListener('mouseleave', () => {
                    el.classList.remove('week-highlighted');
                });
            });

            // Week label click handlers
            document.querySelectorAll('.week-label').forEach(el => {
                const weekStart = el.closest('.week-row').dataset.weekStart;
                el.addEventListener('click', () => onWeekClick(weekStart));
            });

            document.addEventListener('mouseup', handleCalendarGlobalMouseUp);
        }

        function getWeekNumber(dateStr) {
            const date = new Date(dateStr + 'T00:00:00');
            const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
            const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
            return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
        }

        function getWeekStart(dateStr) {
            const date = new Date(dateStr + 'T00:00:00');
            const day = date.getDay();
            const diff = date.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(date.setDate(diff));
            return monday.toISOString().split('T')[0];
        }

        function getWeekEnd(dateStr) {
            const start = getWeekStart(dateStr);
            const startDate = new Date(start + 'T00:00:00');
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            return endDate.toISOString().split('T')[0];
        }

        function onCalendarDayClick(date) {
            if (!alpineData) return;
            alpineData.dateFilter.startDate = date;
            alpineData.dateFilter.endDate = date;
            alpineData.currentTab = 'stats';
            window.location.hash = 'stats';
        }

        function onWeekClick(weekStartDate) {
            if (!alpineData) return;
            const weekEnd = getWeekEnd(weekStartDate);
            alpineData.dateFilter.startDate = weekStartDate;
            alpineData.dateFilter.endDate = weekEnd;
            alpineData.currentTab = 'stats';
            window.location.hash = 'stats';
        }

        function onCalendarDayMouseDown(date, event) {
            event.stopPropagation();
            rangeSelectionStart = date;
            rangeSelectionEnd = date;
            isSelecting = true;
            updateCalendarRangeSelection();
        }

        function onCalendarDayMouseEnter(date) {
            if (!isSelecting) return;
            rangeSelectionEnd = date;
            updateCalendarRangeSelection();
        }

        function onCalendarDayMouseUp(date) {
            if (!isSelecting) return;
            isSelecting = false;

            if (rangeSelectionStart === rangeSelectionEnd) {
                onCalendarDayClick(date);
            } else {
                const [start, end] = [rangeSelectionStart, rangeSelectionEnd].sort();
                if (alpineData) {
                    alpineData.dateFilter.startDate = start;
                    alpineData.dateFilter.endDate = end;
                    alpineData.currentTab = 'stats';
                    window.location.hash = 'stats';
                }
            }
            clearCalendarRangeSelection();
        }

        function handleCalendarGlobalMouseUp() {
            if (isSelecting) {
                onCalendarDayMouseUp(rangeSelectionEnd);
            }
        }

        function updateCalendarRangeSelection() {
            document.querySelectorAll('.day-square').forEach(el => {
                el.classList.remove('range-selecting');
            });

            if (!rangeSelectionStart || !rangeSelectionEnd) return;

            const [start, end] = [rangeSelectionStart, rangeSelectionEnd].sort();
            const startDate = new Date(start + 'T00:00:00');
            const endDate = new Date(end + 'T00:00:00');

            document.querySelectorAll('.day-square').forEach(el => {
                const dateStr = el.dataset.date;
                if (!dateStr) return;
                const date = new Date(dateStr + 'T00:00:00');
                if (date >= startDate && date <= endDate) {
                    el.classList.add('range-selecting');
                }
            });
        }

        function clearCalendarRangeSelection() {
            rangeSelectionStart = null;
            rangeSelectionEnd = null;
            document.querySelectorAll('.day-square').forEach(el => {
                el.classList.remove('range-selecting');
            });
        }

        // Auto-refresh stats every 5 seconds (uses current filter state)
        setInterval(() => {
            if (alpineData && alpineData.currentTab === 'stats') {
                refreshStats();
            }
        }, 5000);

        // Load initial tab data after Alpine initializes
        document.addEventListener('alpine:initialized', () => {
            const initialTab = localStorage.getItem('_x_currentTab')?.replace(/['"]/g, '') || 'stats';
            onTabChange(initialTab);
        });

        // Handle browser back/forward navigation
        window.addEventListener('popstate', () => {
            if (!alpineData) return;
            const hash = window.location.hash.slice(1);
            if (hash && ['stats', 'calendar', 'models', 'requests'].includes(hash)) {
                alpineData.currentTab = hash;
            } else if (!hash) {
                // No hash means navigate to default (stats)
                alpineData.currentTab = 'stats';
            }
        });

        // Model Management Modal Functions
        // Wizard state
        let wizardState = {
            currentStep: 1,
            selectedProvider: null,
            selectedModel: null,
            providers: [],
            models: []
        };

        // Provider documentation URLs
        function getProviderUrl(providerName) {
            const urls = {
                'openai': 'https://platform.openai.com/docs/models',
                'anthropic': 'https://docs.anthropic.com/claude/docs/models-overview',
                'google': 'https://ai.google.dev/gemini-api/docs/models/gemini',
                'gemini': 'https://ai.google.dev/gemini-api/docs/models/gemini',
                'cohere': 'https://docs.cohere.com/docs/models',
                'mistral': 'https://docs.mistral.ai/getting-started/models/',
                'azure': 'https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models',
                'bedrock': 'https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html',
                'vertex_ai': 'https://cloud.google.com/vertex-ai/docs/generative-ai/learn/models',
                'groq': 'https://console.groq.com/docs/models',
                'together_ai': 'https://docs.together.ai/docs/inference-models',
                'fireworks_ai': 'https://docs.fireworks.ai/guides/querying-text-models',
                'replicate': 'https://replicate.com/explore',
                'perplexity': 'https://docs.perplexity.ai/docs/model-cards',
                'deepseek': 'https://platform.deepseek.com/api-docs/',
                'xai': 'https://docs.x.ai/docs',
                'openrouter': 'https://openrouter.ai/docs#models'
            };
            return urls[providerName] || `https://docs.litellm.ai/docs/providers/${providerName}`;
        }

        async function openAddModelModal() {
            // Reset wizard state
            wizardState = {
                currentStep: 1,
                selectedProvider: null,
                selectedModel: null,
                providers: [],
                models: []
            };

            // Reset form inputs
            document.getElementById('model-name-input').value = '';
            document.getElementById('api-key-env-input').value = '';
            document.getElementById('model-enabled-input').checked = true;
            document.getElementById('temperature-input').value = '';
            document.getElementById('max-tokens-input').value = '';
            document.getElementById('timeout-input').value = '';
            document.getElementById('retries-input').value = '';

            // Load providers
            try {
                const res = await fetch('/api/providers');
                if (!res.ok) throw new Error('Failed to fetch providers');
                const data = await res.json();
                wizardState.providers = data.providers;
                await renderProviderList(data.providers);
            } catch (error) {
                console.error('Error loading providers:', error);
                alert('Failed to load providers: ' + error.message);
                return;
            }

            // Show modal at step 1
            showWizardStep(1);
            const modal = document.getElementById('add-model-modal');
            modal.classList.add('show');
        }

        function closeAddModelModal() {
            const modal = document.getElementById('add-model-modal');
            modal.classList.remove('show');
        }

        function showWizardStep(step) {
            wizardState.currentStep = step;

            // Hide all steps
            for (let i = 1; i <= 3; i++) {
                document.getElementById(`wizard-step-${i}`).style.display = 'none';
            }

            // Show current step
            document.getElementById(`wizard-step-${step}`).style.display = 'block';

            // Update progress indicators
            document.querySelectorAll('.wizard-step').forEach((el, idx) => {
                const stepNum = idx + 1;
                if (stepNum < step) {
                    el.classList.add('completed');
                    el.classList.remove('active');
                } else if (stepNum === step) {
                    el.classList.add('active');
                    el.classList.remove('completed');
                } else {
                    el.classList.remove('active', 'completed');
                }
            });

            // Update button visibility
            const backBtn = document.getElementById('wizard-back-btn');
            const nextBtn = document.getElementById('wizard-next-btn');
            const submitBtn = document.getElementById('wizard-submit-btn');

            backBtn.style.display = step > 1 ? 'inline-block' : 'none';
            nextBtn.style.display = step < 3 ? 'inline-block' : 'none';
            submitBtn.style.display = step === 3 ? 'inline-block' : 'none';

            // Update button enabled state
            updateNextButtonState();
        }

        function updateNextButtonState() {
            const nextBtn = document.getElementById('wizard-next-btn');
            const submitBtn = document.getElementById('wizard-submit-btn');

            if (wizardState.currentStep === 1) {
                nextBtn.disabled = !wizardState.selectedProvider;
            } else if (wizardState.currentStep === 2) {
                nextBtn.disabled = !wizardState.selectedModel;
            } else if (wizardState.currentStep === 3) {
                const modelName = document.getElementById('model-name-input').value.trim();
                const apiKeyEnv = document.getElementById('api-key-env-input').value.trim();
                submitBtn.disabled = !modelName || !apiKeyEnv;
            }
        }

        async function renderProviderList(providers) {
            // Get active providers from current models
            const modelsRes = await fetch('/models');
            const modelsData = await modelsRes.json();
            const activeProviders = new Set(modelsData.models.map(m => m.provider));

            // Sort: active providers first, then alphabetically
            const sortedProviders = [...providers].sort((a, b) => {
                const aActive = activeProviders.has(a.name);
                const bActive = activeProviders.has(b.name);

                if (aActive && !bActive) return -1;
                if (!aActive && bActive) return 1;
                return a.display_name.localeCompare(b.display_name);
            });

            const container = document.getElementById('provider-list');
            container.innerHTML = sortedProviders.map(provider => {
                const isActive = activeProviders.has(provider.name);
                const activeBadge = isActive ? '<span class="badge-active">Active</span>' : '';
                const providerUrl = getProviderUrl(provider.name);
                return `
                    <div class="provider-card" data-provider="${provider.name}" onclick="selectProvider('${provider.name}')">
                        <div class="provider-name">
                            ${provider.display_name} ${activeBadge}
                            <a href="${providerUrl}" target="_blank" class="provider-link" onclick="event.stopPropagation()" title="View ${provider.display_name} documentation">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                    <polyline points="15 3 21 3 21 9"></polyline>
                                    <line x1="10" y1="14" x2="21" y2="3"></line>
                                </svg>
                            </a>
                        </div>
                        <div class="provider-count">${provider.model_count} models</div>
                    </div>
                `;
            }).join('');

            // Setup search
            const searchInput = document.getElementById('provider-search');
            searchInput.value = '';
            searchInput.oninput = () => filterProviders(searchInput.value.toLowerCase());
        }

        function filterProviders(searchTerm) {
            const cards = document.querySelectorAll('.provider-card');
            cards.forEach(card => {
                const providerName = card.querySelector('.provider-name').textContent.toLowerCase();
                card.style.display = providerName.includes(searchTerm) ? 'block' : 'none';
            });
        }

        async function selectProvider(providerName) {
            wizardState.selectedProvider = providerName;

            // Highlight selected provider
            document.querySelectorAll('.provider-card').forEach(card => {
                card.classList.remove('selected');
            });
            document.querySelector(`.provider-card[data-provider="${providerName}"]`).classList.add('selected');

            // Load models for this provider
            try {
                const res = await fetch(`/api/providers/${providerName}/models`);
                if (!res.ok) throw new Error('Failed to fetch models');
                const data = await res.json();
                wizardState.models = data.models;
                updateNextButtonState();
            } catch (error) {
                console.error('Error loading models:', error);
                alert('Failed to load models: ' + error.message);
            }
        }

        async function wizardNext() {
            if (wizardState.currentStep === 1) {
                // Moving from provider to model selection
                const providerDisplayName = wizardState.providers.find(p => p.name === wizardState.selectedProvider)?.display_name || wizardState.selectedProvider;
                document.getElementById('selected-provider-name').textContent = providerDisplayName;

                // Set provider docs link
                const docsLink = document.getElementById('provider-docs-link');
                docsLink.href = getProviderUrl(wizardState.selectedProvider);
                docsLink.title = `View ${providerDisplayName} documentation`;

                await renderModelList(wizardState.models);
                showWizardStep(2);
            } else if (wizardState.currentStep === 2) {
                // Moving from model to configuration
                populateConfigurationStep();
                showWizardStep(3);
            }
        }

        function wizardBack() {
            if (wizardState.currentStep > 1) {
                showWizardStep(wizardState.currentStep - 1);
            }
        }

        async function renderModelList(models) {
            // Get configured models to show which are already in use
            const configuredRes = await fetch('/models');
            const configuredData = await configuredRes.json();

            // Create a map of litellm_model -> configured names
            // Handle both formats: "provider/model" and "model"
            const configuredMap = {};
            configuredData.models.forEach(m => {
                const litellmModel = m.litellm_model;
                // Store with full path
                if (!configuredMap[litellmModel]) {
                    configuredMap[litellmModel] = new Set();
                }
                configuredMap[litellmModel].add(m.name);

                // Also store without provider prefix for matching
                const modelWithoutProvider = litellmModel.includes('/') ? litellmModel.split('/')[1] : litellmModel;
                if (!configuredMap[modelWithoutProvider]) {
                    configuredMap[modelWithoutProvider] = new Set();
                }
                configuredMap[modelWithoutProvider].add(m.name);
            });

            // Sort: configured models first, then by name
            const sortedModels = [...models].sort((a, b) => {
                const aConfigured = configuredMap[a.litellm_id] && configuredMap[a.litellm_id].size > 0;
                const bConfigured = configuredMap[b.litellm_id] && configuredMap[b.litellm_id].size > 0;

                if (aConfigured && !bConfigured) return -1;
                if (!aConfigured && bConfigured) return 1;
                return a.name.localeCompare(b.name);
            });

            const container = document.getElementById('model-list');
            container.innerHTML = sortedModels.map(model => {
                const escapedId = model.litellm_id.replace(/'/g, "\\'");
                const configuredNames = Array.from(configuredMap[model.litellm_id] || []);
                const configuredBadges = configuredNames.length > 0
                    ? configuredNames.map(name => `<span class="badge-configured" title="Already configured as '${name}'">${name}</span>`).join('')
                    : '';

                return `
                    <div class="model-card" data-model-id="${escapedId}"
                         data-name="${model.name.toLowerCase()}"
                         data-input-cost="${model.input_cost_per_million}"
                         data-output-cost="${model.output_cost_per_million}"
                         onclick="selectModel('${escapedId}')">
                        <div class="model-name">
                            ${model.name}
                            ${configuredBadges}
                        </div>
                        <div class="model-details">
                            <div class="model-cost-row">
                                <span>In: $${model.input_cost_per_million.toFixed(2)}/M</span>
                                <span>Out: $${model.output_cost_per_million.toFixed(2)}/M</span>
                            </div>
                            ${model.max_tokens ? `<div class="model-tokens">${model.max_tokens.toLocaleString()} tokens</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            // Setup search
            const searchInput = document.getElementById('model-search');
            searchInput.value = '';
            searchInput.oninput = () => filterModels(searchInput.value.toLowerCase());

            // Reset sort dropdown
            document.getElementById('model-sort-select').value = 'name';
        }

        function sortModels(models, sortBy) {
            return [...models].sort((a, b) => {
                if (sortBy === 'name') {
                    return a.name.localeCompare(b.name);
                } else if (sortBy === 'input-cost') {
                    return a.input_cost_per_million - b.input_cost_per_million;
                } else if (sortBy === 'output-cost') {
                    return a.output_cost_per_million - b.output_cost_per_million;
                }
                return 0;
            });
        }

        function sortModelList() {
            const sortBy = document.getElementById('model-sort-select').value;
            const sortedModels = sortModels(wizardState.models, sortBy);

            const container = document.getElementById('model-list');
            const cards = Array.from(container.querySelectorAll('.model-card'));

            // Sort the DOM elements
            sortedModels.forEach(model => {
                const escapedId = model.litellm_id.replace(/'/g, "\\'");
                const card = container.querySelector(`.model-card[data-model-id="${escapedId}"]`);
                if (card) {
                    container.appendChild(card);
                }
            });
        }

        function filterModels(searchTerm) {
            const cards = document.querySelectorAll('.model-card');
            cards.forEach(card => {
                const modelName = card.querySelector('.model-name').textContent.toLowerCase();
                card.style.display = modelName.includes(searchTerm) ? 'block' : 'none';
            });
        }

        function selectModel(litellmId) {
            wizardState.selectedModel = wizardState.models.find(m => m.litellm_id === litellmId);

            // Highlight selected model
            document.querySelectorAll('.model-card').forEach(card => {
                card.classList.remove('selected');
            });
            document.querySelector(`.model-card[data-model-id="${litellmId}"]`).classList.add('selected');

            updateNextButtonState();
        }

        function populateConfigurationStep() {
            const model = wizardState.selectedModel;

            // Populate summary
            document.getElementById('summary-litellm-model').textContent = model.litellm_id;
            document.getElementById('summary-input-cost').textContent = `$${model.input_cost_per_million.toFixed(2)}/1M tokens`;
            document.getElementById('summary-output-cost').textContent = `$${model.output_cost_per_million.toFixed(2)}/1M tokens`;
            document.getElementById('summary-max-tokens').textContent = model.max_tokens || 'N/A';

            // Suggest model name and API key based on provider
            const suggestedName = model.name.replace(/\//g, '-').toLowerCase();
            document.getElementById('model-name-input').value = suggestedName;

            // Suggest API key env var based on provider
            const apiKeyMap = {
                'openai': 'OPENAI_API_KEY',
                'anthropic': 'ANTHROPIC_API_KEY',
                'google': 'GOOGLE_API_KEY',
                'gemini': 'GOOGLE_API_KEY',
                'cohere': 'COHERE_API_KEY',
                'mistral': 'MISTRAL_API_KEY',
                'azure': 'AZURE_API_KEY'
            };
            const suggestedApiKey = apiKeyMap[wizardState.selectedProvider] || `${wizardState.selectedProvider.toUpperCase()}_API_KEY`;
            document.getElementById('api-key-env-input').value = suggestedApiKey;

            // Add input listeners to update submit button state
            document.getElementById('model-name-input').oninput = updateNextButtonState;
            document.getElementById('api-key-env-input').oninput = updateNextButtonState;
        }

        async function submitAddModel() {
            const modelName = document.getElementById('model-name-input').value.trim();
            const apiKeyEnv = document.getElementById('api-key-env-input').value.trim();
            const enabled = document.getElementById('model-enabled-input').checked;
            const temperature = document.getElementById('temperature-input').value;
            const maxTokens = document.getElementById('max-tokens-input').value;
            const timeout = document.getElementById('timeout-input').value;
            const retries = document.getElementById('retries-input').value;

            if (!modelName || !apiKeyEnv) {
                alert('Please fill in all required fields');
                return;
            }

            const payload = {
                model_name: modelName,
                litellm_model: wizardState.selectedModel.litellm_id,
                api_key_env: apiKeyEnv,
                enabled: enabled
            };

            // Add optional fields if provided
            if (temperature) payload.temperature = parseFloat(temperature);
            if (maxTokens) payload.max_tokens = parseInt(maxTokens);
            if (timeout) payload.timeout = parseInt(timeout);
            if (retries) payload.num_retries = parseInt(retries);

            try {
                const res = await fetch('/api/models', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const error = await res.json();
                    alert('Error: ' + (error.error || 'Failed to add model'));
                    return;
                }

                // Success - close modal and reload models
                closeAddModelModal();
                showToast(`Model ${modelName} added successfully`);
                await loadModels();
            } catch (error) {
                console.error('Error adding model:', error);
                alert('Failed to add model: ' + error.message);
            }
        }

        // Close modal when clicking outside
        document.addEventListener('click', function(event) {
            const addModal = document.getElementById('add-model-modal');
            if (event.target === addModal) {
                closeAddModelModal();
            }
        });

        async function openExportModal() {
            try {
                const res = await fetch('/api/export/obsidian');
                if (!res.ok) {
                    throw new Error('Failed to fetch export data');
                }

                const data = await res.json();

                // Update modal content
                document.getElementById('export-count').textContent = data.models.length;
                document.getElementById('export-json').textContent = JSON.stringify(data, null, 2);

                // Show modal
                const modal = document.getElementById('export-modal');
                modal.classList.add('show');
            } catch (error) {
                console.error('Error opening export modal:', error);
                alert('Failed to generate export: ' + error.message);
            }
        }

        function closeExportModal() {
            const modal = document.getElementById('export-modal');
            modal.classList.remove('show');
        }

        async function copyExportJson() {
            const jsonText = document.getElementById('export-json').textContent;

            try {
                await navigator.clipboard.writeText(jsonText);
                showToast('Copied to clipboard!');
            } catch (error) {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = jsonText;
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                    showToast('Copied to clipboard!');
                } catch (err) {
                    alert('Failed to copy to clipboard');
                }
                document.body.removeChild(textarea);
            }
        }

        // Close modal when clicking outside
        document.addEventListener('click', function(event) {
            const modal = document.getElementById('export-modal');
            if (event.target === modal) {
                closeExportModal();
            }
        });
