import { describe, expect, test } from "@jest/globals"
import { RADARR_PRESETS, SONARR_PRESETS, getPresetsForApp, getPresetById, CF_SCORES } from "../src/data/trash-profiles"

describe("TRaSH Profile Presets", () => {
  describe("RADARR_PRESETS", () => {
    test("contains 4 presets", () => {
      expect(RADARR_PRESETS).toHaveLength(4)
    })

    test("HD Bluray + WEB preset has correct settings", () => {
      const preset = RADARR_PRESETS.find((p) => p.id === "hd-bluray-web")
      expect(preset).toBeDefined()
      expect(preset?.cutoffQuality).toBe("Bluray-1080p")
      expect(preset?.allowedQualities).toContain("Bluray-1080p")
      expect(preset?.allowedQualities).toContain("WEBDL-1080p")
    })

    test("UHD Bluray + WEB preset includes HDR scores", () => {
      const preset = RADARR_PRESETS.find((p) => p.id === "uhd-bluray-web")
      expect(preset?.cfScores["DV HDR10Plus"]).toBe(1600)
      expect(preset?.cfScores["HDR10Plus"]).toBe(700)
    })

    test("Remux presets include audio format scores", () => {
      const preset = RADARR_PRESETS.find((p) => p.id === "remux-web-1080p")
      expect(preset?.cfScores["TrueHD Atmos"]).toBe(5000)
      expect(preset?.cfScores["DTS X"]).toBe(4500)
    })
  })

  describe("SONARR_PRESETS", () => {
    test("contains 2 presets", () => {
      expect(SONARR_PRESETS).toHaveLength(2)
    })

    test("WEB-1080p preset has correct qualities", () => {
      const preset = SONARR_PRESETS.find((p) => p.id === "web-1080p")
      expect(preset?.cutoffQuality).toBe("WEBDL-1080p")
      expect(preset?.allowedQualities).toContain("WEBDL-1080p")
    })

    test("WEB-2160p preset includes HDR and streaming scores", () => {
      const preset = SONARR_PRESETS.find((p) => p.id === "web-2160p")
      expect(preset?.cfScores["DV"]).toBe(1400)
      expect(preset?.cfScores["ATVP"]).toBe(100)
    })
  })

  describe("getPresetsForApp", () => {
    test("returns Radarr presets for radarr", () => {
      const presets = getPresetsForApp("radarr")
      expect(presets).toEqual(RADARR_PRESETS)
    })

    test("returns Sonarr presets for sonarr", () => {
      const presets = getPresetsForApp("sonarr")
      expect(presets).toEqual(SONARR_PRESETS)
    })
  })

  describe("getPresetById", () => {
    test("finds Radarr preset by id", () => {
      const preset = getPresetById("hd-bluray-web")
      expect(preset?.name).toBe("HD Bluray + WEB")
    })

    test("finds Sonarr preset by id", () => {
      const preset = getPresetById("web-1080p")
      expect(preset?.name).toBe("WEB-1080p")
    })

    test("returns undefined for unknown id", () => {
      expect(getPresetById("unknown-preset")).toBeUndefined()
    })
  })

  describe("CF_SCORES", () => {
    test("unwanted formats have negative scores", () => {
      expect(CF_SCORES["BR-DISK"]).toBe(-10000)
      expect(CF_SCORES["LQ"]).toBe(-10000)
      expect(CF_SCORES["3D"]).toBe(-10000)
    })

    test("HDR formats have positive scores in correct order", () => {
      expect(CF_SCORES["DV HDR10Plus"]).toBeGreaterThan(CF_SCORES["DV HDR10"])
      expect(CF_SCORES["DV HDR10"]).toBeGreaterThan(CF_SCORES["DV"])
      expect(CF_SCORES["HDR10Plus"]).toBeGreaterThan(CF_SCORES["HDR10"])
    })

    test("audio formats have positive scores in correct order", () => {
      expect(CF_SCORES["TrueHD Atmos"]).toBeGreaterThan(CF_SCORES["DTS X"])
      expect(CF_SCORES["DTS X"]).toBeGreaterThan(CF_SCORES["TrueHD"])
      expect(CF_SCORES["TrueHD"]).toBeGreaterThan(CF_SCORES["DTS-HD MA"])
    })
  })
})
