/**
 * App Registry
 * Definitions for all supported *arr ecosystem applications
 * Based on mediastack and TRaSH Guides configurations
 */

import type { AppDefinition, AppId } from "../config/schema"

export const APPS: Record<AppId, AppDefinition> = {
  // === SERVARR (Media Management) ===
  radarr: {
    id: "radarr",
    name: "Radarr",
    description: "Movie collection manager",
    category: "servarr",
    defaultPort: 7878,
    image: "lscr.io/linuxserver/radarr:latest",
    puid: 13002,
    pgid: 13000,
    volumes: (root) => [`${root}/config/radarr:/config`, `${root}/data:/data`],

    trashGuide: "docs/Radarr/",
    apiKeyMeta: {
      configFile: "config.xml",
      parser: "regex",
      selector: "<ApiKey>(.*?)</ApiKey>",
    },
    rootFolder: {
      path: "/data/media/movies",
      apiVersion: "v3",
    },
    prowlarrCategoryIds: [2000, 2010, 2020, 2030, 2040, 2045, 2050, 2060, 2070, 2080, 2090],
  },

  sonarr: {
    id: "sonarr",
    name: "Sonarr",
    description: "TV series collection manager",
    category: "servarr",
    defaultPort: 8989,
    image: "lscr.io/linuxserver/sonarr:latest",
    puid: 13001,
    pgid: 13000,
    volumes: (root) => [`${root}/config/sonarr:/config`, `${root}/data:/data`],

    trashGuide: "docs/Sonarr/",
    apiKeyMeta: {
      configFile: "config.xml",
      parser: "regex",
      selector: "<ApiKey>(.*?)</ApiKey>",
    },
    rootFolder: {
      path: "/data/media/tv",
      apiVersion: "v3",
    },
    prowlarrCategoryIds: [5000, 5010, 5020, 5030, 5040, 5045, 5050, 5060, 5070, 5080, 5090],
  },

  lidarr: {
    id: "lidarr",
    name: "Lidarr",
    description: "Music collection manager",
    category: "servarr",
    defaultPort: 8686,
    image: "lscr.io/linuxserver/lidarr:latest",
    puid: 13003,
    pgid: 13000,
    volumes: (root) => [`${root}/config/lidarr:/config`, `${root}/data:/data`],
    apiKeyMeta: {
      configFile: "config.xml",
      parser: "regex",
      selector: "<ApiKey>(.*?)</ApiKey>",
    },
    rootFolder: {
      path: "/data/media/music",
      apiVersion: "v1",
    },
    prowlarrCategoryIds: [3000, 3010, 3020, 3030, 3040, 3050, 3060],
  },

  readarr: {
    id: "readarr",
    name: "Readarr",
    description: "Book collection manager",
    category: "servarr",
    defaultPort: 8787,
    image: "lscr.io/linuxserver/readarr:develop",
    puid: 13004,
    pgid: 13000,
    volumes: (root) => [`${root}/config/readarr:/config`, `${root}/data:/data`],
    apiKeyMeta: {
      configFile: "config.xml",
      parser: "regex",
      selector: "<ApiKey>(.*?)</ApiKey>",
    },
    rootFolder: {
      path: "/data/media/books",
      apiVersion: "v1",
    },
    prowlarrCategoryIds: [7000, 7010, 7020, 7030, 7040, 7050, 7060],
    arch: {
      deprecated: ["arm64", "arm32"],
      warning: "Readarr is deprecated - no ARM64 support (project abandoned by upstream)",
    },
  },

  bazarr: {
    id: "bazarr",
    name: "Bazarr",
    description: "Subtitle manager for Sonarr/Radarr",
    category: "servarr",
    defaultPort: 6767,
    image: "lscr.io/linuxserver/bazarr:latest",
    puid: 13013,
    pgid: 13000,
    // TRaSH: Bazarr only needs media access, use /data/media for consistent paths
    volumes: (root) => [`${root}/config/bazarr:/config`, `${root}/data/media:/data/media`],
    dependsOn: ["sonarr", "radarr"],
    trashGuide: "docs/Bazarr/",
    apiKeyMeta: {
      configFile: "config/config.yaml",
      parser: "yaml",
      selector: "auth.apikey",
    },
  },

  mylar3: {
    id: "mylar3",
    name: "Mylar3",
    description: "Comic book collection manager",
    category: "servarr",
    defaultPort: 8090,
    image: "lscr.io/linuxserver/mylar3:latest",
    puid: 13005,
    pgid: 13000,
    volumes: (root) => [`${root}/config/mylar3:/config`, `${root}/data:/data`],
    apiKeyMeta: {
      configFile: "mylar/config.ini",
      parser: "ini",
      section: "API",
      selector: "api_key",
      enabledKey: "api_enabled",
      generateIfMissing: true,
    },
    // Note: Mylar3 is NOT an *arr app - has different API format (?cmd=<endpoint>)
    // Root folder is configured via Web UI settings, not API
  },

  whisparr: {
    id: "whisparr",
    name: "Whisparr",
    description: "Adult media collection manager",
    category: "servarr",
    defaultPort: 6969,
    image: "ghcr.io/hotio/whisparr:nightly",
    puid: 13015,
    pgid: 13000,
    volumes: (root) => [`${root}/config/whisparr:/config`, `${root}/data:/data`],
    apiKeyMeta: {
      configFile: "config.xml",
      parser: "regex",
      selector: "<ApiKey>(.*?)</ApiKey>",
    },
    rootFolder: {
      path: "/data/media/adult",
      apiVersion: "v3",
    },
    prowlarrCategoryIds: [6000, 6010, 6020, 6030, 6040, 6045, 6050, 6060, 6070, 6080, 6090],
  },

  audiobookshelf: {
    id: "audiobookshelf",
    name: "Audiobookshelf",
    description: "Audiobook and podcast server",
    category: "servarr",
    defaultPort: 13378,
    image: "ghcr.io/advplyr/audiobookshelf:latest",
    puid: 13014,
    pgid: 13000,
    volumes: (root) => [
      `${root}/config/audiobookshelf:/config`,
      `${root}/data/media/audiobooks:/audiobooks`,
      `${root}/data/media/podcasts:/podcasts`,
      `${root}/data/media/audiobookshelf-metadata:/metadata`,
    ],
  },

  // === INDEXERS ===
  prowlarr: {
    id: "prowlarr",
    name: "Prowlarr",
    description: "Indexer manager for *arr apps",
    category: "indexer",
    defaultPort: 9696,
    image: "lscr.io/linuxserver/prowlarr:develop",
    puid: 13006,
    pgid: 13000,
    volumes: (root) => [`${root}/config/prowlarr:/config`],

    trashGuide: "docs/Prowlarr/",
    apiKeyMeta: {
      configFile: "config.xml",
      parser: "regex",
      selector: "<ApiKey>(.*?)</ApiKey>",
    },
  },

  jackett: {
    id: "jackett",
    name: "Jackett",
    description: "Alternative indexer manager",
    category: "indexer",
    defaultPort: 9117,
    image: "lscr.io/linuxserver/jackett:latest",
    puid: 13008,
    pgid: 13000,
    volumes: (root) => [`${root}/config/jackett:/config`],
    apiKeyMeta: {
      configFile: "Jackett/ServerConfig.json",
      parser: "json",
      selector: "APIKey",
    },
  },

  flaresolverr: {
    id: "flaresolverr",
    name: "FlareSolverr",
    description: "Cloudflare bypass proxy",
    category: "indexer",
    defaultPort: 8191,
    image: "ghcr.io/flaresolverr/flaresolverr:latest",
    puid: 0,
    pgid: 0,
    volumes: () => [],
    environment: {
      LOG_LEVEL: "info",
      LOG_HTML: "false",
      CAPTCHA_SOLVER: "none",
    },
  },

  // === DOWNLOAD CLIENTS ===
  qbittorrent: {
    id: "qbittorrent",
    name: "qBittorrent",
    description: "BitTorrent client",
    category: "downloader",
    defaultPort: 8080,
    image: "lscr.io/linuxserver/qbittorrent:latest",
    puid: 13007,
    pgid: 13000,
    // TRaSH: Mount full /data for consistent paths with *arr apps (enables hardlinks)
    volumes: (root) => [`${root}/config/qbittorrent:/config`, `${root}/data:/data`],
    environment: { WEBUI_PORT: "8080" },
    secrets: [
      {
        name: "QBITTORRENT_USER",
        description: "Username for qBittorrent WebUI",
        required: false,
        default: "admin",
      },
      {
        name: "QBITTORRENT_PASSWORD",
        description: "Password for qBittorrent WebUI",
        required: false,
        mask: true,
      },
    ],
    trashGuide: "docs/Downloaders/qBittorrent/",
  },

  sabnzbd: {
    id: "sabnzbd",
    name: "SABnzbd",
    description: "Usenet downloader",
    category: "downloader",
    defaultPort: 8081,
    image: "lscr.io/linuxserver/sabnzbd:latest",
    puid: 13011,
    pgid: 13000,
    // TRaSH: Mount full /data for consistent paths with *arr apps (enables hardlinks)
    volumes: (root) => [`${root}/config/sabnzbd:/config`, `${root}/data:/data`],

    trashGuide: "docs/Downloaders/SABnzbd/",
    apiKeyMeta: {
      configFile: "sabnzbd.ini",
      parser: "regex",
      selector: "api_key\\s*=\\s*(.+)",
    },
  },

  // === MEDIA SERVERS ===
  plex: {
    id: "plex",
    name: "Plex",
    description: "Media server with streaming",
    category: "mediaserver",
    defaultPort: 32400,
    image: "lscr.io/linuxserver/plex:latest",
    puid: 13010,
    pgid: 13000,
    // TRaSH: Media servers only need media access, use /data/media for consistent paths
    volumes: (root) => [`${root}/config/plex:/config`, `${root}/data/media:/data/media`],
    environment: { VERSION: "docker" },
    trashGuide: "docs/Plex/",
    apiKeyMeta: {
      configFile: "Library/Application Support/Plex Media Server/Preferences.xml",
      parser: "regex",
      selector: 'PlexOnlineToken="([^"]+)"',
    },
  },

  jellyfin: {
    id: "jellyfin",
    name: "Jellyfin",
    description: "Free open-source media server",
    category: "mediaserver",
    defaultPort: 8096,
    image: "lscr.io/linuxserver/jellyfin:latest",
    puid: 0,
    pgid: 13000,
    volumes: (root) => [`${root}/config/jellyfin:/config`, `${root}/data/media:/data/media`],
  },

  tautulli: {
    id: "tautulli",
    name: "Tautulli",
    description: "Plex monitoring and statistics",
    category: "mediaserver",
    defaultPort: 8181,
    image: "lscr.io/linuxserver/tautulli:latest",
    puid: 0,
    pgid: 13000,
    volumes: (root) => [`${root}/config/tautulli:/config`],
    dependsOn: ["plex"],
    apiKeyMeta: {
      configFile: "config.ini",
      parser: "regex",
      selector: "api_key\\s*=\\s*(.+)",
    },
  },

  tdarr: {
    id: "tdarr",
    name: "Tdarr",
    description: "Audio/video transcoding automation",
    category: "mediaserver",
    defaultPort: 8265,
    image: "ghcr.io/haveagitgat/tdarr:latest",
    puid: 0,
    pgid: 13000,
    volumes: (root) => [
      `${root}/config/tdarr/server:/app/server`,
      `${root}/config/tdarr/configs:/app/configs`,
      `${root}/config/tdarr/logs:/app/logs`,
      `${root}/data/media:/data`,
    ],
    environment: { serverIP: "0.0.0.0", internalNode: "true" },
  },

  // === REQUEST MANAGEMENT ===
  overseerr: {
    id: "overseerr",
    name: "Overseerr",
    description: "Request management for Plex",
    category: "request",
    defaultPort: 5055,
    image: "sctx/overseerr:latest",
    puid: 13009,
    pgid: 13000,
    volumes: (root) => [`${root}/config/overseerr:/app/config`],
    dependsOn: ["plex"],
    apiKeyMeta: {
      configFile: "settings.json",
      parser: "json",
      selector: "main.apiKey",
    },
  },

  jellyseerr: {
    id: "jellyseerr",
    name: "Jellyseerr",
    description: "Request management for Jellyfin",
    category: "request",
    defaultPort: 5056,
    image: "fallenbagel/jellyseerr:latest",
    puid: 13012,
    pgid: 13000,
    volumes: (root) => [`${root}/config/jellyseerr:/app/config`],
    dependsOn: ["jellyfin"],
    apiKeyMeta: {
      configFile: "settings.json",
      parser: "json",
      selector: "main.apiKey",
    },
  },

  // === DASHBOARDS ===
  homarr: {
    id: "homarr",
    name: "Homarr",
    description: "Modern dashboard for all services",
    category: "dashboard",
    defaultPort: 7575,
    image: "ghcr.io/ajnart/homarr:latest",
    puid: 0,
    pgid: 0,
    volumes: (root) => [
      `${root}/config/homarr/configs:/app/data/configs`,
      `${root}/config/homarr/icons:/app/public/icons`,
      `${root}/config/homarr/data:/data`,
      "/var/run/docker.sock:/var/run/docker.sock",
    ],
  },

  heimdall: {
    id: "heimdall",
    name: "Heimdall",
    description: "Application dashboard and launcher",
    category: "dashboard",
    defaultPort: 8082,
    image: "lscr.io/linuxserver/heimdall:latest",
    puid: 0,
    pgid: 13000,
    volumes: (root) => [`${root}/config/heimdall:/config`],
  },

  homepage: {
    id: "homepage",
    name: "Homepage",
    description: "Highly customizable application dashboard",
    category: "dashboard",
    defaultPort: 3000,
    image: "ghcr.io/gethomepage/homepage:latest",
    puid: 0,
    pgid: 0,
    volumes: (root) => [`${root}/config/homepage:/app/config`, "/var/run/docker.sock:/var/run/docker.sock"],
  },

  // === UTILITIES ===
  portainer: {
    id: "portainer",
    name: "Portainer",
    description: "Docker container management UI",
    category: "utility",
    defaultPort: 9000,
    image: "portainer/portainer-ce:latest",
    puid: 0,
    pgid: 0,
    volumes: (root) => [`${root}/config/portainer:/data`, "/var/run/docker.sock:/var/run/docker.sock"],
    minPasswordLength: 12, // Portainer requires minimum 12 character password
  },

  huntarr: {
    id: "huntarr",
    name: "Huntarr",
    description: "Missing content manager for *arr apps",
    category: "utility",
    defaultPort: 9705,
    image: "huntarr/huntarr:latest",
    puid: 0,
    pgid: 13000,
    volumes: (root) => [`${root}/config/huntarr:/config`],
  },

  unpackerr: {
    id: "unpackerr",
    name: "Unpackerr",
    description: "Archive extraction for *arr apps",
    category: "utility",
    defaultPort: 5656,
    image: "golift/unpackerr",
    puid: 0,
    pgid: 13000,
    volumes: (root) => [`${root}/config/unpackerr:/config`, `${root}/data:/data`],
  },

  filebot: {
    id: "filebot",
    name: "FileBot",
    description: "Media file renaming and automator",
    category: "utility",
    defaultPort: 5452,
    image: "rednoah/filebot",
    puid: 13000,
    pgid: 13000,
    volumes: (root) => [`${root}/config/filebot:/data`, `${root}/data:/data`],
    environment: { DARK_MODE: "1" },
  },

  chromium: {
    id: "chromium",
    name: "Chromium",
    description: "Web browser for secure remote browsing",
    category: "utility",
    defaultPort: 3000,
    image: "lscr.io/linuxserver/chromium:latest",
    puid: 13000,
    pgid: 13000,
    volumes: (root) => [`${root}/config/chromium:/config`],
    environment: { TITLE: "Chromium" },
  },

  guacamole: {
    id: "guacamole",
    name: "Guacamole",
    description: "Clientless remote desktop gateway",
    category: "utility",
    defaultPort: 8080,
    image: "guacamole/guacamole",
    puid: 0,
    pgid: 0,
    volumes: (root) => [`${root}/config/guacamole:/config`],
    environment: {
      WEBAPP_CONTEXT: "ROOT",
      GUACD_HOSTNAME: "guacd",
      POSTGRESQL_HOSTNAME: "postgresql",
      POSTGRESQL_DATABASE: "guacamole",
      POSTGRESQL_USER: "${POSTGRESQL_USERNAME}",
      POSTGRESQL_PASSWORD: "${POSTGRESQL_PASSWORD}",
    },
    dependsOn: ["guacd", "postgresql"],
    secrets: [
      {
        name: "POSTGRESQL_USERNAME",
        description: "PostgreSQL Username",
        required: true,
        default: "postgres",
      },
      {
        name: "POSTGRESQL_PASSWORD",
        description: "PostgreSQL Password",
        required: true,
        mask: true,
      },
    ],
  },

  guacd: {
    id: "guacd",
    name: "Guacd",
    description: "Guacamole proxy daemon",
    category: "utility",
    defaultPort: 4822,
    image: "guacamole/guacd",
    puid: 0, // Guacd runs as restricted user inside, or PUID? MediaStack sets user: PUID:PGID
    pgid: 13000,
    volumes: (root) => [`${root}/config/guacd:/config`], // Not really used but keeps structure
    dependsOn: ["postgresql"],
  },

  "ddns-updater": {
    id: "ddns-updater",
    name: "DDNS-Updater",
    description: "Dynamic DNS record updater",
    category: "utility",
    defaultPort: 8000,
    image: "qmcgaw/ddns-updater",
    puid: 13000,
    pgid: 13000,
    volumes: (root) => [`${root}/config/ddns-updater:/data`],
  },

  // === VPN ===
  gluetun: {
    id: "gluetun",
    name: "Gluetun",
    description: "VPN client container for routing traffic",
    category: "vpn",
    defaultPort: 8888,
    image: "qmcgaw/gluetun:latest",
    puid: 0,
    pgid: 0,
    cap_add: ["NET_ADMIN"],
    devices: ["/dev/net/tun:/dev/net/tun"],
    volumes: (root) => [`${root}/config/gluetun:/gluetun`],
    environment: {
      VPN_SERVICE_PROVIDER: "${VPN_SERVICE_PROVIDER}",
      OPENVPN_USER: "${VPN_USERNAME}",
      OPENVPN_PASSWORD: "${VPN_PASSWORD}",
      WIREGUARD_PRIVATE_KEY: "${WIREGUARD_PRIVATE_KEY}",
      HTTPPROXY: "on",
      SHADOWSOCKS: "on",
    },
    secrets: [
      {
        name: "VPN_SERVICE_PROVIDER",
        description: "VPN Provider (e.g. custom, airvpn)",
        required: true,
        default: "custom",
      },
      {
        name: "VPN_USERNAME",
        description: "OpenVPN Username",
        required: false,
      },
      {
        name: "VPN_PASSWORD",
        description: "OpenVPN Password",
        required: false,
        mask: true,
      },
      {
        name: "WIREGUARD_PRIVATE_KEY",
        description: "WireGuard Private Key",
        required: false,
        mask: true,
      },
    ],
  },

  // === MONITORING ===
  grafana: {
    id: "grafana",
    name: "Grafana",
    description: "Visual monitoring dashboard",
    category: "monitoring",
    defaultPort: 3001,
    image: "grafana/grafana-enterprise",
    puid: 0,
    pgid: 13000,
    volumes: (root) => [`${root}/config/grafana:/var/lib/grafana`],
  },

  prometheus: {
    id: "prometheus",
    name: "Prometheus",
    description: "Systems and service monitoring",
    category: "monitoring",
    defaultPort: 9090,
    image: "prom/prometheus",
    puid: 0,
    pgid: 13000,
    volumes: (root) => [`${root}/config/prometheus:/prometheus`],
  },

  dozzle: {
    id: "dozzle",
    name: "Dozzle",
    description: "Real-time log viewer for Docker containers",
    category: "monitoring",
    defaultPort: 8888, // Often overlaps with Gluetun default 8888? Gluetun is 8888 proxy. Dozzle defaults 8080 or 8888?
    // checking default: usually 8080.
    // I'll set defaultPort to 9999 or something unique if possible, or 8080 and let user change.
    // Actually Dozzle defaults to 8080 inside container.
    image: "amir20/dozzle",
    puid: 0,
    pgid: 0,
    volumes: () => ["/var/run/docker.sock:/var/run/docker.sock"],
  },

  "uptime-kuma": {
    id: "uptime-kuma",
    name: "Uptime Kuma",
    description: "Self-hosted monitoring tool",
    category: "monitoring",
    defaultPort: 3001, // Commonly 3001
    image: "louislam/uptime-kuma:1",
    puid: 0,
    pgid: 0,
    volumes: (root) => [`${root}/config/uptime-kuma:/app/data`, "/var/run/docker.sock:/var/run/docker.sock"],
  },

  // === INFRASTRUCTURE ===
  traefik: {
    id: "traefik",
    name: "Traefik",
    description: "Reverse proxy and load balancer",
    category: "infrastructure",
    defaultPort: 8083,
    image: "traefik:latest",
    puid: 0,
    pgid: 0,
    volumes: (root) => [
      `${root}/config/traefik:/etc/traefik`,
      `${root}/config/traefik/letsencrypt:/letsencrypt`,
      "/var/run/docker.sock:/var/run/docker.sock:ro",
    ],
    secrets: [
      {
        name: "CLOUDFLARE_DNS_API_TOKEN",
        description: "Cloudflare DNS API Token for Traefik",
        required: false,
        mask: true,
      },
      {
        name: "CLOUDFLARE_DNS_ZONE",
        description: "Root Domain (e.g. example.com)",
        required: true,
      },
    ],
  },

  "traefik-certs-dumper": {
    id: "traefik-certs-dumper",
    name: "Traefik Certs Dumper",
    description: "Extracts certificates from Traefik",
    category: "infrastructure",
    defaultPort: 0,
    image: "ldez/traefik-certs-dumper:latest",
    puid: 0,
    pgid: 0,
    volumes: (root) => [`${root}/config/traefik/letsencrypt:/traefik:ro`, `${root}/config/traefik/certs:/output`],
    dependsOn: ["traefik"],
  },

  crowdsec: {
    id: "crowdsec",
    name: "CrowdSec",
    description: "Intrusion prevention system",
    category: "infrastructure",
    defaultPort: 8080,
    image: "crowdsecurity/crowdsec:latest",
    puid: 0,
    pgid: 0,
    volumes: (root) => [`${root}/config/crowdsec:/etc/crowdsec`, "/var/run/docker.sock:/var/run/docker.sock:ro"],
  },

  headscale: {
    id: "headscale",
    name: "Headscale",
    description: "Open-source Tailscale control server",
    category: "infrastructure",
    defaultPort: 8084,
    image: "headscale/headscale:latest",
    puid: 0,
    pgid: 0,
    volumes: (root) => [`${root}/config/headscale:/etc/headscale`, `${root}/config/headscale/data:/var/lib/headscale`],
  },

  headplane: {
    id: "headplane",
    name: "Headplane",
    description: "Headscale web UI",
    category: "infrastructure",
    defaultPort: 3000,
    image: "ghcr.io/tale/headplane:latest",
    puid: 0,
    pgid: 0,
    volumes: (root) => [`${root}/config/headplane:/config`],
    dependsOn: ["headscale"],
  },

  tailscale: {
    id: "tailscale",
    name: "Tailscale",
    description: "VPN mesh network client",
    category: "infrastructure",
    defaultPort: 0,
    image: "tailscale/tailscale:latest",
    puid: 0,
    pgid: 0,
    cap_add: ["NET_ADMIN"],
    devices: ["/dev/net/tun:/dev/net/tun"],
    volumes: (root) => [`${root}/config/tailscale:/var/lib/tailscale`],
    secrets: [
      {
        name: "TAILSCALE_AUTHKEY",
        description: "Tailscale Auth Key",
        required: true,
        mask: true,
      },
    ],
  },

  authentik: {
    id: "authentik",
    name: "Authentik",
    description: "Identity provider and SSO (Server)",
    category: "infrastructure",
    defaultPort: 9001,
    image: "ghcr.io/goauthentik/server:latest",
    puid: 0,
    pgid: 13000,
    volumes: (root) => [`${root}/config/authentik/media:/media`, `${root}/config/authentik/templates:/templates`],
    environment: {
      AUTHENTIK_REDIS__HOST: "valkey",
      AUTHENTIK_POSTGRESQL__HOST: "postgresql",
      AUTHENTIK_POSTGRESQL__NAME: "authentik",
      AUTHENTIK_POSTGRESQL__USER: "${POSTGRESQL_USERNAME}",
      AUTHENTIK_POSTGRESQL__PASSWORD: "${POSTGRESQL_PASSWORD}",
      AUTHENTIK_SECRET_KEY: "${AUTHENTIK_SECRET_KEY}",
    },
    dependsOn: ["postgresql", "valkey", "authentik-worker"],
    secrets: [
      {
        name: "AUTHENTIK_SECRET_KEY",
        description: "Authentik Secret Key",
        required: true,
        mask: true,
        generate: true,
      },
      {
        name: "POSTGRESQL_USERNAME",
        description: "Postgres Username",
        required: true,
        default: "postgres",
      },
      {
        name: "POSTGRESQL_PASSWORD",
        description: "Postgres Password",
        required: true,
        mask: true,
      },
    ],
  },

  "authentik-worker": {
    id: "authentik-worker",
    name: "Authentik Worker",
    description: "Identity provider background worker",
    category: "infrastructure",
    defaultPort: 0,
    image: "ghcr.io/goauthentik/server:latest",
    puid: 0,
    pgid: 13000,
    volumes: (root) => [
      `${root}/config/authentik/media:/media`,
      `${root}/config/authentik/templates:/templates`,
      `${root}/config/authentik/certs:/certs`,
      "/var/run/docker.sock:/var/run/docker.sock",
    ],
    environment: {
      AUTHENTIK_REDIS__HOST: "valkey",
      AUTHENTIK_POSTGRESQL__HOST: "postgresql",
      AUTHENTIK_POSTGRESQL__NAME: "authentik",
      AUTHENTIK_POSTGRESQL__USER: "${POSTGRESQL_USERNAME}",
      AUTHENTIK_POSTGRESQL__PASSWORD: "${POSTGRESQL_PASSWORD}",
      AUTHENTIK_SECRET_KEY: "${AUTHENTIK_SECRET_KEY}",
    },
    dependsOn: ["postgresql", "valkey"],
  },

  postgresql: {
    id: "postgresql",
    name: "PostgreSQL",
    description: "Database server",
    category: "infrastructure",
    defaultPort: 5432,
    image: "docker.io/library/postgres:latest",
    puid: 0,
    pgid: 13000,
    volumes: (root) => [`${root}/config/postgresql:/var/lib/postgresql/data`],
    environment: {
      POSTGRES_USER: "${POSTGRESQL_USERNAME}",
      POSTGRES_PASSWORD: "${POSTGRESQL_PASSWORD}",
      POSTGRES_DB: "authentik", // Default to authentik db or user needs to change?
    },
    secrets: [
      {
        name: "POSTGRESQL_USERNAME",
        description: "PostgreSQL Username",
        required: true,
        default: "postgres",
      },
      {
        name: "POSTGRESQL_PASSWORD",
        description: "PostgreSQL Password",
        required: true,
        mask: true,
      },
    ],
  },

  valkey: {
    id: "valkey",
    name: "Valkey",
    description: "Redis-compatible key-value store",
    category: "infrastructure",
    defaultPort: 6379,
    image: "valkey/valkey:alpine",
    puid: 0,
    pgid: 13000,
    volumes: (root) => [`${root}/config/valkey:/data`],
  },
}

export function getAppsByCategory(): Record<string, AppDefinition[]> {
  const result: Record<string, AppDefinition[]> = {}

  for (const app of Object.values(APPS)) {
    if (!result[app.category]) {
      result[app.category] = []
    }
    result[app.category].push(app)
  }

  return result
}

export function getApp(id: AppId): AppDefinition | undefined {
  return APPS[id]
}

export function getAllApps(): AppDefinition[] {
  return Object.values(APPS)
}

export function getAppIds(): AppId[] {
  return Object.keys(APPS) as AppId[]
}

import { getSystemArch, isAppCompatible, getArchWarning, isAppDeprecated } from "../util/arch"

/**
 * Get all apps compatible with the current system architecture
 */
export function getCompatibleApps(): AppDefinition[] {
  const arch = getSystemArch()
  return Object.values(APPS).filter((app) => isAppCompatible(app, arch))
}

/**
 * Get apps that have warnings for the current architecture (deprecated but may work)
 */
export function getAppsWithArchWarnings(): { app: AppDefinition; warning: string }[] {
  const arch = getSystemArch()
  const result: { app: AppDefinition; warning: string }[] = []

  for (const app of Object.values(APPS)) {
    const warning = getArchWarning(app, arch)
    if (warning) {
      result.push({ app, warning })
    }
  }

  return result
}

export { getSystemArch, isAppCompatible, getArchWarning, isAppDeprecated }
