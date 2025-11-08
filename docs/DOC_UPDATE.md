# Documentation Update Plan

**Created:** 2025-11-08
**Current Version:** 0.3.4
**Status:** Planning Phase

## Executive Summary

Apantli has evolved significantly through multiple development phases, adding major features like the Playground, advanced filtering, error handling, and UI enhancements. The documentation is comprehensive (14 main documents, ~7,500 lines total) but needs systematic review and updates to ensure accuracy, consistency, and completeness.

This plan identifies all documentation files, audit findings, and prioritized update tasks.

---

## Current Documentation Inventory

### Core Documentation Files

| File | Lines | Last Major Update | Primary Audience | Status |
|:-----|:------|:-----------------|:-----------------|:-------|
| **README.md** | 355 | Recent | All users | ✅ Good - comprehensive quick start |
| **CLAUDE.md** | 134 | Recent | AI assistants | ✅ Good - accurate technical context |
| **docs/README.md** | 134 | Recent | All users | ✅ Good - clear navigation |
| **docs/ARCHITECTURE.md** | 742 | Recent | Developers | ⚠️ Needs review - verify all flows |
| **docs/API.md** | 1,250 | Recent | Developers/Integrators | ⚠️ Needs review - verify endpoints |
| **docs/CONFIGURATION.md** | 710 | Recent | Users/Developers | ⚠️ Needs review - verify all options |
| **docs/DASHBOARD.md** | 213 | Recent | Users | ⚠️ Needs update - new features |
| **docs/DATABASE.md** | 676 | Recent | Developers/DevOps | ✅ Good - comprehensive |
| **docs/ERROR_HANDLING.md** | 214 | Recent | Developers | ✅ Good - accurate design doc |
| **docs/PLAYGROUND.md** | 840 | Recent | Users/Developers | ⚠️ Needs review - verify all features |
| **docs/TESTING.md** | 340 | Recent | Developers/QA | ⚠️ Needs update - verify test count |
| **docs/TROUBLESHOOTING.md** | 943 | Recent | All users | ⚠️ Needs review - verify solutions |
| **docs/MODEL_NAMING.md** | 203 | Recent | Users | ✅ Good - clear explanation |
| **docs/LLM_CLI_INTEGRATION.md** | 267 | Recent | Developers | ✅ Good - clear architecture |
| **docs/FRONT_END.md** | 958 | 2025-11-08 | Developers | ✅ Good - comprehensive review |
| **docs/RECOMMENDATIONS.md** | 704 | 2025-11-07 | Developers | ✅ Good - current analysis |

### Supporting Documentation

| File | Status | Notes |
|:-----|:-------|:------|
| **launchd/README.md** | ✅ Good | macOS service setup |
| **launchd/NAMING.md** | ✅ Good | Service naming |
| **utils/README.md** | ⚠️ Needs check | Utility scripts |
| **tests/README.md** | ⚠️ Needs check | Test documentation |

### Missing Documentation

| File | Priority | Reason |
|:-----|:---------|:-------|
| **CHANGELOG.md** | HIGH | Track version history |
| **CONTRIBUTING.md** | MEDIUM | Developer onboarding |
| **DEPLOYMENT.md** | MEDIUM | Production setup |
| **SECURITY.md** | LOW | Security policies |
| **docs/PERFORMANCE.md** | LOW | Performance tuning |

---

## Key Changes Since Initial Documentation

### Major Features Added

1. **Playground** (v0.2.x)
   - Side-by-side model comparison
   - Independent conversation threading
   - Parameter presets and reset
   - Token usage display
   - Export to markdown
   - localStorage persistence

2. **Dashboard Enhancements** (v0.3.x)
   - Font customization (family, size, weight)
   - Advanced request filtering (provider, model, cost, search)
   - Server-side pagination
   - Browser history integration
   - Calendar heatmap view
   - Performance metrics
   - Theme toggle

3. **Backend Improvements** (v0.2.x - v0.3.x)
   - Configurable timeouts and retries
   - Per-model parameter defaults
   - Daily/hourly stats endpoints
   - Error clearing endpoint
   - Enhanced error handling
   - Streaming error recovery

4. **LLM CLI Integration** (v0.3.x)
   - generate_llm_config.py utility
   - extra-openai-models.yaml generation
   - Seamless llm CLI support

### Architecture Changes

1. **Frontend Refactoring** (2025-10-18)
   - Split dashboard.html → HTML + CSS + JS
   - Created compare.html, compare.js, compare.css
   - Organized static assets in apantli/static/

2. **Module Organization**
   - 6 focused modules (server, config, database, llm, errors, utils)
   - ~1,500 lines core + ~2,800 lines UI
   - 59 test cases (unit + integration)

3. **Database Schema**
   - Added indexes for performance
   - Support for error logging
   - Full request/response storage

---

## Documentation Audit Findings

### 1. Consistency Issues

#### Version References
- **Issue:** Some docs may reference older versions
- **Action:** Audit all version references, update to 0.3.4
- **Files:** All docs that mention version numbers

#### File Paths
- **Issue:** Frontend refactoring changed file locations
- **Action:** Verify all file path references
- **Key Changes:**
  - Old: Single dashboard.html with embedded CSS/JS
  - New: dashboard.html + apantli/static/css/dashboard.css + apantli/static/js/dashboard.js

#### Feature Descriptions
- **Issue:** Some features described may have evolved
- **Action:** Cross-reference with actual implementation
- **Priority Areas:**
  - Dashboard tabs and features
  - Playground capabilities
  - API endpoints
  - Configuration options

### 2. Accuracy Issues

#### Test Coverage
- **Issue:** TESTING.md should verify current test count (59)
- **Action:** Run pytest and update documentation
- **Files:** docs/TESTING.md, CLAUDE.md

#### API Endpoints
- **Issue:** Verify all endpoints documented match implementation
- **Action:** Compare API.md with server.py routes
- **Critical Endpoints:**
  - /v1/chat/completions (streaming)
  - /stats (with time filtering)
  - /stats/daily, /stats/date-range
  - /requests (with server-side filtering)
  - /errors (DELETE)
  - /compare

#### Configuration Options
- **Issue:** Verify all config.yaml options documented
- **Action:** Review config.py Pydantic models vs documentation
- **Key Areas:**
  - Per-model timeout/retries
  - Temperature/max_tokens/top_p defaults
  - API key format validation

### 3. Completeness Issues

#### Dashboard Features
- **Issue:** DASHBOARD.md needs comprehensive feature documentation
- **Missing/Incomplete:**
  - Font customization controls (family, size, weight)
  - Advanced filtering workflow
  - Server-side vs client-side filtering
  - Filter persistence via localStorage
  - Browser history navigation
  - Request parameter display
  - Theme toggle

#### Playground Features
- **Issue:** PLAYGROUND.md should document all features
- **Verify Coverage:**
  - Slot enable/disable
  - Model selection and locking
  - Parameter controls with reset
  - Conversation threading
  - Token usage display
  - Export functionality
  - Warning indicators
  - localStorage persistence

#### Error Handling
- **Issue:** ERROR_HANDLING.md is comprehensive but verify implementation matches
- **Action:** Cross-reference with actual code in server.py
- **Key Areas:**
  - Timeout strategy (120s default)
  - Retry strategy (3 attempts)
  - HTTP status code mapping
  - Streaming error format
  - Socket error deduplication

---

## Prioritized Update Tasks

### Phase 1: Critical Updates (High Priority)

#### 1.1 Create Missing Documentation
**Effort:** 4-6 hours

- [ ] **CHANGELOG.md**
  - Document version history from git commits
  - Format: Keep a Changelog standard
  - Include v0.1.0 through v0.3.4
  - Priority: HIGH

- [ ] **CONTRIBUTING.md**
  - Development setup
  - Code style guidelines
  - Pull request process
  - Testing requirements
  - Priority: MEDIUM

#### 1.2 Verify and Update Core Documentation
**Effort:** 6-8 hours

- [ ] **README.md**
  - Verify Quick Start still accurate
  - Update version references
  - Check all links work
  - Verify screenshots/diagrams current
  - Priority: HIGH

- [ ] **CLAUDE.md**
  - Verify module line counts
  - Update test count (59 cases)
  - Verify all file paths
  - Check feature descriptions
  - Priority: HIGH

- [ ] **docs/API.md**
  - Verify all endpoints exist
  - Check request/response formats
  - Update examples if needed
  - Verify error codes
  - Priority: HIGH

#### 1.3 Update Feature Documentation
**Effort:** 4-5 hours

- [ ] **docs/DASHBOARD.md**
  - Document font customization
  - Document advanced filtering
  - Document browser history navigation
  - Add filter persistence details
  - Update screenshots if needed
  - Priority: HIGH

- [ ] **docs/PLAYGROUND.md**
  - Verify all features documented
  - Check examples still work
  - Update architecture diagrams if needed
  - Priority: MEDIUM

---

### Phase 2: Comprehensive Review (Medium Priority)

#### 2.1 Technical Documentation
**Effort:** 6-8 hours

- [ ] **docs/ARCHITECTURE.md**
  - Verify module descriptions
  - Check data flow diagrams
  - Update file structure
  - Verify performance characteristics
  - Add any missing components
  - Priority: MEDIUM

- [ ] **docs/CONFIGURATION.md**
  - Verify all config options
  - Check environment variables
  - Update client integration examples
  - Verify llm CLI integration section
  - Priority: MEDIUM

- [ ] **docs/DATABASE.md**
  - Verify schema current
  - Check all Database class methods
  - Update query examples
  - Verify maintenance procedures
  - Priority: MEDIUM

#### 2.2 User Documentation
**Effort:** 4-5 hours

- [ ] **docs/TESTING.md**
  - Update test count
  - Verify test procedures
  - Check integration test instructions
  - Update manual test scenarios
  - Priority: MEDIUM

- [ ] **docs/TROUBLESHOOTING.md**
  - Verify all solutions still work
  - Add new common issues
  - Update error messages
  - Check all commands/examples
  - Priority: MEDIUM

---

### Phase 3: Polish and Enhancement (Low Priority)

#### 3.1 Documentation Quality
**Effort:** 4-6 hours

- [ ] **Cross-Reference Audit**
  - Verify all internal links work
  - Check external links valid
  - Ensure consistent terminology
  - Fix any broken references
  - Priority: LOW

- [ ] **Example Updates**
  - Test all code examples
  - Update to current syntax
  - Add more examples where needed
  - Priority: LOW

- [ ] **Diagram Updates**
  - Regenerate architecture diagrams
  - Update data flow visualizations
  - Add new diagrams where helpful
  - Priority: LOW

#### 3.2 Additional Documentation
**Effort:** 6-8 hours

- [ ] **DEPLOYMENT.md**
  - Production deployment guide
  - Docker setup (if applicable)
  - Monitoring and logging
  - Backup strategies
  - Priority: LOW

- [ ] **SECURITY.md**
  - Security best practices
  - API key management
  - Network security
  - Data privacy
  - Priority: LOW

- [ ] **docs/PERFORMANCE.md**
  - Performance tuning guide
  - Benchmarking procedures
  - Optimization strategies
  - Scaling considerations
  - Priority: LOW

---

## Documentation Standards

### General Guidelines

1. **Accuracy**
   - All code examples must be tested
   - All file paths must be verified
   - All commands must work as documented
   - Version numbers must be current

2. **Consistency**
   - Use consistent terminology throughout
   - Maintain consistent formatting
   - Follow established documentation patterns
   - Use same code style in examples

3. **Completeness**
   - Cover all features and options
   - Include error cases and troubleshooting
   - Provide both basic and advanced examples
   - Link to related documentation

4. **Clarity**
   - Write for the target audience
   - Use clear, concise language
   - Provide context and rationale
   - Include visual aids where helpful

### Formatting Standards

#### Markdown
```markdown
# H1 - Document Title
## H2 - Major Sections
### H3 - Subsections
#### H4 - Minor Points

**Bold** for emphasis
*Italic* for technical terms
`code` for inline code
```

#### Code Blocks
````markdown
```bash
# Bash commands with comments
apantli --port 8080
```

```python
# Python with type hints
def example(param: str) -> dict:
    return {"result": param}
```

```yaml
# YAML with comments
model_list:
  - model_name: gpt-4
```
````

#### Tables
```markdown
| Column 1 | Column 2 | Column 3 |
|:---------|:---------|:---------|
| Left     | Center   | Right    |
```

#### Links
```markdown
[Link text](path/to/file.md)
[Section link](#section-name)
[External link](https://example.com)
```

---

## Specific Documentation Updates

### README.md Updates Needed

#### 1. Verify Quick Start
- [ ] Test all installation steps
- [ ] Verify uv sync works
- [ ] Check example config.yaml
- [ ] Test server startup

#### 2. Update Features Table
- [ ] Add Playground feature
- [ ] Add advanced filtering
- [ ] Update feature descriptions
- [ ] Verify all features listed

#### 3. Check Links
- [ ] Verify all docs/ links
- [ ] Check external links
- [ ] Test anchor links

### CLAUDE.md Updates Needed

#### 1. Module Line Counts
Current (from CLAUDE.md):
```
- server.py (~1,100 lines)
- config.py (213 lines)
- database.py (119 lines)
- llm.py (27 lines)
- errors.py (22 lines)
- utils.py (23 lines)
```

Action:
- [ ] Run `wc -l apantli/*.py` to verify
- [ ] Update if counts have changed significantly

#### 2. UI File Counts
Current (from CLAUDE.md):
```
- templates/dashboard.html (327 lines)
- templates/compare.html (218 lines)
- apantli/static/css/dashboard.css (1,087 lines)
- apantli/static/css/compare.css (427 lines)
- apantli/static/js/dashboard.js (1,705 lines)
- apantli/static/js/compare.js (426 lines)
```

Action:
- [ ] Verify all line counts
- [ ] Update if changed

#### 3. Test Count
- [ ] Run `pytest --collect-only`
- [ ] Verify 59 test cases claim
- [ ] Update if count changed

### DASHBOARD.md Updates Needed

#### 1. Font Customization
Add section:
```markdown
## Font Customization

The dashboard header includes controls to customize the display font:

### Font Family
- System Default (SF Mono, Consolas)
- [List all available fonts]

### Font Size
- Range: [min] to [max]
- Default: [value]

### Font Weight
- 300 (Light)
- 400 (Normal)
- 500 (Medium)
- 600 (Semibold)
- 700 (Bold)

Settings persist in browser localStorage.
```

#### 2. Advanced Filtering
Expand section with:
- Server-side vs client-side filtering
- Filter combination logic (AND)
- Filter persistence
- Summary accuracy (all filtered results, not just page)

#### 3. Browser History
Document:
- URL hash synchronization
- Back/forward button support
- Direct linking
- Tab state preservation

### API.md Updates Needed

#### 1. Verify Endpoints
Check implementation vs documentation:
- [ ] POST /v1/chat/completions
- [ ] POST /chat/completions
- [ ] GET /health
- [ ] GET /models
- [ ] GET /stats
- [ ] GET /stats/daily
- [ ] GET /stats/date-range
- [ ] GET /requests
- [ ] DELETE /errors
- [ ] GET / (dashboard)
- [ ] GET /compare (playground)

#### 2. Update Examples
- [ ] Test all curl examples
- [ ] Verify Python SDK examples
- [ ] Check response formats
- [ ] Update error examples

### PLAYGROUND.md Updates Needed

#### 1. Features Checklist
Verify all documented:
- [ ] Slot enable/disable
- [ ] Model selection dropdown
- [ ] conversationModel locking
- [ ] Parameter controls (temperature, top_p, max_tokens)
- [ ] Reset buttons per parameter
- [ ] Streaming display
- [ ] Token usage display
- [ ] Conversation history
- [ ] Export to markdown
- [ ] Warning indicators
- [ ] localStorage persistence
- [ ] New conversation button

#### 2. Architecture Diagrams
- [ ] Verify data flow diagram
- [ ] Check file structure
- [ ] Update if implementation changed

---

## Testing and Validation

### Documentation Testing Checklist

For each updated document:

1. **Code Examples**
   - [ ] Run all bash commands
   - [ ] Test all Python code
   - [ ] Verify all curl requests
   - [ ] Check all SQL queries

2. **Links**
   - [ ] Test all internal links
   - [ ] Verify external links
   - [ ] Check anchor links
   - [ ] Validate image paths

3. **Accuracy**
   - [ ] Compare with actual code
   - [ ] Verify version numbers
   - [ ] Check file paths
   - [ ] Validate feature claims

4. **Completeness**
   - [ ] All features documented
   - [ ] All options explained
   - [ ] Error cases covered
   - [ ] Examples provided

### Automated Checks

Consider adding:
```bash
# Link checker
find docs -name "*.md" -exec markdown-link-check {} \;

# Spell check
find docs -name "*.md" -exec aspell check {} \;

# Markdown lint
find docs -name "*.md" -exec markdownlint {} \;
```

---

## Implementation Timeline

### Week 1: Critical Updates
- Create CHANGELOG.md
- Update README.md
- Update CLAUDE.md
- Update API.md
- Update DASHBOARD.md

### Week 2: Comprehensive Review
- Update ARCHITECTURE.md
- Update CONFIGURATION.md
- Update DATABASE.md
- Update TESTING.md
- Update TROUBLESHOOTING.md

### Week 3: Polish
- Create CONTRIBUTING.md
- Cross-reference audit
- Example updates
- Diagram updates
- Final review

### Ongoing: Maintenance
- Update with each feature addition
- Review quarterly for accuracy
- Collect user feedback
- Track documentation issues

---

## Success Criteria

Documentation update is complete when:

1. **Accuracy**: All code examples work, all file paths correct, all version numbers current
2. **Consistency**: Terminology and formatting consistent across all docs
3. **Completeness**: All features documented, all options explained, all endpoints covered
4. **Clarity**: Target audiences can complete tasks using documentation alone
5. **Currency**: Documentation reflects current version (0.3.4+)

---

## Notes

### Known Issues to Address

1. **Screenshots**: Some docs reference screenshots that may be outdated
   - docs/stats-tab.png
   - docs/requests-tab.png
   - Action: Regenerate if UI changed significantly

2. **Archive Directory**: docs/archive/ contains old planning documents
   - Review for historical value
   - Consider moving truly obsolete docs
   - Update archive/README.md if needed

3. **Duplicate Information**: Some docs may have overlapping content
   - Identify duplicates
   - Consolidate or cross-reference
   - Maintain single source of truth

### Future Considerations

1. **Documentation as Code**
   - Consider auto-generating API docs from code
   - Use docstrings for inline documentation
   - Generate config reference from Pydantic models

2. **User Feedback**
   - Collect documentation feedback
   - Track common questions
   - Prioritize updates based on usage

3. **Versioning**
   - Consider per-version documentation
   - Maintain docs for stable releases
   - Archive old version docs

---

## Conclusion

This plan provides a systematic approach to updating Apantli's documentation. The phased approach allows for:

1. **Quick wins**: Critical updates first (CHANGELOG, README, CLAUDE.md, API, DASHBOARD)
2. **Thorough review**: Comprehensive verification of technical docs
3. **Quality polish**: Final enhancements and new documentation

Estimated total effort: 24-33 hours spread across 3 weeks.

Priority should be on Phase 1 (critical updates) to ensure core documentation is accurate, then Phase 2 (comprehensive review) to verify technical accuracy, and finally Phase 3 (polish) to enhance overall documentation quality.

---

**Next Steps:**

1. Review this plan with stakeholders
2. Prioritize specific tasks
3. Create issues/tasks for each update
4. Begin Phase 1 implementation
5. Track progress and iterate
