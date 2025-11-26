# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Renamed `conversation_twitter.ts` to `conversation_main.ts` for better clarity

### Added
- Added CHANGELOG.md to track project changes

## [1.0.0] - 2025-11-26

### Added
- Initial release of multi-AI conversation orchestration tool
- Multi-AI orchestration system supporting ChatGPT, Gemini, and Claude
- Conversation persistence with save/load state functionality
- Automatic code extraction from AI responses
- Code consolidation using Claude to create production-ready implementations
- Markdown export system for conversation transcripts
- Git integration with auto-commit and push capabilities
- Twitter/X integration for real-time conversation posting
- Smart context management with sliding window
- Rate limit handling with automatic retries and countdown timers
- Configuration system with customizable prompts and settings
- Support for conversation resumption across sessions
- Automatic documentation generation (README updates, run summaries)
- Code indexing and organization system

### Files
- `conversation_main.ts` - Main orchestration system (1696 lines)
- `conversation.ts` - Simplified conversation implementation
- `list-gemini-models.ts` - Utility for listing available Gemini models
- `list-models.js` - Helper script for model listing
- `package.json` - Project dependencies and configuration
- `tsconfig.json` - TypeScript compiler configuration
- `.gitignore` - Git ignore patterns

[Unreleased]: https://github.com/jordancrombie/conversation/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jordancrombie/conversation/releases/tag/v1.0.0
