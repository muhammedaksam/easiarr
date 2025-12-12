/**
 * Custom Format API Client
 * Manages Custom Formats for Radarr/Sonarr with TRaSH Guides import capability
 */

export interface CFSpecification {
  name: string
  implementation: string
  negate: boolean
  required: boolean
  fields: { name: string; value: unknown }[]
}

export interface CustomFormat {
  id?: number
  name: string
  includeCustomFormatWhenRenaming: boolean
  specifications: CFSpecification[]
}

// TRaSH GitHub raw URL for Custom Formats
const TRASH_CF_BASE_URL = "https://raw.githubusercontent.com/TRaSH-Guides/Guides/master/docs/json"

export class CustomFormatClient {
  private baseUrl: string
  private apiKey: string
  private apiVersion: string

  constructor(host: string, port: number, apiKey: string, apiVersion = "v3") {
    this.baseUrl = `http://${host}:${port}/api/${apiVersion}`
    this.apiKey = apiKey
    this.apiVersion = apiVersion
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const headers: Record<string, string> = {
      "X-Api-Key": this.apiKey,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    }

    const response = await fetch(url, { ...options, headers })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    const text = await response.text()
    if (!text) return {} as T
    return JSON.parse(text) as T
  }

  // Custom Format CRUD
  async getCustomFormats(): Promise<CustomFormat[]> {
    return this.request<CustomFormat[]>("/customformat")
  }

  async getCustomFormat(id: number): Promise<CustomFormat> {
    return this.request<CustomFormat>(`/customformat/${id}`)
  }

  async createCustomFormat(cf: Omit<CustomFormat, "id">): Promise<CustomFormat> {
    return this.request<CustomFormat>("/customformat", {
      method: "POST",
      body: JSON.stringify(cf),
    })
  }

  async updateCustomFormat(id: number, cf: CustomFormat): Promise<CustomFormat> {
    return this.request<CustomFormat>(`/customformat/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ...cf, id }),
    })
  }

  async deleteCustomFormat(id: number): Promise<void> {
    await this.request(`/customformat/${id}`, { method: "DELETE" })
  }

  // Import from JSON (TRaSH format)
  async importCustomFormat(cfJson: Omit<CustomFormat, "id">): Promise<CustomFormat> {
    // Check if CF already exists by name
    const existing = await this.getCustomFormats()
    const duplicate = existing.find((cf) => cf.name === cfJson.name)

    if (duplicate) {
      // Update existing CF
      return this.updateCustomFormat(duplicate.id!, { ...cfJson, id: duplicate.id })
    }

    return this.createCustomFormat(cfJson)
  }

  // Import multiple CFs
  async importCustomFormats(cfs: Omit<CustomFormat, "id">[]): Promise<{ success: number; failed: number }> {
    let success = 0
    let failed = 0

    for (const cf of cfs) {
      try {
        await this.importCustomFormat(cf)
        success++
      } catch {
        failed++
      }
    }

    return { success, failed }
  }

  // Fetch CF from TRaSH GitHub
  static async fetchTRaSHCustomFormat(app: "radarr" | "sonarr", cfName: string): Promise<CustomFormat | null> {
    try {
      const url = `${TRASH_CF_BASE_URL}/${app}/cf/${cfName}.json`
      const response = await fetch(url)
      if (!response.ok) return null
      return (await response.json()) as CustomFormat
    } catch {
      return null
    }
  }

  // Fetch multiple CFs from TRaSH
  static async fetchTRaSHCustomFormats(
    app: "radarr" | "sonarr",
    cfNames: string[]
  ): Promise<{ cfs: CustomFormat[]; failed: string[] }> {
    const cfs: CustomFormat[] = []
    const failed: string[] = []

    for (const name of cfNames) {
      const cf = await this.fetchTRaSHCustomFormat(app, name)
      if (cf) {
        cfs.push(cf)
      } else {
        failed.push(name)
      }
    }

    return { cfs, failed }
  }
}

// Common TRaSH Custom Format names
export const TRASH_CF_NAMES = {
  radarr: {
    unwanted: ["br-disk", "lq", "lq-release-title", "3d", "x265-hd", "extras"],
    hdr: [
      "dv-hdr10plus",
      "dv-hdr10",
      "dv",
      "dv-hlg",
      "dv-sdr",
      "hdr10plus",
      "hdr10",
      "hdr",
      "hdr-undefined",
      "pq",
      "hlg",
    ],
    audio: [
      "truehd-atmos",
      "dts-x",
      "truehd",
      "dts-hd-ma",
      "flac",
      "pcm",
      "dts-hd-hra",
      "ddplus-atmos",
      "ddplus",
      "dts-es",
      "dts",
      "aac",
      "dd",
    ],
    streaming: ["amzn", "atvp", "dsnp", "hbo", "hmax", "hulu", "ma", "nf", "pcok", "pmtp"],
    movieVersions: ["imax-enhanced", "imax", "hybrid", "criterion-collection", "special-edition", "theatrical-cut"],
    misc: ["repack-proper", "repack2", "multi", "hq-remux", "hq-webdl", "hq"],
  },
  sonarr: {
    unwanted: ["br-disk", "lq", "lq-release-title", "x265-hd", "extras"],
    hdr: [
      "dv-hdr10plus",
      "dv-hdr10",
      "dv",
      "dv-hlg",
      "dv-sdr",
      "hdr10plus",
      "hdr10",
      "hdr",
      "hdr-undefined",
      "pq",
      "hlg",
    ],
    streaming: ["amzn", "atvp", "dsnp", "hbo", "hmax", "hulu", "nf", "pcok", "pmtp"],
    hqGroups: ["web-tier-01", "web-tier-02", "web-tier-03"],
    misc: ["repack-proper", "repack2", "multi"],
  },
}

// Get all CF names for a category
export function getAllCFNames(app: "radarr" | "sonarr"): string[] {
  const cfNames = TRASH_CF_NAMES[app]
  return Object.values(cfNames).flat()
}

// Get CF names for specific categories
export function getCFNamesForCategories(app: "radarr" | "sonarr", categories: string[]): string[] {
  const cfNames = TRASH_CF_NAMES[app] as Record<string, string[]>
  return categories.flatMap((cat) => cfNames[cat] || [])
}
