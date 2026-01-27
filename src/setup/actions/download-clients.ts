/**
 * Download Client Setup Actions
 *
 * Setup functions for qBittorrent and other download clients.
 */

import { QBittorrentCategory, QBittorrentClient } from "~/api/qbittorrent-api"
import { getEnabledAppConfig, SetupContext, SetupResult } from "~/setup/types"
import { getCategoriesForApps } from "~/utils/categories"

/**
 * Setup qBittorrent with TRaSH-compliant settings
 */
export async function setupQBittorrent(ctx: SetupContext): Promise<SetupResult> {
  const qbConfig = getEnabledAppConfig(ctx, "qbittorrent")
  if (!qbConfig) {
    return { success: false, message: "Not enabled" }
  }

  const host = "localhost"
  const port = qbConfig.port || 8080
  const user = ctx.env["USERNAME_QBITTORRENT"] || "admin"
  const pass = ctx.env["PASSWORD_QBITTORRENT"] || ctx.env["QBITTORRENT_PASS"] || ""

  if (!pass) {
    return { success: false, message: "No PASSWORD_QBITTORRENT in .env" }
  }

  const client = new QBittorrentClient(host, port, user, pass)

  try {
    const result = await client.setup({
      username: user,
      password: pass,
      env: ctx.env,
    })

    if (result.success) {
      // Configure categories after basic setup
      const enabledApps = ctx.config.apps.filter((a) => a.enabled).map((a) => a.id)
      const categories: QBittorrentCategory[] = getCategoriesForApps(enabledApps).map((cat) => ({
        name: cat.name,
        savePath: `/data/torrents/${cat.name}`,
      }))

      await client.configureTRaSHCompliant(categories, { user, pass })
      return { success: true, message: result.message }
    } else {
      return { success: false, message: result.message }
    }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}
