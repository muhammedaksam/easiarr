import { generateCompose } from "../src/compose/generator"
import type { EasiarrConfig, AppConfig } from "../src/config/schema"
import { describe, expect, test, jest, beforeEach } from "@jest/globals"
import { parse } from "yaml"

// Mock dependencies
jest.mock("node:fs/promises", () => ({
  writeFile: jest.fn(),
}))

jest.mock("../src/config/manager", () => ({
  getComposePath: () => "/mock/path/docker-compose.yml",
}))

// Helper to create valid config
const createConfig = (apps: AppConfig[]): EasiarrConfig => ({
  rootDir: "/data",
  timezone: "UTC",
  uid: 1000,
  gid: 1000,
  umask: "002",
  apps,
  version: "0.1.0",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

describe("Docker Compose Generator", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("generates basic service definition", () => {
    const config = createConfig([{ id: "radarr", enabled: true }])

    const output = generateCompose(config)
    const compose = parse(output)

    expect(compose.services).toBeDefined()
    expect(compose.services.radarr).toBeDefined()
    expect(compose.services.radarr.image).toBe("lscr.io/linuxserver/radarr:latest")
    expect(compose.services.radarr.ports).toContain("7878:7878")
  })

  test("includes Traefik labels when enabled", () => {
    const config = createConfig([{ id: "radarr", enabled: true }])
    config.traefik = {
      enabled: true,
      domain: "ROOT_DOMAIN", // Treated as env var name
      entrypoint: "websecure",
      middlewares: ["auth"],
    }

    const output = generateCompose(config)
    const compose = parse(output)

    const labels = compose.services.radarr.labels || []
    expect(labels).toContain("traefik.enable=true")
    // Should refer to literal domain if no variable syntax used
    expect(labels).toContain("traefik.http.routers.radarr.rule=Host(`radarr.ROOT_DOMAIN`)")
  })

  test("supports environment variable syntax in Traefik domain", () => {
    const config = createConfig([{ id: "radarr", enabled: true }])
    config.traefik = {
      enabled: true,
      domain: "${ROOT_DOMAIN}", // Explicit variable syntax
      entrypoint: "websecure",
      middlewares: [],
    }

    const output = generateCompose(config)
    const compose = parse(output)

    const labels = compose.services.radarr.labels || []
    expect(labels).toContain("traefik.http.routers.radarr.rule=Host(`radarr.${ROOT_DOMAIN}`)")
  })

  test("skips Traefik labels for Host Networking apps (Plex)", () => {
    const config = createConfig([{ id: "plex", enabled: true }])
    config.traefik = {
      enabled: true,
      domain: "example.com",
      entrypoint: "websecure",
      middlewares: [],
    }

    const output = generateCompose(config)
    const compose = parse(output)

    expect(compose.services.plex.network_mode).toBe("host")
    expect(compose.services.plex.labels).toBeUndefined()
  })

  test("VPN Mini Mode: routes ONLY downloaders", () => {
    const config = createConfig([
      { id: "gluetun", enabled: true },
      { id: "qbittorrent", enabled: true }, // Downloader
      { id: "radarr", enabled: true }, // Servarr (Media)
    ])
    config.vpn = { mode: "mini" }

    const output = generateCompose(config)
    const compose = parse(output)

    // qBittorrent: Routed
    expect(compose.services.qbittorrent.network_mode).toBe("service:gluetun")
    expect(compose.services.qbittorrent.ports).toBeUndefined()

    // Radarr: Not routed
    expect(compose.services.radarr.network_mode).toBeUndefined() // or not "service:gluetun"
    expect(compose.services.radarr.ports).toContain("7878:7878")

    // Gluetun: Should have qBittorrent ports
    expect(compose.services.gluetun.ports).toContain("8080:8080") // qbit default
  })

  test("VPN Full Mode: routes all relevant apps including Servarr", () => {
    const config = createConfig([
      { id: "gluetun", enabled: true },
      { id: "qbittorrent", enabled: true },
      { id: "radarr", enabled: true }, // Servarr
      { id: "prowlarr", enabled: true }, // Indexer
    ])
    config.vpn = { mode: "full" }

    const output = generateCompose(config)
    const compose = parse(output)

    // Radarr should be routed in Full mode
    expect(compose.services.radarr.network_mode).toBe("service:gluetun")
    expect(compose.services.radarr.ports).toBeUndefined()

    // Prowlarr should be routed
    expect(compose.services.prowlarr.network_mode).toBe("service:gluetun")
    expect(compose.services.prowlarr.ports).toBeUndefined()

    // Gluetun should have ports for all
    expect(compose.services.gluetun.ports).toContain("7878:7878") // Radarr
    expect(compose.services.gluetun.ports).toContain("9696:9696") // Prowlarr
  })
})
