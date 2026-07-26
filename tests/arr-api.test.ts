import { beforeEach, describe, expect, jest, test } from "@jest/globals"
import { ArrApiClient, createQBittorrentConfig, createSABnzbdConfig } from "../src/api/arr-api"

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

describe("ArrApiClient", () => {
  const mockFetch = jest.fn<typeof globalThis.fetch>()

  beforeEach(() => {
    global.fetch = mockFetch as unknown as typeof fetch
    mockFetch.mockReset()
  })

  describe("addRootFolder", () => {
    test("automatically populates name and profile IDs for v1 API (Lidarr/Readarr style)", async () => {
      const client = new ArrApiClient("localhost", 8686, "test-api-key", "v1")

      const qProfiles = [{ id: 1, name: "Standard" }]
      const mProfiles = [{ id: 2, name: "Default" }]
      const rootFolderResp = { id: 10, path: "/data/media/music", name: "Music" }

      // Mock quality profiles endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(qProfiles),
      } as Response)

      // Mock metadata profiles endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mProfiles),
      } as Response)

      // Mock add root folder POST endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(rootFolderResp),
      } as Response)

      const result = await client.addRootFolder("/data/media/music")

      expect(result).toEqual({ id: 10, path: "/data/media/music", name: "Music" })
      expect(mockFetch).toHaveBeenCalledTimes(3)

      const postCall = mockFetch.mock.calls[2]
      expect(postCall[0]).toBe("http://localhost:8686/api/v1/rootfolder")
      const body = JSON.parse((postCall[1] as RequestInit).body as string)
      expect(body).toEqual({
        path: "/data/media/music",
        name: "Music",
        defaultQualityProfileId: 1,
        defaultMetadataProfileId: 2,
      })
    })

    test("preserves explicit name and options if provided", async () => {
      const client = new ArrApiClient("localhost", 8787, "test-api-key", "v1")

      const rootFolderResp = { id: 5, path: "/data/media/books", name: "Books" }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(rootFolderResp),
      } as Response)

      const result = await client.addRootFolder({
        path: "/data/media/books",
        name: "Books",
        defaultQualityProfileId: 3,
        defaultMetadataProfileId: 4,
      })

      expect(result).toEqual({ id: 5, path: "/data/media/books", name: "Books" })
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const postCall = mockFetch.mock.calls[0]
      const body = JSON.parse((postCall[1] as RequestInit).body as string)
      expect(body).toEqual({
        path: "/data/media/books",
        name: "Books",
        defaultQualityProfileId: 3,
        defaultMetadataProfileId: 4,
      })
    })
  })
})
