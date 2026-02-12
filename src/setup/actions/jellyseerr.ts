/**
 * Jellyseerr Setup Actions
 *
 * Reusable functions for configuring Jellyseerr.
 * Can be called from FullAutoSetup or JellyseerrSetup screen.
 */

import { JellyseerrClient } from "~/api/jellyseerr-api"
import { getApp } from "~/apps/registry"
import { getEnabledAppConfig, reportStep, SetupContext, SetupResult } from "~/setup/types"
import { debugLog } from "~/utils/debug"
import { getApplicationUrl } from "~/utils/url-utils"

// ============================================
// LOW-LEVEL ACTIONS (individual operations)
// ============================================

/**
 * Check if Jellyseerr is enabled and a media server is available.
 */
export async function checkJellyseerrPrerequisites(ctx: SetupContext): Promise<SetupResult> {
  const jellyseerrConfig = getEnabledAppConfig(ctx, "jellyseerr")
  if (!jellyseerrConfig) {
    return { success: false, message: "Not enabled" }
  }

  const hasJellyfin = getEnabledAppConfig(ctx, "jellyfin")
  const hasPlex = getEnabledAppConfig(ctx, "plex")

  if (!hasJellyfin && !hasPlex) {
    return { success: false, message: "No media server enabled" }
  }

  // Jellyseerr automation only works with Jellyfin
  if (!hasJellyfin) {
    return { success: false, message: "Plex requires manual setup" }
  }

  return { success: true }
}

/**
 * Create a JellyseerrClient for the configured Jellyseerr instance.
 */
export function createJellyseerrClient(ctx: SetupContext): JellyseerrClient | null {
  const config = getEnabledAppConfig(ctx, "jellyseerr")
  if (!config) return null

  const port = config.port || 5055
  return new JellyseerrClient("localhost", port)
}

/**
 * Run the base Jellyseerr setup wizard.
 * This calls the API client's setup method which handles:
 * - Health check
 * - Authentication with Jellyfin
 * - Library sync
 * - API key retrieval
 * - Initialization
 */
export async function runJellyseerrWizard(ctx: SetupContext): Promise<SetupResult> {
  const client = createJellyseerrClient(ctx)
  if (!client) {
    return { success: false, message: "Jellyseerr not enabled" }
  }

  const result = await client.setup({
    username: ctx.globalUsername,
    password: ctx.globalPassword,
    env: ctx.env,
  })

  return result
}

/**
 * Configure Radarr connection in Jellyseerr.
 */
export async function configureJellyseerrRadarr(ctx: SetupContext): Promise<SetupResult> {
  const client = createJellyseerrClient(ctx)
  if (!client) {
    return { success: false, message: "Jellyseerr not enabled" }
  }

  const radarrConfig = getEnabledAppConfig(ctx, "radarr")
  if (!radarrConfig) {
    return { success: false, message: "Radarr not enabled" }
  }

  const radarrApiKey = ctx.env["API_KEY_RADARR"]
  if (!radarrApiKey) {
    return { success: false, message: "No Radarr API key" }
  }

  const radarrDef = getApp("radarr")
  const radarrPort = radarrConfig.port || radarrDef?.defaultPort || 7878
  const radarrExternalUrl = getApplicationUrl("radarr", radarrPort, ctx.config)
  const rootFolder = radarrDef?.rootFolder?.path || "/data/media/movies"

  try {
    const result = await client.configureRadarr(
      "radarr",
      radarrPort,
      radarrApiKey,
      rootFolder,
      radarrExternalUrl
    )

    if (result) {
      debugLog("JellyseerrSetup", `Radarr configured: ${result.activeProfileName}`)
      return { success: true, message: `Profile: ${result.activeProfileName}` }
    } else {
      return { success: false, message: "Configuration failed" }
    }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Configure Sonarr connection in Jellyseerr.
 */
export async function configureJellyseerrSonarr(ctx: SetupContext): Promise<SetupResult> {
  const client = createJellyseerrClient(ctx)
  if (!client) {
    return { success: false, message: "Jellyseerr not enabled" }
  }

  const sonarrConfig = getEnabledAppConfig(ctx, "sonarr")
  if (!sonarrConfig) {
    return { success: false, message: "Sonarr not enabled" }
  }

  const sonarrApiKey = ctx.env["API_KEY_SONARR"]
  if (!sonarrApiKey) {
    return { success: false, message: "No Sonarr API key" }
  }

  const sonarrDef = getApp("sonarr")
  const sonarrPort = sonarrConfig.port || sonarrDef?.defaultPort || 8989
  const sonarrExternalUrl = getApplicationUrl("sonarr", sonarrPort, ctx.config)
  const rootFolder = sonarrDef?.rootFolder?.path || "/data/media/tv"

  try {
    const result = await client.configureSonarr(
      "sonarr",
      sonarrPort,
      sonarrApiKey,
      rootFolder,
      sonarrExternalUrl
    )

    if (result) {
      debugLog("JellyseerrSetup", `Sonarr configured: ${result.activeProfileName}`)
      return { success: true, message: `Profile: ${result.activeProfileName}` }
    } else {
      return { success: false, message: "Configuration failed" }
    }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Set Jellyseerr's application URL for external access.
 */
export async function setJellyseerrExternalUrl(ctx: SetupContext): Promise<SetupResult> {
  const client = createJellyseerrClient(ctx)
  if (!client) {
    return { success: false, message: "Jellyseerr not enabled" }
  }

  const config = getEnabledAppConfig(ctx, "jellyseerr")!
  const port = config.port || 5055

  try {
    const url = getApplicationUrl("jellyseerr", port, ctx.config)
    await client.setApplicationUrl(url)
    debugLog("JellyseerrSetup", `applicationUrl set to ${url}`)
    return { success: true, message: url }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Set Jellyfin's external hostname in Jellyseerr settings.
 * This is used for navigation links from Jellyseerr to Jellyfin.
 */
export async function setJellyseerrJellyfinUrl(ctx: SetupContext): Promise<SetupResult> {
  const client = createJellyseerrClient(ctx)
  if (!client) {
    return { success: false, message: "Jellyseerr not enabled" }
  }

  const jellyfinConfig = getEnabledAppConfig(ctx, "jellyfin")
  if (!jellyfinConfig) {
    return { success: false, message: "Jellyfin not enabled" }
  }

  const jellyfinPort = jellyfinConfig.port || 8096

  try {
    const jellyfinUrl = getApplicationUrl("jellyfin", jellyfinPort, ctx.config)
    await client.updateJellyfinSettings({ externalHostname: jellyfinUrl })
    debugLog("JellyseerrSetup", `Jellyfin externalHostname set to ${jellyfinUrl}`)
    return { success: true, message: jellyfinUrl }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Sync and enable all Jellyfin libraries.
 */
export async function syncJellyseerrLibraries(ctx: SetupContext): Promise<SetupResult> {
  const client = createJellyseerrClient(ctx)
  if (!client) {
    return { success: false, message: "Jellyseerr not enabled" }
  }

  try {
    const libraries = await client.syncJellyfinLibraries()
    const libraryIds = libraries.map((lib) => lib.id)
    if (libraryIds.length > 0) {
      await client.enableLibraries(libraryIds)
    }
    return { success: true, message: `${libraries.length} libraries synced` }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

// ============================================
// HIGH-LEVEL ACTIONS (orchestrated workflows)
// ============================================

export interface JellyseerrSetupOptions {
  /** Skip Radarr/Sonarr configuration */
  skipArrApps?: boolean
  /** Skip library sync (already done in wizard) */
  skipLibraries?: boolean
  /** Skip external URL configuration */
  skipExternalUrls?: boolean
}

/**
 * Full Jellyseerr setup - runs all steps in sequence.
 *
 * This is the main entry point called by both:
 * - FullAutoSetup.setupJellyseerr()
 * - JellyseerrSetup.runSetupWizard()
 */
export async function runJellyseerrFullSetup(
  ctx: SetupContext,
  options: JellyseerrSetupOptions = {}
): Promise<SetupResult> {
  // 1. Check prerequisites
  reportStep(ctx, "Check prerequisites", "running")
  const prereq = await checkJellyseerrPrerequisites(ctx)
  if (!prereq.success) {
    reportStep(ctx, "Check prerequisites", "skipped", prereq.message)
    return prereq
  }
  reportStep(ctx, "Check prerequisites", "success")

  // 2. Run wizard (creates admin, connects to Jellyfin, syncs libraries)
  reportStep(ctx, "Setup wizard", "running")
  const wizard = await runJellyseerrWizard(ctx)
  if (!wizard.success) {
    reportStep(
      ctx,
      "Setup wizard",
      wizard.message === "Already configured" ? "success" : "error",
      wizard.message
    )
    // If already configured, we can still continue with arr apps
    if (wizard.message !== "Already configured") {
      return wizard
    }
  } else {
    reportStep(ctx, "Setup wizard", "success", wizard.message)
  }

  // 3. Configure Radarr (optional)
  if (!options.skipArrApps) {
    const radarrConfig = getEnabledAppConfig(ctx, "radarr")
    if (radarrConfig && ctx.env["API_KEY_RADARR"]) {
      reportStep(ctx, "Configure Radarr", "running")
      const radarr = await configureJellyseerrRadarr(ctx)
      reportStep(ctx, "Configure Radarr", radarr.success ? "success" : "skipped", radarr.message)
    }

    const sonarrConfig = getEnabledAppConfig(ctx, "sonarr")
    if (sonarrConfig && ctx.env["API_KEY_SONARR"]) {
      reportStep(ctx, "Configure Sonarr", "running")
      const sonarr = await configureJellyseerrSonarr(ctx)
      reportStep(ctx, "Configure Sonarr", sonarr.success ? "success" : "skipped", sonarr.message)
    }
  }

  // 4. Set external URLs (optional)
  if (!options.skipExternalUrls) {
    // Set Jellyfin's external hostname for navigation
    reportStep(ctx, "Jellyfin URL", "running")
    const jellyfinUrl = await setJellyseerrJellyfinUrl(ctx)
    reportStep(
      ctx,
      "Jellyfin URL",
      jellyfinUrl.success ? "success" : "skipped",
      jellyfinUrl.message
    )

    // Set Jellyseerr's own applicationUrl
    reportStep(ctx, "Jellyseerr URL", "running")
    const jellyseerrUrl = await setJellyseerrExternalUrl(ctx)
    reportStep(
      ctx,
      "Jellyseerr URL",
      jellyseerrUrl.success ? "success" : "skipped",
      jellyseerrUrl.message
    )
  }

  return {
    success: true,
    message: "Jellyseerr configured",
    envUpdates: wizard.envUpdates,
  }
}
