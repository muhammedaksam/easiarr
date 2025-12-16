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

  test("configureTRaSHNaming merges current config with TRaSH config", async () => {
    // 1. GET response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 123, existingField: "keep-me", renameMovies: false }),
    } as Response)

    // 2. PUT response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "{}",
    } as Response)

    await client.configureTRaSHNaming("radarr")

    // Verify GET call
    expect(mockFetch).toHaveBeenNthCalledWith(1, "http://localhost:7878/api/v3/config/naming", expect.anything())

    // Verify PUT call with merged data
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:7878/api/v3/config/naming",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"id":123'), // ID preserved
      })
    )

    const putCall = mockFetch.mock.calls[1]
    const body = JSON.parse(putCall?.[1]?.body as string)

    // Check preservation
    expect(body.id).toBe(123)
    expect(body.existingField).toBe("keep-me")

    // Check overwrite
    expect(body.renameMovies).toBe(true) // Overwritten by TRaSH config
    expect(body.colonReplacementFormat).toBe("dash")
  })
})
