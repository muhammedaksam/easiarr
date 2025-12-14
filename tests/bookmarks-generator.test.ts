import { describe, test, expect, jest } from "@jest/globals"

// Mock dependencies that have ESM-only imports (VersionInfo uses JSON import)
jest.mock("../src/VersionInfo", () => ({
  VersionInfo: {
    version: "1.0.0-test",
    name: "easiarr",
    description: "Test",
    author: "Test",
  },
  getVersion: () => "v1.0.0-test",
}))

jest.mock("../src/config/manager", () => ({
  getComposePath: () => "/mock/path/docker-compose.yml",
}))

jest.mock("../src/utils/env", () => ({
  readEnvSync: () => ({ LOCAL_DOCKER_IP: "localhost" }),
}))

import { generateBookmarksHtml } from "../src/config/bookmarks-generator"
import type { EasiarrConfig } from "../src/config/schema"
const mockConfig: EasiarrConfig = {
  version: "1.0.0",
  rootDir: "/data",
  timezone: "Europe/London",
  uid: 1000,
  gid: 1000,
  umask: "002",
  apps: [
    { id: "radarr", enabled: true, port: 7878 },
    { id: "sonarr", enabled: true, port: 8989 },
    { id: "prowlarr", enabled: true, port: 9696 },
    { id: "qbittorrent", enabled: true, port: 8080 },
    { id: "jellyfin", enabled: false, port: 8096 },
  ],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
}

describe("Bookmarks Generator", () => {
  test("generates valid Netscape bookmark format", () => {
    const html = generateBookmarksHtml(mockConfig)
    expect(html).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>")
    expect(html).toContain('<META HTTP-EQUIV="Content-Type"')
    expect(html).toContain("<TITLE>Bookmarks</TITLE>")
  })

  test("includes only enabled apps", () => {
    const html = generateBookmarksHtml(mockConfig)
    expect(html).toContain("Radarr")
    expect(html).toContain("Sonarr")
    expect(html).toContain("Prowlarr")
    expect(html).toContain("qBittorrent")
    expect(html).not.toContain("Jellyfin") // disabled
  })

  test("groups apps by category", () => {
    const html = generateBookmarksHtml(mockConfig)
    expect(html).toContain("Media Management")
    expect(html).toContain("Indexers")
    expect(html).toContain("Download Clients")
  })

  test("uses localhost URLs without Traefik", () => {
    const html = generateBookmarksHtml(mockConfig, true)
    expect(html).toContain("http://localhost:7878/")
    expect(html).toContain("http://localhost:8989/")
  })

  test("uses Traefik domain URLs when enabled", () => {
    const traefikConfig: EasiarrConfig = {
      ...mockConfig,
      traefik: { enabled: true, domain: "example.com", entrypoint: "websecure", middlewares: [] },
    }
    const html = generateBookmarksHtml(traefikConfig, false)
    expect(html).toContain("https://radarr.example.com/")
    expect(html).toContain("https://sonarr.example.com/")
  })

  test("uses localhost URLs when useLocalUrls is true even with Traefik", () => {
    const traefikConfig: EasiarrConfig = {
      ...mockConfig,
      traefik: { enabled: true, domain: "example.com", entrypoint: "websecure", middlewares: [] },
    }
    const html = generateBookmarksHtml(traefikConfig, true)
    expect(html).toContain("http://localhost:7878/")
    expect(html).not.toContain("https://radarr.example.com/")
  })
})
