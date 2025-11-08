# Changelog

All notable changes to Apantli will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.4] - 2025-11-08

### Added
- Comprehensive documentation update plan (DOC_UPDATE.md)

## [0.3.3] - 2025-11-08

### Added
- Complete UI/UX design review and recommendations (docs/FRONT_END.md)
- Comprehensive analysis of spacing, typography, components, and layout
- 22 specific improvement recommendations with priority levels

### Changed
- Improved visual hierarchy and component consistency planning

## [0.3.2] - 2025-11-07

### Added
- Comprehensive code analysis and recommendations document (docs/RECOMMENDATIONS.md)
- Technical debt assessment with 22 prioritized improvement areas
- Implementation roadmap for scalability (100-1000 requests/day)

### Fixed
- Parameter handling for model-specific filtering
- Clean error messages for better user experience

## [0.3.1] - 2025-11-07

### Fixed
- Parameter handling: model-specific filtering and clean error messages
- Better validation of request parameters

## [0.3.0] - 2025-11-06

### Added
- Playground interface for side-by-side model comparison
- Token count display with optimized layout
- Export conversations to markdown
- Request token usage in streaming responses

### Fixed
- Error handling: socket spam prevention
- BadRequestError handling
- LiteLLM logging verbosity
- Parameter validation improvements

### Changed
- Improved Playground layout and visual hierarchy

## [0.2.0] - 2025-10-20

### Added
- Chat comparison interface (later renamed to Playground)
- Side-by-side model testing with independent parameters
- Parallel streaming requests
- Conversation threading per slot
- Parameter controls (temperature, top_p, max_tokens)
- Token usage display
- Dev dependencies for testing and type checking

### Changed
- Renamed Compare feature to Playground
- Enhanced parameter controls with reset functionality

### Documentation
- Comprehensive Playground documentation (docs/PLAYGROUND.md)
- Updated README and related docs

## [0.1.x] - 2025-10-04 to 2025-10-19

### Added
- Browser history support for tab navigation
- Click-to-filter navigation from stats tables to requests
- Server-side filtering for requests (provider, model, cost, search)
- Global sticky date filter with persistence
- Request pagination with configurable page size
- Hourly breakdown for single-day calendar views
- Model segmentation in provider cost breakdown charts
- Tooltip popup on hover for chart segments
- launchd service configuration for macOS
- Favicon and app icons
- Footer with copyright and attribution

### Fixed
- Dashboard date filtering and timezone handling
- Temperature override behavior
- Parameter precedence (client vs config)
- Cost calculation display for streaming requests
- Hourly stats timezone bug
- Race condition in filter watchers
- Type annotations for mypy compliance

### Changed
- Refactored dashboard: split HTML into separate CSS and JS files
- Modularized JavaScript into 6 focused modules
- Standardized Config API and error naming
- Database class refactoring (removed all direct SQL from server.py)
- Improved error handling and logging
- Enhanced server logging with detailed request tracking

### Documentation
- Fixed factual inaccuracies in line counts and test counts
- Consolidated llm CLI documentation
- Added MODEL_NAMING.md to explain model terminology
- Reorganized README for better new user flow
- Updated all docs for refactored architecture
- Improved documentation scannability

## [0.0.1] - 2025-09-XX (Initial Development)

### Added
- Core FastAPI server with async architecture
- OpenAI-compatible API endpoints
- Multi-provider LLM routing via LiteLLM
- SQLite database with aiosqlite for async operations
- Automatic cost calculation and tracking
- Web dashboard with Alpine.js
- Configuration management with Pydantic validation
- Error handling with OpenAI-compatible responses
- Streaming support with SSE
- CORS middleware for web clients
- Environment variable management
- Model configuration via YAML
- Stats endpoints (total, daily, hourly)
- Request history with filtering
- Calendar view with cost heatmap
- Models tab with pricing information
- Theme support (light/dark)

### Documentation
- Complete documentation suite in docs/
- API reference (docs/API.md)
- Architecture guide (docs/ARCHITECTURE.md)
- Configuration guide (docs/CONFIGURATION.md)
- Dashboard guide (docs/DASHBOARD.md)
- Database reference (docs/DATABASE.md)
- Error handling design (docs/ERROR_HANDLING.md)
- Testing guide (docs/TESTING.md)
- Troubleshooting guide (docs/TROUBLESHOOTING.md)
- LLM CLI integration (docs/LLM_CLI_INTEGRATION.md)
- README with quick start
- CLAUDE.md with AI context

---

## Version History Summary

| Version | Date | Major Features |
|:--------|:-----|:---------------|
| 0.3.4 | 2025-11-08 | Documentation update plan |
| 0.3.3 | 2025-11-08 | UI/UX design review |
| 0.3.2 | 2025-11-07 | Code analysis & recommendations |
| 0.3.1 | 2025-11-07 | Parameter handling fixes |
| 0.3.0 | 2025-11-06 | Playground interface |
| 0.2.0 | 2025-10-20 | Chat comparison (Playground) |
| 0.1.x | 2025-10-04 | Dashboard enhancements, refactoring |
| 0.0.1 | 2025-09-XX | Initial release |

---

## Upgrade Notes

### Upgrading to 0.3.x
- No breaking changes
- New Playground feature available at `/compare`
- Enhanced error handling and parameter validation

### Upgrading to 0.2.x
- Frontend refactored: HTML/CSS/JS now in separate files
- No config changes required
- Database schema unchanged

### Upgrading to 0.1.x
- No breaking changes
- Enhanced filtering and pagination features
- launchd service support for macOS

---

## Links

- [Repository](https://github.com/pborenstein/apantli)
- [Documentation](https://github.com/pborenstein/apantli/tree/main/docs)
- [Issues](https://github.com/pborenstein/apantli/issues)
- [Pull Requests](https://github.com/pborenstein/apantli/pulls)

---

[Unreleased]: https://github.com/pborenstein/apantli/compare/v0.3.4...HEAD
[0.3.4]: https://github.com/pborenstein/apantli/releases/tag/v0.3.4
[0.3.3]: https://github.com/pborenstein/apantli/releases/tag/v0.3.3
[0.3.2]: https://github.com/pborenstein/apantli/releases/tag/v0.3.2
[0.3.1]: https://github.com/pborenstein/apantli/releases/tag/v0.3.1
[0.3.0]: https://github.com/pborenstein/apantli/releases/tag/v0.3.0
[0.2.0]: https://github.com/pborenstein/apantli/releases/tag/v0.2.0
[0.1.x]: https://github.com/pborenstein/apantli/releases/tag/v0.1.0
[0.0.1]: https://github.com/pborenstein/apantli/releases/tag/v0.0.1
