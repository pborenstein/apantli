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

        let expandedRequests = new Set();
        let detailViewMode = {}; // Track view mode per request: 'conversation' or 'json'

        // Table sorting state: { tableId: { column: index, direction: 'asc'|'desc'|null, originalData: [] } }
        let tableSortState = {};

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

        // Render conversation view
        function renderConversationView(requestObj) {
            const messages = extractConversation(requestObj);
            if (!messages) {
                return '<p class="error">Could not extract conversation from request/response data</p>';
            }

            let html = '<div class="conversation-view">';

            messages.forEach((msg, index) => {
                const icon = msg.role === 'user' ? '⊙' : msg.role === 'assistant' ? '◈' : '⚙';
                const roleLabel = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
                const tokens = estimateTokens(msg.content);
                const formattedContent = formatMessageContent(msg.content);

                html += `
                    <div class="message">
                        <div class="message-icon">${icon}</div>
                        <div class="message-content">
                            <div class="message-header">
                                <div>
                                    <span class="message-role">${roleLabel}</span>
                                    <span class="message-meta">~${tokens.toLocaleString()} tokens</span>
                                </div>
                                <button class="copy-btn" onclick="copyToClipboard(\`${escapeHtml(msg.content).replace(/`/g, '\\`')}\`, this)">Copy</button>
                            </div>
                            <div class="message-text">${formattedContent}</div>
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
                    <b>Request:</b>
                    <div class="json-view json-tree">${requestHtml}</div>
                    <b>Response:</b>
                    <div class="json-view json-tree">${responseHtml}</div>
                `;
            }

            // Update toggle buttons
            detailRow.querySelectorAll('.toggle-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.mode === mode) {
                    btn.classList.add('active');
                }
            });
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

            // Convert to array format for sorting: [name, provider, litellm_model, input_cost, output_cost]
            modelsData = data.models.map(m => [
                m.name,
                m.provider,
                m.litellm_model,
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
                        <th class="sortable" onclick="sortModelsTable(3)">Input Cost/1M</th>
                        <th class="sortable" onclick="sortModelsTable(4)">Output Cost/1M</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr>
                            <td>${row[0]}</td>
                            <td>${row[1]}</td>
                            <td>${row[2]}</td>
                            <td>${row[3] ? '$' + row[3].toFixed(2) : 'N/A'}</td>
                            <td>${row[4] ? '$' + row[4].toFixed(2) : 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            `;
            updateSortIndicators(table, sortState);
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
                    new Date(r.timestamp).getTime(), // For sorting by time
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

        function populateFilterDropdowns() {
            // Get unique providers from current page data
            const providers = [...new Set(requestsObjects.map(r => r.provider).filter(Boolean))].sort();
            const providerSelect = document.getElementById('filter-provider');
            const currentProvider = alpineData.requestFilters.provider;
            providerSelect.innerHTML = '<option value="">All</option>';
            providers.forEach(p => {
                const option = document.createElement('option');
                option.value = p;
                option.textContent = p;
                if (p === currentProvider) option.selected = true;
                providerSelect.appendChild(option);
            });

            // Get unique models from current page data
            const models = [...new Set(requestsObjects.map(r => r.model).filter(Boolean))].sort();
            const modelSelect = document.getElementById('filter-model');
            const currentModel = alpineData.requestFilters.model;
            modelSelect.innerHTML = '<option value="">All</option>';
            models.forEach(m => {
                const option = document.createElement('option');
                option.value = m;
                option.textContent = m;
                if (m === currentModel) option.selected = true;
                modelSelect.appendChild(option);
            });
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
            sortTable('requests-list', columnIndex, requestsData, renderRequestsTable);
        }

        function renderRequestsTable(data, sortState) {
            const tbody = document.createElement('tbody');

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

                // Create main row
                const mainRow = document.createElement('tr');
                mainRow.className = 'request-row';
                mainRow.onclick = () => toggleDetail(requestId);
                mainRow.innerHTML = `
                    <td>${escapeHtml(new Date(timestamp).toLocaleString())}</td>
                    <td>${escapeHtml(row[1])}</td>
                    <td>${row[2].toLocaleString()}</td>
                    <td>$${row[3].toFixed(4)}</td>
                    <td>${row[4]}ms</td>
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
            updateSortIndicators(table, sortState);
        }

        function toggleDetail(id) {
            const row = document.getElementById('detail-' + id);
            if (row) {
                const isHidden = row.style.display === 'none' || !row.style.display;
                row.style.display = isHidden ? 'table-row' : 'none';

                // Track expanded state
                if (isHidden) {
                    expandedRequests.add(id);
                } else {
                    expandedRequests.delete(id);
                }
            }
        }

        // Make Alpine data accessible to functions
        let alpineData = null;
        document.addEventListener('alpine:initialized', () => {
            alpineData = Alpine.$data(document.body);
            // Trigger initial data load now that Alpine is ready
            onTabChange(alpineData.currentTab || 'stats');
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
                    const allDates = dailyData.map(d => d.date);
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
            const width = container.offsetWidth - 40; // Account for padding
            const height = 300;
            const margin = { top: 20, right: 80, bottom: 60, left: 60 };
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

                sortedModels.forEach(modelInfo => {
                    const cost = modelInfo.costs[hour];
                    if (cost > 0) {
                        const barHeight = chartHeight - yScale(cost);
                        yOffset -= barHeight;
                        svg += `<rect class="chart-bar" x="${x + 2}" y="${yOffset}" width="${barWidth - 4}" height="${barHeight}" fill="${modelInfo.color}" />`;
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
            // Need at least 3 data points for a meaningful trend chart
            if (dates.length < 3) {
                container.innerHTML = `
                    <div class="chart-empty">
                        <p>Not enough data for trends chart</p>
                        <p class="chart-empty-hint">Charts require at least 3 days of data. Keep using Apantli to see trends!</p>
                    </div>
                `;
                return;
            }

            const width = container.offsetWidth - 40; // Account for padding
            const height = 300;
            const margin = { top: 20, right: 80, bottom: 60, left: 60 };
            const chartWidth = width - margin.left - margin.right;
            const chartHeight = height - margin.top - margin.bottom;

            // Calculate scales
            const maxCost = Math.max(...modelData.flatMap(m => m.data.map(d => d.cost)), 0.0001);
            const minCost = 0;

            // X scale: date to pixel
            const xScale = (dateIndex) => (dateIndex / (dates.length - 1 || 1)) * chartWidth;

            // Y scale: cost to pixel (inverted because SVG Y increases downward)
            const yScale = (cost) => chartHeight - ((cost - minCost) / (maxCost - minCost)) * chartHeight;

            // Format date for display
            const formatDate = (dateStr) => {
                const date = new Date(dateStr);
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
                    const x = xScale(i);
                    svg += `<text class="chart-axis-text" x="${x}" y="${chartHeight + 20}" text-anchor="middle">${formatDate(date)}</text>`;
                }
            });

            // Draw lines for each model
            modelData.forEach(modelInfo => {
                const color = modelInfo.color;

                // Generate path
                const pathData = modelInfo.data.map((d, i) => {
                    const x = xScale(i);
                    const y = yScale(d.cost);
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                }).join(' ');

                svg += `<path class="chart-line" d="${pathData}" stroke="${color}" />`;

                // Add dots
                modelInfo.data.forEach((d, i) => {
                    if (d.cost > 0) {
                        const x = xScale(i);
                        const y = yScale(d.cost);
                        const modelLabel = escapeHtml(modelInfo.model);
                        svg += `
                            <circle class="chart-dot" cx="${x}" cy="${y}" r="3" stroke="${color}"
                                    onmouseover="showChartTooltip(event, '${d.date}', '${modelLabel}', ${d.cost})"
                                    onmouseout="hideChartTooltip()" />
                        `;
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
                // Add provider header
                legend += `<div style="width: 100%; font-weight: bold; margin-top: 8px; color: var(--color-text);">${provider}</div>`;

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
            });

            container.innerHTML = svg + `<div class="chart-legend">${legend}</div>`;
        }

        function showChartTooltip(event, date, provider, cost) {
            const tooltip = document.getElementById('chart-tooltip');
            tooltip.innerHTML = `
                <div class="chart-tooltip-date">${date}</div>
                <div class="chart-tooltip-item">
                    <span>${provider}:</span>
                    <span>$${cost.toFixed(4)}</span>
                </div>
            `;
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

            // Provider breakdown visualization with model segments
            const totalCost = data.totals.cost;

            let providerHtml = '';
            if (data.by_model.length > 0 && totalCost > 0) {
                // Group models by provider
                const modelsByProvider = {};
                data.by_model.forEach(m => {
                    if (!modelsByProvider[m.provider]) {
                        modelsByProvider[m.provider] = [];
                    }
                    modelsByProvider[m.provider].push(m);
                });

                // Sort providers by total cost
                const providerTotals = Object.entries(modelsByProvider).map(([provider, models]) => ({
                    provider,
                    models,
                    totalCost: models.reduce((sum, m) => sum + m.cost, 0),
                    totalRequests: models.reduce((sum, m) => sum + m.requests, 0)
                })).sort((a, b) => b.totalCost - a.totalCost);

                providerHtml = providerTotals.map(p => {
                    const providerPercentage = (p.totalCost / totalCost * 100);

                    // Sort models by cost within provider and assign colors
                    const sortedModels = p.models.sort((a, b) => b.cost - a.cost);
                    sortedModels.forEach((m, index) => {
                        m.color = getModelColor(p.provider, index, sortedModels.length);
                    });

                    // Create segmented bar
                    const segments = sortedModels.map(m => {
                        const modelPercentage = (m.cost / totalCost * 100);
                        const modelLabel = escapeHtml(m.model);
                        return `<div class="bar-segment" style="width: ${modelPercentage}%; background: ${m.color}; cursor: pointer;"
                                     onmouseover="showChartTooltip(event, '${p.provider}', '${modelLabel}', ${m.cost})"
                                     onmouseout="hideChartTooltip()"></div>`;
                    }).join('');

                    // Model details list
                    const modelDetails = sortedModels.map(m =>
                        `<span style="color: ${m.color};">●</span> ${escapeHtml(m.model)}: $${m.cost.toFixed(4)} (${m.requests} req)`
                    ).join(' • ');

                    return `
                        <div class="provider-bar">
                            <div class="provider-header">
                                <span class="provider-name">${p.provider}</span>
                                <span class="provider-percentage">${providerPercentage.toFixed(0)}%</span>
                            </div>
                            <div class="bar-container">
                                ${segments}
                            </div>
                            <div class="provider-details">
                                $${p.totalCost.toFixed(4)} across ${p.totalRequests} requests ($${(p.totalCost / p.totalRequests).toFixed(4)} per request)
                            </div>
                            <div class="provider-details" style="font-size: 11px; margin-top: 4px;">
                                ${modelDetails}
                            </div>
                        </div>
                    `;
                }).join('');

                providerHtml += `<div style="margin-top: 20px; font-weight: bold;">Total: $${totalCost.toFixed(4)} (${data.totals.requests} requests)</div>`;
            } else {
                providerHtml = '<div style="color: #666;">No data available</div>';
            }

            document.getElementById('provider-breakdown').innerHTML = providerHtml;

            // By model - convert to sortable format
            byModelData = data.by_model.map(m => [m.model, m.requests, m.cost, m.tokens]);
            if (!tableSortState['by-model']) {
                tableSortState['by-model'] = { column: null, direction: null, originalData: [...byModelData] };
            } else {
                tableSortState['by-model'].originalData = [...byModelData];
            }
            renderByModelTable(applySortIfNeeded('by-model', byModelData), tableSortState['by-model']);

            // Model efficiency
            renderModelEfficiency(byModelData);

            // Model performance (speed)
            renderModelPerformance(data.performance || []);

            // By provider - convert to sortable format
            byProviderData = data.by_provider.map(p => [p.provider, p.requests, p.cost, p.tokens]);
            if (!tableSortState['by-provider']) {
                tableSortState['by-provider'] = { column: null, direction: null, originalData: [...byProviderData] };
            } else {
                tableSortState['by-provider'].originalData = [...byProviderData];
            }
            renderByProviderTable(applySortIfNeeded('by-provider', byProviderData), tableSortState['by-provider']);

            // Errors - convert to sortable format
            errorsData = data.recent_errors.map(e => [new Date(e.timestamp).getTime(), e.model, e.error, e.timestamp]);
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
            const table = document.getElementById('by-model');
            table.innerHTML = `
                <thead>
                    <tr>
                        <th class="sortable" onclick="sortByModelTable(0)">Model</th>
                        <th class="sortable" onclick="sortByModelTable(1)">Requests</th>
                        <th class="sortable" onclick="sortByModelTable(2)">Cost</th>
                        <th class="sortable" onclick="sortByModelTable(3)">Tokens</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr class="clickable-row" onclick="filterRequests({ model: '${escapeHtml(row[0])}', provider: '', search: '', minCost: '', maxCost: '' })">
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
                            <td>${new Date(row[3]).toLocaleString()}</td>
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

        // Calendar functionality
        let currentMonth = new Date();
        let selectedDate = null;
        let calendarData = {};

        function getCostColor(cost, maxCost) {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

            if (cost === 0) {
                return isDark ? '#2a2a2a' : '#f0f0f0';
            }

            const ratio = Math.min(cost / (maxCost || 1), 1);

            if (isDark) {
                // Dark mode: darker blues with less saturation
                const lightness = 25 + (ratio * 25); // 25% to 50%
                const saturation = 60 + (ratio * 20); // 60% to 80%
                return `hsl(210, ${saturation}%, ${lightness}%)`;
            } else {
                // Light mode: lighter blues
                const lightness = 100 - (ratio * 50); // 100% to 50%
                return `hsl(210, 100%, ${lightness}%)`;
            }
        }

        function formatDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        async function loadCalendar() {
            const year = currentMonth.getFullYear();
            const month = currentMonth.getMonth();

            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);

            const startDate = formatDate(firstDay);
            const endDate = formatDate(lastDay);

            // Get browser timezone offset in minutes from UTC (negative for west)
            const timezoneOffset = -new Date().getTimezoneOffset();

            const res = await fetch(`/stats/daily?start_date=${startDate}&end_date=${endDate}&timezone_offset=${timezoneOffset}`);
            const data = await res.json();

            calendarData = {};
            data.daily.forEach(day => {
                calendarData[day.date] = day;
            });

            renderCalendar(year, month);
        }

        function renderCalendar(year, month) {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                              'July', 'August', 'September', 'October', 'November', 'December'];
            document.getElementById('current-month').textContent = `${monthNames[month]} ${year}`;

            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const startingDayOfWeek = firstDay.getDay();
            const daysInMonth = lastDay.getDate();

            const today = formatDate(new Date());
            const maxCost = Math.max(...Object.values(calendarData).map(d => d.cost), 0.01);

            let html = '';
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
                html += `<div class="calendar-day-header">${day}</div>`;
            });

            for (let i = 0; i < startingDayOfWeek; i++) {
                html += '<div class="calendar-day empty"></div>';
            }

            for (let day = 1; day <= daysInMonth; day++) {
                const date = formatDate(new Date(year, month, day));
                const dayData = calendarData[date] || { requests: 0, cost: 0 };
                const bgColor = getCostColor(dayData.cost, maxCost);
                const isToday = date === today ? 'today' : '';

                const ariaLabel = `${date}: ${dayData.requests} requests, $${dayData.cost.toFixed(2)} total cost`;
                html += `
                    <div class="calendar-day ${isToday}"
                         style="background-color: ${bgColor}"
                         onclick="onDayClick('${date}')"
                         onkeydown="handleCalendarKeyPress(event, '${date}')"
                         tabindex="0"
                         role="gridcell"
                         aria-label="${ariaLabel}"
                         data-date="${date}">
                        <div class="day-number">${day}</div>
                        <div class="day-cost">$${dayData.cost.toFixed(2)}</div>
                        <div class="day-requests">${dayData.requests} req</div>
                    </div>
                `;
            }

            document.getElementById('calendar-grid').innerHTML = html;
        }

        function navigateMonth(direction) {
            currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1);
            loadCalendar();
        }

        function handleCalendarKeyPress(event, date) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onDayClick(date);
            }
        }

        function onDayClick(date) {
            selectedDate = date;
            const dayData = calendarData[date];

            if (!dayData || dayData.requests === 0) {
                document.getElementById('day-detail').style.display = 'none';
                return;
            }

            const detailTitle = document.getElementById('day-detail-title');
            const detailContent = document.getElementById('day-detail-content');

            detailTitle.textContent = `${date} - $${dayData.cost.toFixed(4)} across ${dayData.requests} requests`;

            let providersHtml = '<h4>By Provider:</h4>';
            const totalCost = dayData.cost;

            dayData.by_provider.forEach(p => {
                const percentage = totalCost > 0 ? (p.cost / totalCost * 100) : 0;
                const color = getProviderColor(p.provider);

                providersHtml += `
                    <div class="provider-bar">
                        <div class="provider-header">
                            <span class="provider-name">${p.provider}</span>
                            <span class="provider-percentage">${percentage.toFixed(0)}%</span>
                        </div>
                        <div class="bar-container">
                            <div class="bar-fill" style="width: ${percentage}%; background: ${color}"></div>
                        </div>
                        <div class="provider-details">
                            $${p.cost.toFixed(4)} across ${p.requests} requests
                        </div>
                    </div>
                `;
            });

            detailContent.innerHTML = providersHtml;
            document.getElementById('day-detail').style.display = 'block';
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
