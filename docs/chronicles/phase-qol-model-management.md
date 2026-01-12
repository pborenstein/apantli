# Phase QoL: Model Management UI

Quality-of-life improvements for model management through dashboard UI.

---

## Entry 1: Backend APIs (2026-01-11)

**What**: Implemented CRUD APIs for model management with hot-reload.

**Why**: Users needed UI for managing models instead of editing YAML manually.

**How**: Added POST/PATCH/DELETE endpoints for models, provider discovery API, config backup system.

**Files**: `apantli/server.py` (lines 610-920), `apantli/config.py`

---

## Entry 2: Add Model Wizard (2026-01-11)

**What**: 3-step wizard UI for adding models with smart sorting and provider documentation links.

**Why**: Complex task requiring multiple selections - needed guided flow with good UX.

**How**:
- Step 1: Provider grid with active providers first, alphabetical sorting
- Step 2: Model grid with configured models first, sortable by name/cost
- Step 3: Configuration form with smart defaults and validation
- Shows configured aliases as badges, links to provider docs
- Fixed all modal CSS variables for light/dark mode compatibility

**Key Features**:
- Active provider badges (green)
- Configured model badges showing aliases (orange)
- External link icons to provider documentation
- Grid layouts for both providers and models
- Search and sort controls
- Status toggle shows current state not action

**Files**: `templates/dashboard.html` (lines 507-630), `apantli/static/js/dashboard.js` (lines 2017-2360), `apantli/static/css/dashboard.css` (lines 1688-2004)

---

## Entry 3: Critical Bug Fixes (2026-01-11)

**What**: Fixed playground and API completely broken - all requests failing with "Extra inputs are not permitted".

**Why**: Server was passing metadata fields to LiteLLM that providers reject; playground was including metadata in message history.

**How**:
- Server: Added EXCLUDED_KEYS filter to prevent passing `enabled`, cost metadata to LiteLLM
- Playground: Strip `tokens` property from messages before sending to API
- Playground: Handle null parameter defaults in Alpine expressions
- Config: Fixed Claude Haiku 4.5 model name (confirmed model exists)

**Root Causes**:
1. `resolve_model_config()` passed all model config fields to LiteLLM (including metadata)
2. Playground stored `tokens` with messages, sent entire message objects to API
3. `getDefaultValue()` returned null, template called `.toFixed()` on null

**Files**: `apantli/server.py:193`, `apantli/static/js/compare.js:332-335,243`, `config.yaml`
