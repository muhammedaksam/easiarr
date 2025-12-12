/**
 * Download Category Utilities
 * Shared category mappings for *arr apps and download clients
 */

import type { AppId } from "../config/schema"

// Category info for each *arr app
export interface CategoryInfo {
  name: string
  savePath: string
  fieldName: string // Field name used in *arr download client config
}

// Master mapping of app IDs to their download categories
const CATEGORY_MAP: Partial<Record<AppId, CategoryInfo>> = {
  radarr: { name: "movies", savePath: "/data/torrents/movies", fieldName: "movieCategory" },
  sonarr: { name: "tv", savePath: "/data/torrents/tv", fieldName: "tvCategory" },
  lidarr: { name: "music", savePath: "/data/torrents/music", fieldName: "musicCategory" },
  readarr: { name: "books", savePath: "/data/torrents/books", fieldName: "bookCategory" },
  whisparr: { name: "adult", savePath: "/data/torrents/adult", fieldName: "tvCategory" },
  mylar3: { name: "comics", savePath: "/data/torrents/comics", fieldName: "category" },
}

/**
 * Get category name for an app (e.g., "movies" for radarr)
 */
export function getCategoryForApp(appId: AppId): string {
  return CATEGORY_MAP[appId]?.name ?? "default"
}

/**
 * Get the field name used in *arr download client config for category
 * (e.g., "movieCategory" for radarr, "tvCategory" for sonarr)
 */
export function getCategoryFieldName(appId: AppId): string {
  return CATEGORY_MAP[appId]?.fieldName ?? "category"
}

/**
 * Get the save path for an app's downloads (e.g., "/data/torrents/movies" for radarr)
 */
export function getCategorySavePath(appId: AppId): string {
  return CATEGORY_MAP[appId]?.savePath ?? "/data/torrents"
}

/**
 * Get full category info for an app
 */
export function getCategoryInfo(appId: AppId): CategoryInfo | undefined {
  return CATEGORY_MAP[appId]
}

/**
 * Get all category infos for a list of enabled app IDs
 */
export function getCategoriesForApps(appIds: AppId[]): CategoryInfo[] {
  return appIds.map((id) => CATEGORY_MAP[id]).filter((info): info is CategoryInfo => info !== undefined)
}
