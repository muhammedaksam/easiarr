# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Bazarr form authentication support with global credentials
- SECURITY.md for vulnerability disclosure policy
- Test step in CI workflow
- Comprehensive pre-launch security review

### Fixed

- `bookmarks-generator.test.ts` Jest compatibility (VersionInfo mock)

## [0.9.1] - 2025-12-14

### Added

- Separate local and remote bookmark files
- Wiki submodule integration

## [0.9.0] - 2025-12-14

### Added

- Cloudflare Tunnel automated setup with API token
- Cloudflare Access email-based authentication
- Traefik basic auth fallback when Cloudflare Access not configured
- Global email configuration for setup wizard
- Settings screen for Traefik, VPN, and system options

### Fixed

- Migration loader blank line
- Cloudflare Access policy precedence
- Traefik config EACCES error handling

## [0.8.0] - 2025-12-14

### Added

- Jellyfin setup wizard automation
- Jellyseerr integration with Jellyfin
- Homepage widget configuration
- FlareSolverr tag auto-application

## [0.7.0] - 2025-12-14

### Added

- Portainer auto-initialization and API key generation
- qBittorrent TRaSH-compliant configuration
- Prowlarr app sync

## [0.6.0] - 2025-12-13

### Added

- Full Auto Setup wizard
- Container control panel

## [0.5.0] - 2025-12-12

### Added

- Environment variable migration system
- Renamed env vars to `PASSWORD_XXX` format

## [0.4.0] - 2025-12-12

### Added

- Footer hints with styling options
- Monitor dashboard UI

## [0.3.0] - 2025-12-12

### Added

- TRaSH Guides quality profile integration
- Custom format API

## [0.2.0] - 2025-12-12

### Added

- VPN routing modes (Mini and Full)
- Traefik reverse proxy configuration

## [0.1.1] - 2025-12-11

### Added

- Initial release with 41 supported applications
- Docker Compose generation
- TRaSH Guides folder structure compliance
