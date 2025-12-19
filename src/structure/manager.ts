import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { EasiarrConfig, AppId } from "../config/schema"
import { getApp } from "../apps/registry"

const BASE_DIRS = ["torrents", "usenet", "media"]

// Map apps to their content type folders
const CONTENT_TYPE_MAP: Partial<Record<AppId, string>> = {
  radarr: "movies",
  sonarr: "tv",
  lidarr: "music",
  readarr: "books",
  mylar3: "comics",
  whisparr: "adult",
}

export async function ensureDirectoryStructure(config: EasiarrConfig): Promise<void> {
  try {
    const dataRoot = join(config.rootDir, "data")
    const configRoot = join(config.rootDir, "config")

    // Create base directories
    await mkdir(dataRoot, { recursive: true })
    await mkdir(configRoot, { recursive: true })

    // 1. Create Base Directories (torrents, usenet, media)
    for (const dir of BASE_DIRS) {
      await mkdir(join(dataRoot, dir), { recursive: true })
    }

    // 2. Create Content Subdirectories based on enabled apps
    const enabledApps = new Set(config.apps.filter((a) => a.enabled).map((a) => a.id))

    for (const [appId, contentType] of Object.entries(CONTENT_TYPE_MAP)) {
      if (enabledApps.has(appId as AppId)) {
        // TRaSH Structure:
        // - Torrents: flat categories (data/torrents/movies, etc.)
        // - Usenet: categories inside complete (data/usenet/complete/movies, etc.)
        // - Media: flat library folders (data/media/movies, etc.)
        await mkdir(join(dataRoot, "torrents", contentType), { recursive: true })
        await mkdir(join(dataRoot, "usenet", "complete", contentType), { recursive: true })
        await mkdir(join(dataRoot, "media", contentType), { recursive: true })
      }
    }

    // 3. Special cases & MediaStack Extras

    // Always create 'photos' in media (Personal photos)
    await mkdir(join(dataRoot, "media", "photos"), { recursive: true })

    // TRaSH: Usenet has incomplete/complete structure, torrents do NOT
    await mkdir(join(dataRoot, "usenet", "incomplete"), { recursive: true })
    await mkdir(join(dataRoot, "usenet", "complete"), { recursive: true })

    // Manual download categories for both torrent and usenet
    for (const base of ["torrents", "usenet"]) {
      await mkdir(join(dataRoot, base, "console"), { recursive: true })
      await mkdir(join(dataRoot, base, "software"), { recursive: true })
      // Create 'watch' folder for manual .torrent/.nzb drops
      await mkdir(join(dataRoot, base, "watch"), { recursive: true })
    }

    if (enabledApps.has("prowlarr")) {
      // Prowlarr uncategorized downloads
      await mkdir(join(dataRoot, "torrents", "prowlarr"), { recursive: true })
      await mkdir(join(dataRoot, "usenet", "prowlarr"), { recursive: true })
    }

    if (enabledApps.has("filebot")) {
      await mkdir(join(dataRoot, "filebot", "input"), { recursive: true })
      await mkdir(join(dataRoot, "filebot", "output"), { recursive: true })
    }

    if (enabledApps.has("audiobookshelf")) {
      // Audiobookshelf usually resides in media/audiobooks and media/podcasts
      await mkdir(join(dataRoot, "media", "audiobooks"), { recursive: true })
      await mkdir(join(dataRoot, "media", "podcasts"), { recursive: true })
    }

    // 4. Create config directories for enabled apps
    // Dynamically check each app's volume definitions to see if it needs a config dir
    for (const appConfig of config.apps) {
      if (appConfig.enabled) {
        const appDef = getApp(appConfig.id)
        if (appDef) {
          // Check if app has volume that maps to config dir
          const volumes = appDef.volumes("$ROOT")
          const hasConfigVolume = volumes.some((v) => v.includes("/config/"))
          if (hasConfigVolume) {
            await mkdir(join(configRoot, appConfig.id), { recursive: true })
          }
        }
      }
    }

    // Special: Traefik needs letsencrypt subdirectory
    if (enabledApps.has("traefik")) {
      await mkdir(join(configRoot, "traefik", "letsencrypt"), { recursive: true })
    }
  } catch (error: unknown) {
    const err = error as { code?: string; message: string }
    if (err.code === "EACCES") {
      console.error(`\n⚠ Warning: Permission denied when creating directories at ${config.rootDir}`)
      console.error("  Please create the folders manually or check directory permissions.")
      console.error(`  Error: ${err.message}\n`)
      // Do not throw, allow setup to continue
    } else {
      throw error
    }
  }
}
