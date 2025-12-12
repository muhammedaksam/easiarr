import { describe, expect, test } from "@jest/globals"
import { TRASH_CF_NAMES, getAllCFNames, getCFNamesForCategories } from "../src/api/custom-format-api"

describe("Custom Format API", () => {
  describe("TRASH_CF_NAMES", () => {
    test("radarr has all required categories", () => {
      expect(TRASH_CF_NAMES.radarr.unwanted).toBeDefined()
      expect(TRASH_CF_NAMES.radarr.hdr).toBeDefined()
      expect(TRASH_CF_NAMES.radarr.audio).toBeDefined()
      expect(TRASH_CF_NAMES.radarr.streaming).toBeDefined()
      expect(TRASH_CF_NAMES.radarr.movieVersions).toBeDefined()
      expect(TRASH_CF_NAMES.radarr.misc).toBeDefined()
    })

    test("sonarr has all required categories", () => {
      expect(TRASH_CF_NAMES.sonarr.unwanted).toBeDefined()
      expect(TRASH_CF_NAMES.sonarr.hdr).toBeDefined()
      expect(TRASH_CF_NAMES.sonarr.streaming).toBeDefined()
      expect(TRASH_CF_NAMES.sonarr.hqGroups).toBeDefined()
      expect(TRASH_CF_NAMES.sonarr.misc).toBeDefined()
    })

    test("unwanted CFs include essential formats", () => {
      expect(TRASH_CF_NAMES.radarr.unwanted).toContain("br-disk")
      expect(TRASH_CF_NAMES.radarr.unwanted).toContain("lq")
      expect(TRASH_CF_NAMES.radarr.unwanted).toContain("3d")
    })

    test("HDR CFs include DV and HDR10+", () => {
      expect(TRASH_CF_NAMES.radarr.hdr).toContain("dv-hdr10plus")
      expect(TRASH_CF_NAMES.radarr.hdr).toContain("hdr10plus")
    })

    test("audio CFs include TrueHD Atmos and DTS-X", () => {
      expect(TRASH_CF_NAMES.radarr.audio).toContain("truehd-atmos")
      expect(TRASH_CF_NAMES.radarr.audio).toContain("dts-x")
    })
  })

  describe("getAllCFNames", () => {
    test("returns all radarr CF names", () => {
      const names = getAllCFNames("radarr")
      expect(names.length).toBeGreaterThan(30)
      expect(names).toContain("br-disk")
      expect(names).toContain("truehd-atmos")
      expect(names).toContain("amzn")
    })

    test("returns all sonarr CF names", () => {
      const names = getAllCFNames("sonarr")
      expect(names.length).toBeGreaterThan(20)
      expect(names).toContain("br-disk")
      expect(names).toContain("nf")
    })
  })

  describe("getCFNamesForCategories", () => {
    test("returns CFs for single category", () => {
      const names = getCFNamesForCategories("radarr", ["unwanted"])
      expect(names).toContain("br-disk")
      expect(names).toContain("lq")
      expect(names).not.toContain("truehd-atmos")
    })

    test("returns CFs for multiple categories", () => {
      const names = getCFNamesForCategories("radarr", ["unwanted", "hdr"])
      expect(names).toContain("br-disk")
      expect(names).toContain("dv-hdr10plus")
    })

    test("returns empty array for unknown category", () => {
      const names = getCFNamesForCategories("radarr", ["unknown"])
      expect(names).toEqual([])
    })
  })
})
