# easiarr

> **It could be easiarr.**

[![npm version](https://img.shields.io/npm/v/@muhammedaksam/easiarr.svg)](https://www.npmjs.com/package/@muhammedaksam/easiarr)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-000?logo=bun&logoColor=fff)](https://bun.sh/)
[![CI](https://github.com/muhammedaksam/easiarr/workflows/CI/badge.svg)](https://github.com/muhammedaksam/easiarr/actions)

> ⚠️ **Work In Progress** - This project is in early experimental development. Features may be incomplete, unstable, or change without notice.

TUI tool for generating docker-compose files for the \*arr media ecosystem with 41 apps, TRaSH Guides best practices, VPN routing, and Traefik reverse proxy support.

A terminal-based wizard that helps you set up Radarr, Sonarr, Prowlarr, and other \*arr applications with Docker Compose, following best practices from [TRaSH Guides](https://trash-guides.info/).

## Features

- 📦 **Quick Setup Wizard** - Get started in minutes with a guided setup flow
- 🐳 **Docker Compose Generation** - Automatically generates optimized `docker-compose.yml`
- ✅ **TRaSH Guides Compliant** - Follows best practices for folder structure and hardlinks
- 🎮 **Container Control** - Start, stop, and restart containers directly from the TUI
- ⚙️ **App Management** - Add or remove apps from your stack with ease
- 💾 **Persistent Configuration** - Settings saved to `~/.easiarr/config.json`

## Quick Start

### Run directly with bunx (no installation required)

```bash
bunx @muhammedaksam/easiarr
```

### Or install globally

```bash
bun add -g @muhammedaksam/easiarr
easiarr
```

### Or clone and run locally

```bash
git clone https://github.com/muhammedaksam/easiarr.git
cd easiarr
bun install
bun run start
```

## Requirements

- [Bun](https://bun.sh/) >= 1.0
- [Docker](https://www.docker.com/) with Docker Compose v2

## Supported Applications (41 apps across 10 categories)

### Media Management (Servarr)

- **Radarr** - Movie collection manager
- **Sonarr** - TV series collection manager
- **Lidarr** - Music collection manager
- **Readarr** - Book collection manager
- **Bazarr** - Subtitle manager for Sonarr/Radarr
- **Mylar3** - Comic book collection manager
- **Whisparr** - Adult media collection manager
- **Audiobookshelf** - Audiobook and podcast server

### Indexers

- **Prowlarr** - Indexer manager for \*arr apps
- **Jackett** - Alternative indexer manager
- **FlareSolverr** - Cloudflare bypass proxy

### Download Clients

- **qBittorrent** - BitTorrent client
- **SABnzbd** - Usenet downloader

### Media Servers

- **Plex** - Media server with streaming
- **Jellyfin** - Free open-source media server
- **Tautulli** - Plex monitoring and statistics
- **Tdarr** - Audio/video transcoding automation

### Request Management

- **Overseerr** - Request management for Plex
- **Jellyseerr** - Request management for Jellyfin

### Dashboards

- **Homarr** - Modern dashboard for all services
- **Heimdall** - Application dashboard and launcher
- **Homepage** - Highly customizable application dashboard

### Utilities

- **Portainer** - Docker container management UI
- **Huntarr** - Missing content manager for \*arr apps
- **Unpackerr** - Archive extraction for \*arr apps
- **FileBot** - Media file renaming and automator
- **Chromium** - Web browser for secure remote browsing
- **Guacamole** - Clientless remote desktop gateway
- **DDNS-Updater** - Dynamic DNS record updater

### VPN

- **Gluetun** - VPN client container for routing traffic

### Monitoring

- **Grafana** - Visual monitoring dashboard
- **Prometheus** - Systems and service monitoring
- **Dozzle** - Real-time log viewer for Docker containers
- **Uptime Kuma** - Self-hosted monitoring tool

### Infrastructure

- **Traefik** - Reverse proxy and load balancer
- **Cloudflared** - Cloudflare Tunnel for secure external access
- **Traefik Certs Dumper** - Extracts certificates from Traefik
- **CrowdSec** - Intrusion prevention system
- **Headscale** - Open-source Tailscale control server
- **Headplane** - Headscale web UI
- **Tailscale** - VPN mesh network client
- **Authentik** - Identity provider and SSO
- **PostgreSQL** - Database server
- **Valkey** - Redis-compatible key-value store

## Cloudflare Tunnel Setup

Expose your services securely without port forwarding using Cloudflare Tunnel:

### 1. Create a Tunnel

1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → Networks → Tunnels
2. Create a tunnel, name it (e.g., "easiarr")
3. Copy the tunnel token

### 2. Enable Cloudflared in easiarr

1. Run easiarr and go to **Manage Apps**
2. Enable **Cloudflared** and **Traefik**
3. In Secrets, paste your `CLOUDFLARE_TUNNEL_TOKEN`
4. Set `CLOUDFLARE_DNS_ZONE` to your domain (e.g., `example.com`)

### 3. Configure the Tunnel

In Cloudflare Zero Trust → Tunnels → Your Tunnel → Public Hostname:

| Subdomain | Domain        | Service             |
| --------- | ------------- | ------------------- |
| `*`       | `example.com` | `http://traefik:80` |

### 4. Add DNS Record

In Cloudflare DNS, add a CNAME:

| Type  | Name | Target                         |
| ----- | ---- | ------------------------------ |
| CNAME | `*`  | `<tunnel-id>.cfargotunnel.com` |

### 5. Settings

Go to **Settings** in easiarr to configure:

- **Traefik Entrypoint**: Set to `web` (for Cloudflare Tunnel)
- **Domain**: Your domain (e.g., `example.com`)

### 6. Secure with Cloudflare Access (Recommended)

1. Zero Trust → Access → Applications → Add Application
2. Hostname: `*.example.com`
3. Add policy: Allow your email address
4. Now all services require authentication!

## Configuration

easiarr stores its configuration in `~/.easiarr/`:

```bash
~/.easiarr/
├── config.json          # Your easiarr configuration
├── docker-compose.yml   # Generated Docker Compose file
└── backups/             # Configuration backups
```

## Development

```bash
# Install dependencies
bun install

# Run in development mode (with watch)
bun run dev

# Type check
bun run typecheck

# Lint
bun run lint

# Format
bun run format

# Run all checks (typecheck + lint + format:check)
bun run check

# Fix all issues (lint:fix + format)
bun run fix
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Related Projects

- [TRaSH Guides](https://trash-guides.info/) - Quality guides for Radarr, Sonarr, and more
- [OpenTUI](https://github.com/opentui/opentui) - Terminal UI framework used by easiarr
