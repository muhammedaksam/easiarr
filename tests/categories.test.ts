import { describe, expect, test } from "@jest/globals"
import {
  getCategoryForApp,
  getCategoryFieldName,
  getCategorySavePath,
  getCategoryInfo,
  getCategoriesForApps,
} from "../src/utils/categories"
import type { AppId } from "../src/config/schema"

describe("Category Utilities", () => {
  describe("getCategoryForApp", () => {
    test("returns 'movies' for radarr", () => {
      expect(getCategoryForApp("radarr")).toBe("movies")
    })

    test("returns 'tv' for sonarr", () => {
      expect(getCategoryForApp("sonarr")).toBe("tv")
    })

    test("returns 'music' for lidarr", () => {
      expect(getCategoryForApp("lidarr")).toBe("music")
    })

    test("returns 'books' for readarr", () => {
      expect(getCategoryForApp("readarr")).toBe("books")
    })

    test("returns 'adult' for whisparr", () => {
      expect(getCategoryForApp("whisparr")).toBe("adult")
    })

    test("returns 'comics' for mylar3", () => {
      expect(getCategoryForApp("mylar3")).toBe("comics")
    })

    test("returns 'default' for unsupported apps", () => {
      expect(getCategoryForApp("plex" as AppId)).toBe("default")
      expect(getCategoryForApp("jellyfin" as AppId)).toBe("default")
    })
  })

  describe("getCategoryFieldName", () => {
    test("returns 'movieCategory' for radarr", () => {
      expect(getCategoryFieldName("radarr")).toBe("movieCategory")
    })

    test("returns 'tvCategory' for sonarr", () => {
      expect(getCategoryFieldName("sonarr")).toBe("tvCategory")
    })

    test("returns 'tvCategory' for whisparr", () => {
      expect(getCategoryFieldName("whisparr")).toBe("tvCategory")
    })

    test("returns 'musicCategory' for lidarr", () => {
      expect(getCategoryFieldName("lidarr")).toBe("musicCategory")
    })

    test("returns 'bookCategory' for readarr", () => {
      expect(getCategoryFieldName("readarr")).toBe("bookCategory")
    })

    test("returns 'category' for unsupported apps", () => {
      expect(getCategoryFieldName("plex" as AppId)).toBe("category")
    })
  })

  describe("getCategorySavePath", () => {
    test("returns correct paths for each app", () => {
      expect(getCategorySavePath("radarr")).toBe("/data/torrents/movies")
      expect(getCategorySavePath("sonarr")).toBe("/data/torrents/tv")
      expect(getCategorySavePath("lidarr")).toBe("/data/torrents/music")
      expect(getCategorySavePath("readarr")).toBe("/data/torrents/books")
      expect(getCategorySavePath("whisparr")).toBe("/data/torrents/adult")
      expect(getCategorySavePath("mylar3")).toBe("/data/torrents/comics")
    })

    test("returns default path for unsupported apps", () => {
      expect(getCategorySavePath("plex" as AppId)).toBe("/data/torrents")
    })
  })

  describe("getCategoryInfo", () => {
    test("returns full info for supported apps", () => {
      const info = getCategoryInfo("radarr")
      expect(info).toEqual({
        name: "movies",
        savePath: "/data/torrents/movies",
        fieldName: "movieCategory",
      })
    })

    test("returns undefined for unsupported apps", () => {
      expect(getCategoryInfo("plex" as AppId)).toBeUndefined()
    })
  })

  describe("getCategoriesForApps", () => {
    test("returns categories for enabled apps", () => {
      const categories = getCategoriesForApps(["radarr", "sonarr"])
      expect(categories).toHaveLength(2)
      expect(categories[0].name).toBe("movies")
      expect(categories[1].name).toBe("tv")
    })

    test("filters out unsupported apps", () => {
      const categories = getCategoriesForApps(["radarr", "plex" as AppId, "sonarr"])
      expect(categories).toHaveLength(2)
    })

    test("returns empty array for no apps", () => {
      expect(getCategoriesForApps([])).toEqual([])
    })
  })
})
