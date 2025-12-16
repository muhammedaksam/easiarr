import { describe, expect, test, jest, beforeEach } from "@jest/globals"
import { ArrApiClient } from "../src/api/arr-api"
import { TRASH_NAMING_CONFIG } from "../src/api/naming-config"

// Mock fetch
const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>
global.fetch = mockFetch

describe("Naming Configuration", () => {
  let client: ArrApiClient

  beforeEach(() => {
    client = new ArrApiClient("localhost", 7878, "api_key")
    mockFetch.mockReset()
  })

  test("getNamingConfig calls correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ renameMovies: true }),
    } as Response)

    const config = await client.getNamingConfig<any>()
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:7878/api/v3/config/naming",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Api-Key": "api_key" }),
      })
    )
    expect(config.renameMovies).toBe(true)
  })

  test("updateNamingConfig sends PUT request with config", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ renameMovies: true }),
    } as Response)

    const newConfig = { renameMovies: true, standardMovieFormat: "{Movie Title}" }
    // @ts-ignore
    await client.updateNamingConfig(newConfig)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:7878/api/v3/config/naming",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(newConfig),
      })
    )
  })

  test("configureTRaSHNaming applies Radarr config", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "{}",
    } as Response)

    await client.configureTRaSHNaming("radarr")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:7878/api/v3/config/naming",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(TRASH_NAMING_CONFIG.radarr),
      })
    )
  })

  test("configureTRaSHNaming applies Sonarr config", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "{}",
    } as Response)

    await client.configureTRaSHNaming("sonarr")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:7878/api/v3/config/naming",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(TRASH_NAMING_CONFIG.sonarr),
      })
    )
  })
})
