/**
 * Monitoring App Setup Actions
 *
 * Setup functions for Uptime Kuma, Grafana, Tautulli, and other monitoring apps.
 */

import { SetupContext, SetupResult, getEnabledAppConfig } from "../types"
import { UptimeKumaClient } from "../../api/uptime-kuma-api"
import { GrafanaClient } from "../../api/grafana-api"
import { TautulliClient } from "../../api/tautulli-api"

/**
 * Setup Uptime Kuma monitoring
 */
export async function setupUptimeKuma(ctx: SetupContext): Promise<SetupResult> {
  const uptimeKumaConfig = getEnabledAppConfig(ctx, "uptime-kuma")
  if (!uptimeKumaConfig) {
    return { success: false, message: "Not enabled" }
  }

  const port = uptimeKumaConfig.port || 3001
  const client = new UptimeKumaClient("localhost", port)

  // Check if reachable
  const healthy = await client.isHealthy()
  if (!healthy) {
    return { success: false, message: "Not reachable yet" }
  }

  try {
    // Run auto-setup (creates admin or logs in)
    const result = await client.setup({
      username: ctx.globalUsername,
      password: ctx.globalPassword,
      env: ctx.env,
    })

    if (result.success) {
      // Now add monitors for enabled apps
      try {
        const loggedIn = await client.login(ctx.globalUsername, ctx.globalPassword)
        if (loggedIn) {
          const addedCount = await client.setupEasiarrMonitors(ctx.config.apps)
          client.disconnect()
          return { success: true, message: `${result.message}, ${addedCount} monitors added` }
        } else {
          client.disconnect()
          return result
        }
      } catch {
        client.disconnect()
        return result
      }
    } else {
      return result
    }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Setup Grafana monitoring dashboards
 */
export async function setupGrafana(ctx: SetupContext): Promise<SetupResult> {
  const grafanaConfig = getEnabledAppConfig(ctx, "grafana")
  if (!grafanaConfig) {
    return { success: false, message: "Not enabled" }
  }

  const port = grafanaConfig.port || 3001
  const client = new GrafanaClient("localhost", port)

  // Check if reachable
  const healthy = await client.isHealthy()
  if (!healthy) {
    return { success: false, message: "Not reachable yet" }
  }

  try {
    const result = await client.setup({
      username: ctx.globalUsername,
      password: ctx.globalPassword,
      env: ctx.env,
    })

    return result
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Setup Tautulli for Plex statistics
 */
export async function setupTautulli(ctx: SetupContext): Promise<SetupResult> {
  const tautulliConfig = getEnabledAppConfig(ctx, "tautulli")
  if (!tautulliConfig) {
    return { success: false, message: "Not enabled" }
  }

  const port = tautulliConfig.port || 8181
  const client = new TautulliClient("localhost", port)

  try {
    const result = await client.setup({
      username: ctx.globalUsername,
      password: ctx.globalPassword,
      env: ctx.env,
    })

    if (result.success && result.data?.requiresWizard) {
      return { ...result, message: `${result.message} (manual Plex setup needed)` }
    }

    return result
  } catch (e) {
    return { success: false, message: String(e) }
  }
}
