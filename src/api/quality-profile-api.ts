/**
 * Quality Profile API Client
 * Manages Quality Profiles and Custom Format scoring for Radarr/Sonarr
 */

export interface QualityItem {
  id?: number
  name?: string
  quality?: {
    id: number
    name: string
    source: string
    resolution: number
  }
  items?: QualityItem[]
  allowed: boolean
}

export interface FormatItem {
  format: number
  name?: string
  score: number
}

export interface QualityProfile {
  id?: number
  name: string
  upgradeAllowed: boolean
  cutoff: number
  minFormatScore: number
  cutoffFormatScore: number
  formatItems: FormatItem[]
  language?: { id: number; name: string }
  items: QualityItem[]
}

export interface QualityDefinition {
  id: number
  quality: {
    id: number
    name: string
    source: string
    resolution: number
  }
  title: string
  weight: number
  minSize: number
  maxSize: number
  preferredSize: number
}

export class QualityProfileClient {
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

  // Quality Profile methods
  async getQualityProfiles(): Promise<QualityProfile[]> {
    return this.request<QualityProfile[]>("/qualityprofile")
  }

  async getQualityProfile(id: number): Promise<QualityProfile> {
    return this.request<QualityProfile>(`/qualityprofile/${id}`)
  }

  async createQualityProfile(profile: Omit<QualityProfile, "id">): Promise<QualityProfile> {
    return this.request<QualityProfile>("/qualityprofile", {
      method: "POST",
      body: JSON.stringify(profile),
    })
  }

  async updateQualityProfile(id: number, profile: QualityProfile): Promise<QualityProfile> {
    return this.request<QualityProfile>(`/qualityprofile/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ...profile, id }),
    })
  }

  async deleteQualityProfile(id: number): Promise<void> {
    await this.request(`/qualityprofile/${id}`, { method: "DELETE" })
  }

  // Quality Definition methods (for size limits)
  async getQualityDefinitions(): Promise<QualityDefinition[]> {
    return this.request<QualityDefinition[]>("/qualitydefinition")
  }

  async updateQualityDefinitions(definitions: QualityDefinition[]): Promise<QualityDefinition[]> {
    return this.request<QualityDefinition[]>("/qualitydefinition/update", {
      method: "PUT",
      body: JSON.stringify(definitions),
    })
  }

  // Helper: Get quality by name from existing profiles
  async getQualityIdByName(name: string): Promise<number | null> {
    const profiles = await this.getQualityProfiles()
    if (profiles.length === 0) return null

    const findQuality = (items: QualityItem[]): number | null => {
      for (const item of items) {
        if (item.quality?.name === name) return item.quality.id
        if (item.items) {
          const found = findQuality(item.items)
          if (found !== null) return found
        }
      }
      return null
    }

    return findQuality(profiles[0].items)
  }

  // Create TRaSH-recommended profile
  async createTRaSHProfile(
    name: string,
    cutoffQualityName: string,
    allowedQualities: string[],
    cfScores: Record<string, number> = {}
  ): Promise<QualityProfile> {
    // Get existing profile to clone quality structure
    const existingProfiles = await this.getQualityProfiles()
    if (existingProfiles.length === 0) {
      throw new Error("No existing profiles to clone quality structure from")
    }

    const baseProfile = existingProfiles[0]
    const cutoffId = await this.getQualityIdByName(cutoffQualityName)

    if (cutoffId === null) {
      throw new Error(`Quality "${cutoffQualityName}" not found`)
    }

    // Build quality items with allowed flags
    const setAllowed = (items: QualityItem[]): QualityItem[] => {
      return items.map((item) => {
        if (item.items) {
          return { ...item, items: setAllowed(item.items) }
        }
        return {
          ...item,
          allowed: item.quality ? allowedQualities.includes(item.quality.name) : false,
        }
      })
    }

    // Get custom formats and map scores
    const formatItems: FormatItem[] = baseProfile.formatItems.map((fi) => ({
      format: fi.format,
      name: fi.name,
      score: cfScores[fi.name || ""] ?? 0,
    }))

    const newProfile: Omit<QualityProfile, "id"> = {
      name,
      upgradeAllowed: true,
      cutoff: cutoffId,
      minFormatScore: 0,
      cutoffFormatScore: 10000,
      formatItems,
      language: baseProfile.language,
      items: setAllowed(baseProfile.items),
    }

    return this.createQualityProfile(newProfile)
  }

  // Update CF scores on existing profile
  async updateProfileCFScores(profileId: number, cfScores: Record<string, number>): Promise<QualityProfile> {
    const profile = await this.getQualityProfile(profileId)

    profile.formatItems = profile.formatItems.map((fi) => ({
      ...fi,
      score: cfScores[fi.name || ""] ?? fi.score,
    }))

    return this.updateQualityProfile(profileId, profile)
  }
}
