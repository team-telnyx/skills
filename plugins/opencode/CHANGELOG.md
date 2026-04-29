# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.1.2] - 2026-04-24

### Added

- Added `oc-plugin` field declaring both server and TUI targets for `opencode plugin install` compatibility

### Fixed

- Fixed README install instructions to use `opencode plugin install` (the standard method that auto-configures both `opencode.json` and `tui.json`)

## [0.1.1] - 2026-04-24

### Fixed

- Simplified `./tui` export to plain string format, matching the convention used by all other opencode TUI plugins

## [0.1.0] - 2026-04-23

### Added

- initial Telnyx auth and provider plugin for OpenCode
- Telnyx model discovery via `GET https://api.telnyx.com/v2/ai/models`
- API key resolution from `TELNYX_API_KEY` or OpenCode's stored `auth.json` credential
- compatibility fix for Telnyx requests that reject tool use with output token caps
- 3-model default allowlist (`Kimi-K2.6`, `GLM-5.1-FP8`, `MiniMax-M2.7`) for safer initial setup
- interactive `/telnyx` TUI model manager for enabling additional Telnyx-hosted models
- allowlist persistence in `~/.config/opencode/telnyx-models.json`
- login-time model preset selection during `opencode auth login`
- live regression harness via `npm test`
