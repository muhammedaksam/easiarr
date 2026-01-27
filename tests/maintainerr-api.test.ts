import { describe, expect, test, jest, beforeEach } from "@jest/globals"
import { MaintainerrClient } from "../src/api/maintainerr-api"
import type { AutoSetupOptions } from "../src/api/auto-setup-types"

// Mock fetch globally
const mockFetch = jest.fn<typeof globalThis.fetch>()
global.fetch = mockFetch as unknown as typeof fetch

describe("MaintainerrClient", () => {
  let client: MaintainerrClient

  beforeEach(() => {
    client = new MaintainerrClient("localhost", 6246)
    mockFetch.mockReset()
  })

  describe("isHealthy", () => {
    test("returns true when API responds with 200", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      } as Response)

      const result = await client.isHealthy()
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:6246/api/settings/version", {
        method: "GET",
      })
    })

    test("returns false when API request fails", async () => {
      mockFetch.mockRejectedValue(new Error("Connection refused"))

      const result = await client.isHealthy()
      expect(result).toBe(false)
    })
  })

  describe("getVersion", () => {
    test("returns version info on success", async () => {
      // Maintainerr returns version as plain text
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "2.26.1",
      } as Response)

      const result = await client.getVersion()
      expect(result).toEqual({ version: "2.26.1" })
    })

    test("returns null on failure", async () => {
      mockFetch.mockResolvedValue({ ok: false } as Response)

      const result = await client.getVersion()
      expect(result).toBeNull()
    })
  })

  describe("getCollections", () => {
    test("returns collections list", async () => {
      const collections = [
        { id: 1, libraryId: 1, title: "Leaving Soon", isActive: true, arrAction: 0 },
        { id: 2, libraryId: 2, title: "Old Movies", isActive: false, arrAction: 1 },
      ]
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => collections,
      } as Response)

      const result = await client.getCollections()
      expect(result).toEqual(collections)
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:6246/api/collections", {
        method: "GET",
      })
    })

    test("filters by libraryId when provided", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      } as Response)

      await client.getCollections(1)
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:6246/api/collections?libraryId=1", {
        method: "GET",
      })
    })

    test("returns empty array on failure", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"))

      const result = await client.getCollections()
      expect(result).toEqual([])
    })
  })

  describe("getCollection", () => {
    test("returns specific collection by ID", async () => {
      const collection = { id: 5, libraryId: 1, title: "Test", isActive: true, arrAction: 0 }
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => collection,
      } as Response)

      const result = await client.getCollection(5)
      expect(result).toEqual(collection)
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:6246/api/collections/collection/5", { method: "GET" })
    })
  })

  describe("getRules", () => {
    test("returns all rule groups", async () => {
      const rules = [{ id: 1, libraryId: 1, name: "Old Movies", isActive: true }]
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => rules,
      } as Response)

      const result = await client.getRules()
      expect(result).toEqual(rules)
    })

    test("filters by activeOnly and libraryId", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      } as Response)

      await client.getRules(true, 2)
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:6246/api/rules?activeOnly=true&libraryId=2", {
        method: "GET",
      })
    })
  })

  describe("executeRules", () => {
    test("returns true on successful execution trigger", async () => {
      mockFetch.mockResolvedValue({ ok: true } as Response)

      const result = await client.executeRules()
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:6246/api/rules/execute", {
        method: "POST",
      })
    })

    test("returns false on failure", async () => {
      mockFetch.mockResolvedValue({ ok: false } as Response)

      const result = await client.executeRules()
      expect(result).toBe(false)
    })
  })

  describe("getTaskStatus", () => {
    test("returns task status for rule-executor", async () => {
      const status = { running: true, runningSince: "2025-01-20T09:55:00Z" }
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => status,
      } as Response)

      const result = await client.getTaskStatus("rule-executor")
      expect(result).toEqual(status)
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:6246/api/tasks/rule-executor/status", { method: "GET" })
    })
  })

  describe("getPlexLibraries", () => {
    test("returns Plex libraries", async () => {
      const libraries = [
        { key: "1", title: "Movies", type: "movie" },
        { key: "2", title: "TV Shows", type: "show" },
      ]
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => libraries,
      } as Response)

      const result = await client.getPlexLibraries()
      expect(result).toEqual(libraries)
    })
  })

  describe("setup", () => {
    const mockOptions: AutoSetupOptions = {
      username: "admin",
      password: "password",
      env: {},
    }

    test("returns success when Maintainerr is running and Plex connected", async () => {
      // Mock healthy check
      mockFetch.mockResolvedValueOnce({ ok: true } as Response)
      // Mock version response (returns plain text, not JSON)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "2.26.1",
      } as Response)
      // Mock API key generation (returns plain text)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "test-api-key",
      } as Response)
      // Mock setPlexToken
      mockFetch.mockResolvedValueOnce({ ok: true } as Response)
      // Mock getPlexServers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { name: "TestServer", connection: [{ address: "192.168.1.1", port: 32400, local: true, protocol: "http" }] },
        ],
      } as Response)
      // Mock getSettings for merge (used by configurePlexServer -> updateSettings)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1, collection_handler_job_cron: "0 0 * * *", rules_handler_job_cron: "0 0 * * *" }),
      } as Response)
      // Mock updateSettings POST (configurePlexServer)
      mockFetch.mockResolvedValueOnce({ ok: true } as Response)
      // Mock testPlexConnection
      mockFetch.mockResolvedValueOnce({ ok: true } as Response)

      const result = await client.setup({ ...mockOptions, plexToken: "test-plex-token" })
      expect(result.success).toBe(true)
      expect(result.message).toContain("Maintainerr v2.26.1")
      expect(result.message).toContain("Plex")
      expect(result.data?.requiresWizard).toBe(false)
    })

    test("returns success with wizard prompt when Plex not connected", async () => {
      // Mock healthy check
      mockFetch.mockResolvedValueOnce({ ok: true } as Response)
      // Mock version response (returns plain text, not JSON)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "2.26.1",
      } as Response)
      // Mock API key generation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apiKey: "test-api-key" }),
      } as Response)
      // Mock Plex connection test (fails)
      mockFetch.mockResolvedValueOnce({ ok: false } as Response)

      const result = await client.setup(mockOptions)
      expect(result.success).toBe(true)
      expect(result.message).toContain("Maintainerr v2.26.1")
      expect(result.data?.requiresWizard).toBe(true)
    })

    test("returns failure when Maintainerr not reachable", async () => {
      mockFetch.mockRejectedValue(new Error("Connection refused"))

      const result = await client.setup(mockOptions)
      expect(result.success).toBe(false)
      expect(result.message).toContain("not reachable")
    })
  })
})
