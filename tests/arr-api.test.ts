import { describe, expect, test } from "@jest/globals"
import { createQBittorrentConfig, createSABnzbdConfig } from "../src/api/arr-api"

describe("Download Client Configs", () => {
  describe("createQBittorrentConfig", () => {
    test("creates basic config with correct properties", () => {
      const config = createQBittorrentConfig("qbittorrent", 8080, "admin", "password")

      expect(config.name).toBe("qBittorrent")
      expect(config.implementation).toBe("QBittorrent")
      expect(config.configContract).toBe("QBittorrentSettings")
      expect(config.enable).toBe(true)
    })

    test("includes host, port, username, password fields", () => {
      const config = createQBittorrentConfig("192.168.1.100", 9090, "user", "secret")

      const hostField = config.fields.find((f) => f.name === "host")
      const portField = config.fields.find((f) => f.name === "port")
      const userField = config.fields.find((f) => f.name === "username")
      const passField = config.fields.find((f) => f.name === "password")

      expect(hostField?.value).toBe("192.168.1.100")
      expect(portField?.value).toBe(9090)
      expect(userField?.value).toBe("user")
      expect(passField?.value).toBe("secret")
    })

    test("includes savePath field", () => {
      const config = createQBittorrentConfig("qbittorrent", 8080, "admin", "password")

      const savePathField = config.fields.find((f) => f.name === "savePath")
      expect(savePathField?.value).toBe("/data/torrents")
    })

    test("uses app-specific category for radarr", () => {
      const config = createQBittorrentConfig("qbittorrent", 8080, "admin", "password", "radarr")

      const categoryField = config.fields.find((f) => f.name === "movieCategory")
      expect(categoryField?.value).toBe("movies")
    })

    test("uses app-specific category for sonarr", () => {
      const config = createQBittorrentConfig("qbittorrent", 8080, "admin", "password", "sonarr")

      const categoryField = config.fields.find((f) => f.name === "tvCategory")
      expect(categoryField?.value).toBe("tv")
    })

    test("uses default category when no appId provided", () => {
      const config = createQBittorrentConfig("qbittorrent", 8080, "admin", "password")

      const categoryField = config.fields.find((f) => f.name === "category")
      expect(categoryField?.value).toBe("default")
    })
  })

  describe("createSABnzbdConfig", () => {
    test("creates basic config with correct properties", () => {
      const config = createSABnzbdConfig("sabnzbd", 8081, "api-key-here")

      expect(config.name).toBe("SABnzbd")
      expect(config.implementation).toBe("Sabnzbd")
      expect(config.configContract).toBe("SabnzbdSettings")
      expect(config.enable).toBe(true)
    })

    test("includes host, port, apiKey fields", () => {
      const config = createSABnzbdConfig("192.168.1.100", 9090, "my-api-key")

      const hostField = config.fields.find((f) => f.name === "host")
      const portField = config.fields.find((f) => f.name === "port")
      const apiKeyField = config.fields.find((f) => f.name === "apiKey")

      expect(hostField?.value).toBe("192.168.1.100")
      expect(portField?.value).toBe(9090)
      expect(apiKeyField?.value).toBe("my-api-key")
    })

    test("includes savePath field", () => {
      const config = createSABnzbdConfig("sabnzbd", 8081, "api-key")

      const savePathField = config.fields.find((f) => f.name === "savePath")
      expect(savePathField?.value).toBe("/data/usenet")
    })

    test("uses app-specific category for radarr", () => {
      const config = createSABnzbdConfig("sabnzbd", 8081, "api-key", "radarr")

      const categoryField = config.fields.find((f) => f.name === "movieCategory")
      expect(categoryField?.value).toBe("movies")
    })
  })
})
