/**
 * Bookmarks Generator
 * Generates Netscape-format HTML bookmarks for browser import
 */

import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import type { EasiarrConfig, AppCategory } from "./schema"
import { APP_CATEGORIES } from "./schema"
import { CATEGORY_ORDER } from "../apps/categories"
import { getApp } from "../apps/registry"
import { readEnvSync } from "../utils/env"

interface BookmarkEntry {
  name: string
  url: string
  description: string
}

type CategoryBookmarks = Map<AppCategory, BookmarkEntry[]>

/**
 * Get the URL for an app based on Traefik configuration
 */
function getAppUrl(appId: string, port: number, config: EasiarrConfig, useLocalUrls: boolean): string {
  if (!useLocalUrls && config.traefik?.enabled && config.traefik.domain) {
    return `https://${appId}.${config.traefik.domain}/`
  }
  // Read LOCAL_DOCKER_IP from .env file, fallback to localhost
  const env = readEnvSync()
  const host = env.LOCAL_DOCKER_IP || "localhost"
  return `http://${host}:${port}/`
}

/**
 * Generate bookmark entries grouped by category
 */
function generateBookmarksByCategory(config: EasiarrConfig, useLocalUrls: boolean): CategoryBookmarks {
  const categoryBookmarks: CategoryBookmarks = new Map()

  for (const appConfig of config.apps) {
    if (!appConfig.enabled) continue

    const appDef = getApp(appConfig.id)
    if (!appDef) continue

    const port = appConfig.port ?? appDef.defaultPort
    const url = getAppUrl(appConfig.id, port, config, useLocalUrls)

    const entry: BookmarkEntry = {
      name: appDef.name,
      url,
      description: appDef.description,
    }

    const category = appDef.category
    if (!categoryBookmarks.has(category)) {
      categoryBookmarks.set(category, [])
    }
    categoryBookmarks.get(category)!.push(entry)
  }

  return categoryBookmarks
}

/**
 * Generate Netscape-format HTML bookmarks
 */
export function generateBookmarksHtml(config: EasiarrConfig, useLocalUrls = false): string {
  const categoryBookmarks = generateBookmarksByCategory(config, useLocalUrls)

  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">easiarr</H3>
    <DL><p>
`

  // Add external resources first
  html += `        <DT><A HREF="https://github.com/muhammedaksam/easiarr/">GitHub | easiarr Project Repo</A>\n`
  html += `        <DT><A HREF="https://trash-guides.info/">TRaSH Guides</A>\n`

  // Add apps grouped by category in defined order
  for (const { id: categoryId } of CATEGORY_ORDER) {
    const bookmarks = categoryBookmarks.get(categoryId)
    if (!bookmarks || bookmarks.length === 0) continue

    const categoryName = APP_CATEGORIES[categoryId]

    // Add category header as a folder
    html += `        <DT><H3>${categoryName}</H3>\n`
    html += `        <DL><p>\n`

    for (const bookmark of bookmarks) {
      html += `            <DT><A HREF="${bookmark.url}">${bookmark.name} | ${bookmark.description}</A>\n`
    }

    html += `        </DL><p>\n`
  }

  // Close the structure
  html += `    </DL><p>
</DL><p>
`

  return html
}

/**
 * Get the path to the bookmarks file
 * @param type - 'local' for local URLs, 'remote' for Traefik URLs
 */
export function getBookmarksPath(type: "local" | "remote" = "local"): string {
  const filename = type === "remote" ? "bookmarks-remote.html" : "bookmarks-local.html"
  return join(homedir(), ".easiarr", filename)
}

/**
 * Save bookmarks HTML file
 * @param type - 'local' for local URLs, 'remote' for Traefik URLs
 */
export async function saveBookmarks(config: EasiarrConfig, type: "local" | "remote" = "local"): Promise<string> {
  const useLocalUrls = type === "local"
  const html = generateBookmarksHtml(config, useLocalUrls)
  const path = getBookmarksPath(type)
  await writeFile(path, html, "utf-8")
  return path
}

/**
 * Save all bookmarks files
 * Always saves local bookmarks, and remote bookmarks only if Traefik is enabled
 */
export async function saveAllBookmarks(config: EasiarrConfig): Promise<string[]> {
  const paths: string[] = []

  // Always save local bookmarks
  paths.push(await saveBookmarks(config, "local"))

  // Save remote bookmarks only if Traefik is enabled with a domain
  if (config.traefik?.enabled && config.traefik.domain) {
    paths.push(await saveBookmarks(config, "remote"))
  }

  return paths
}
