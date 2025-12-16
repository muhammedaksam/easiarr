import { describe, expect, test } from "@jest/globals"
import {
  RADARR_PRESETS,
  SONARR_PRESETS,
  LIDARR_PRESETS,
  LIDARR_CF_SCORES,
  getPresetsForApp,
  getPresetById,
  CF_SCORES,
} from "../src/data/trash-profiles"

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

  describe("LIDARR_PRESETS (Davo's Guide)", () => {
    test("contains 3 presets", () => {
      expect(LIDARR_PRESETS).toHaveLength(3)
    })

    test("High Quality FLAC preset has correct settings", () => {
      const preset = LIDARR_PRESETS.find((p) => p.id === "high-quality-flac")
      expect(preset).toBeDefined()
      expect(preset?.cutoffQuality).toBe("FLAC")
      expect(preset?.allowedQualities).toContain("FLAC")
      expect(preset?.allowedQualities).toContain("MP3-320")
    })

    test("FLAC Only preset excludes MP3", () => {
      const preset = LIDARR_PRESETS.find((p) => p.id === "flac-only")
      expect(preset?.allowedQualities).not.toContain("MP3-320")
      expect(preset?.allowedQualities).toContain("FLAC")
    })

    test("presets avoid Vinyl releases", () => {
      const preset = LIDARR_PRESETS.find((p) => p.id === "high-quality-flac")
      expect(preset?.cfScores["Vinyl"]).toBe(-10000)
    })

    test("presets prefer CD over WEB source", () => {
      const preset = LIDARR_PRESETS.find((p) => p.id === "high-quality-flac")
      expect(preset?.cfScores["CD"]).toBeGreaterThan(preset?.cfScores["WEB"] || 0)
    })
  })

  describe("LIDARR_CF_SCORES", () => {
    test("Vinyl has negative score", () => {
      expect(LIDARR_CF_SCORES["Vinyl"]).toBe(-10000)
    })

    test("CD source preferred over WEB", () => {
      expect(LIDARR_CF_SCORES["CD"]).toBeGreaterThan(LIDARR_CF_SCORES["WEB"])
    })

    test("Preferred Groups have positive score", () => {
      expect(LIDARR_CF_SCORES["Preferred Groups"]).toBe(5)
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

    test("returns Lidarr presets for lidarr", () => {
      const presets = getPresetsForApp("lidarr")
      expect(presets).toEqual(LIDARR_PRESETS)
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

    test("finds Lidarr preset by id", () => {
      const preset = getPresetById("high-quality-flac")
      expect(preset?.name).toBe("High Quality FLAC")
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
