/**
 * Utility App Setup Actions
 *
 * Setup functions for Portainer, Cloudflare, Maintainerr, Bazarr,
 * Huntarr, Slskd, Soularr, Recyclarr, Profilarr, Overseerr, and other utilities.
 */

import { SetupContext, SetupResult, getEnabledAppConfig } from "../types"
import { PortainerApiClient } from "../../api/portainer-api"
import { CloudflareApi, setupCloudflaredTunnel } from "../../api/cloudflare-api"
import { MaintainerrClient } from "../../api/maintainerr-api"
import { BazarrApiClient } from "../../api/bazarr-api"
import { HuntarrClient } from "../../api/huntarr-api"
import { OverseerrClient } from "../../api/overseerr-api"
import { ProfilarrApiClient } from "../../api/profilarr-api"
import { generateSlskdConfig, getSlskdConfigPath } from "../../config/slskd-config"
import { generateSoularrConfig, getSoularrConfigPath } from "../../config/soularr-config"
import { saveRecyclarrConfig } from "../../config/recyclarr-config"
import { getApp } from "../../apps/registry"
import { getApplicationUrl } from "../../utils/url-utils"
import { debugLog } from "../../utils/debug"
import { writeFile, mkdir } from "fs/promises"
import { dirname } from "path"
import { existsSync } from "fs"

/**
 * Setup Portainer container management
 */
export async function setupPortainer(ctx: SetupContext): Promise<SetupResult> {
  const portainerConfig = getEnabledAppConfig(ctx, "portainer")
  if (!portainerConfig) {
    return { success: false, message: "Not enabled" }
  }

  if (!ctx.globalPassword) {
    return { success: false, message: "No PASSWORD_GLOBAL set" }
  }

  const port = portainerConfig.port || 9000
  const client = new PortainerApiClient("localhost", port)

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
 * Setup Cloudflare Tunnel
 */
export async function setupCloudflare(ctx: SetupContext): Promise<SetupResult> {
  const cloudflaredConfig = getEnabledAppConfig(ctx, "cloudflared")
  if (!cloudflaredConfig) {
    return { success: false, message: "Not enabled" }
  }

  const apiToken = ctx.env["CLOUDFLARE_API_TOKEN"]
  if (!apiToken) {
    return { success: false, message: "No CLOUDFLARE_API_TOKEN in .env" }
  }

  const domain = ctx.env["CLOUDFLARE_DNS_ZONE"] || ctx.config.traefik?.domain
  if (!domain) {
    return { success: false, message: "No domain configured" }
  }

  try {
    // Create/update tunnel
    const result = await setupCloudflaredTunnel(apiToken, domain, "easiarr")

    // Prepare env updates
    const envUpdates: Record<string, string> = {
      CLOUDFLARE_TUNNEL_TOKEN: result.tunnelToken,
      CLOUDFLARE_TUNNEL_ID: result.tunnelId,
      CLOUDFLARE_ACCOUNT_ID: result.accountId,
      CLOUDFLARE_DNS_ZONE: domain,
    }

    // Optional: Set up Cloudflare Access if email is available
    const accessEmail = ctx.env["CLOUDFLARE_ACCESS_EMAIL"] || ctx.env["EMAIL_GLOBAL"]
    if (accessEmail) {
      try {
        const api = new CloudflareApi(apiToken)
        await api.setupAccessProtection(domain, [accessEmail], "easiarr")
        return { success: true, message: `Tunnel + Access for ${accessEmail}`, envUpdates }
      } catch {
        return { success: true, message: "Tunnel created (Access failed)", envUpdates }
      }
    }

    return { success: true, message: "Tunnel created", envUpdates }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Setup Overseerr request management
 */
export async function setupOverseerr(ctx: SetupContext): Promise<SetupResult> {
  const overseerrConfig = getEnabledAppConfig(ctx, "overseerr")
  if (!overseerrConfig) {
    return { success: false, message: "Not enabled" }
  }

  // Overseerr requires Plex
  const plexConfig = getEnabledAppConfig(ctx, "plex")
  if (!plexConfig) {
    return { success: false, message: "Plex not enabled" }
  }

  const plexToken = ctx.env["API_KEY_PLEX"]
  if (!plexToken) {
    return { success: false, message: "No API_KEY_PLEX in .env" }
  }

  const port = overseerrConfig.port || 5055
  const client = new OverseerrClient("localhost", port)

  try {
    const result = await client.setup({
      username: ctx.globalUsername,
      password: ctx.globalPassword,
      env: ctx.env,
      plexToken,
    })

    if (result.success) {
      // Set Overseerr's applicationUrl
      try {
        const overseerrUrl = getApplicationUrl("overseerr", port, ctx.config)
        await client.setApplicationUrl(overseerrUrl)
        debugLog("OverseerrSetup", `applicationUrl set to ${overseerrUrl}`)
      } catch {
        debugLog("OverseerrSetup", "Failed to set applicationUrl")
      }
    }

    return result
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Setup Maintainerr for media maintenance
 */
export async function setupMaintainerr(ctx: SetupContext): Promise<SetupResult> {
  const maintainerrConfig = getEnabledAppConfig(ctx, "maintainerr")
  if (!maintainerrConfig) {
    return { success: false, message: "Not enabled" }
  }

  // Requires Plex
  const plexConfig = getEnabledAppConfig(ctx, "plex")
  if (!plexConfig) {
    return { success: false, message: "Plex not enabled" }
  }

  const port = maintainerrConfig.port || 6246
  const client = new MaintainerrClient("localhost", port)

  try {
    const result = await client.setup({
      username: ctx.globalUsername,
      password: ctx.globalPassword,
      env: ctx.env,
      plexToken: ctx.env["API_KEY_PLEX"],
    })

    if (result.success) {
      // Configure Radarr connection if enabled
      const radarrConfig = getEnabledAppConfig(ctx, "radarr")
      if (radarrConfig && ctx.env["API_KEY_RADARR"]) {
        try {
          const radarrDef = getApp("radarr")
          const radarrPort = radarrConfig.port || radarrDef?.defaultPort || 7878
          await client.configureRadarr("radarr", radarrPort, ctx.env["API_KEY_RADARR"])
        } catch {
          /* connection failed */
        }
      }

      // Configure Sonarr connection if enabled
      const sonarrConfig = getEnabledAppConfig(ctx, "sonarr")
      if (sonarrConfig && ctx.env["API_KEY_SONARR"]) {
        try {
          const sonarrDef = getApp("sonarr")
          const sonarrPort = sonarrConfig.port || sonarrDef?.defaultPort || 8989
          await client.configureSonarr("sonarr", sonarrPort, ctx.env["API_KEY_SONARR"])
        } catch {
          /* connection failed */
        }
      }

      // Configure Overseerr connection if enabled
      const overseerrConfig = getEnabledAppConfig(ctx, "overseerr")
      if (overseerrConfig && ctx.env["API_KEY_OVERSEERR"]) {
        try {
          const overseerrDef = getApp("overseerr")
          const overseerrPort = overseerrConfig.port || overseerrDef?.defaultPort || 5055
          await client.configureOverseerr("overseerr", overseerrPort, ctx.env["API_KEY_OVERSEERR"])
        } catch {
          /* connection failed */
        }
      }

      // Configure Tautulli connection if enabled
      const tautulliConfig = getEnabledAppConfig(ctx, "tautulli")
      if (tautulliConfig && ctx.env["API_KEY_TAUTULLI"]) {
        try {
          const tautulliDef = getApp("tautulli")
          const tautulliPort = tautulliConfig.port || tautulliDef?.defaultPort || 8181
          await client.configureTautulli("tautulli", tautulliPort, ctx.env["API_KEY_TAUTULLI"])
        } catch {
          /* connection failed */
        }
      }
    }

    return result
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Setup Bazarr subtitle management
 */
export async function setupBazarr(ctx: SetupContext): Promise<SetupResult> {
  const bazarrConfig = getEnabledAppConfig(ctx, "bazarr")
  if (!bazarrConfig) {
    return { success: false, message: "Not enabled" }
  }

  const port = bazarrConfig.port || 6767
  const client = new BazarrApiClient("localhost", port)

  // Get and set API key if available
  const existingApiKey = ctx.env["API_KEY_BAZARR"]
  if (existingApiKey) {
    client.setApiKey(existingApiKey)
  }

  try {
    const result = await client.setup({
      username: ctx.globalUsername,
      password: ctx.globalPassword,
      env: ctx.env,
    })

    if (result.success) {
      // Configure Radarr/Sonarr connections
      let configured = 0
      const radarrConfig = getEnabledAppConfig(ctx, "radarr")
      if (radarrConfig && ctx.env["API_KEY_RADARR"]) {
        try {
          await client.configureRadarr("radarr", radarrConfig.port || 7878, ctx.env["API_KEY_RADARR"])
          configured++
        } catch {
          /* connection failed */
        }
      }

      const sonarrConfig = getEnabledAppConfig(ctx, "sonarr")
      if (sonarrConfig && ctx.env["API_KEY_SONARR"]) {
        try {
          await client.configureSonarr("sonarr", sonarrConfig.port || 8989, ctx.env["API_KEY_SONARR"])
          configured++
        } catch {
          /* connection failed */
        }
      }

      return {
        ...result,
        message: configured > 0 ? `${configured} apps connected` : result.message,
      }
    }

    return result
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Setup Huntarr for automatic searches
 */
export async function setupHuntarr(ctx: SetupContext): Promise<SetupResult> {
  const huntarrConfig = getEnabledAppConfig(ctx, "huntarr")
  if (!huntarrConfig) {
    return { success: false, message: "Not enabled" }
  }

  const port = huntarrConfig.port || 9705
  const client = new HuntarrClient("localhost", port)

  // Check if reachable
  const healthy = await client.isHealthy()
  if (!healthy) {
    return { success: false, message: "Not reachable yet" }
  }

  try {
    // Authenticate (creates user if needed, otherwise logs in)
    const authenticated = await client.authenticate(ctx.globalUsername, ctx.globalPassword)
    if (!authenticated) {
      return { success: false, message: "Auth failed" }
    }

    // Add enabled *arr apps to Huntarr
    const result = await client.setupEasiarrApps(ctx.config.apps, ctx.env)
    return { success: true, message: `${result.added} *arr apps added` }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Setup Slskd for Soulseek integration
 */
export async function setupSlskd(ctx: SetupContext): Promise<SetupResult> {
  const slskdConfig = getEnabledAppConfig(ctx, "slskd")
  if (!slskdConfig) {
    return { success: false, message: "Not enabled" }
  }

  try {
    // Generate slskd.yml config with auto-generated API key
    const { yaml, apiKey } = generateSlskdConfig(ctx.config)
    const configPath = getSlskdConfigPath(ctx.config.rootDir)

    // Ensure config directory exists
    const configDir = dirname(configPath)
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true })
    }

    // Create slskd download directories
    const slskdDownloadsDir = `${ctx.config.rootDir}/data/slskd_downloads`
    await mkdir(`${slskdDownloadsDir}/incomplete`, { recursive: true })
    await mkdir(`${slskdDownloadsDir}/complete`, { recursive: true })

    // Write slskd.yml
    await writeFile(configPath, yaml)

    return {
      success: true,
      message: "Config generated, API key saved",
      envUpdates: { API_KEY_SLSKD: apiKey },
    }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Setup Soularr for Lidarr/Slskd integration
 */
export async function setupSoularr(ctx: SetupContext): Promise<SetupResult> {
  const soularrConfig = getEnabledAppConfig(ctx, "soularr")
  if (!soularrConfig) {
    return { success: false, message: "Not enabled" }
  }

  // Check dependencies
  const lidarrConfig = getEnabledAppConfig(ctx, "lidarr")
  const slskdConfig = getEnabledAppConfig(ctx, "slskd")

  if (!lidarrConfig || !slskdConfig) {
    return { success: false, message: "Requires Lidarr & Slskd" }
  }

  try {
    // Generate soularr config.ini
    const configContent = generateSoularrConfig(ctx.config)
    const configPath = getSoularrConfigPath(ctx.config.rootDir)

    // Ensure directory exists
    const configDir = dirname(configPath)
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true })
    }

    // Write config file
    await writeFile(configPath, configContent)

    return { success: true, message: "Config generated" }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Setup Recyclarr for TRaSH guide syncing
 */
export async function setupRecyclarr(ctx: SetupContext): Promise<SetupResult> {
  const recyclarrConfig = getEnabledAppConfig(ctx, "recyclarr")
  if (!recyclarrConfig) {
    return { success: false, message: "Not enabled" }
  }

  // Check if we have at least one *arr app with API key
  const radarrApiKey = ctx.env["API_KEY_RADARR"]
  const sonarrApiKey = ctx.env["API_KEY_SONARR"]

  if (!radarrApiKey && !sonarrApiKey) {
    return { success: false, message: "No Radarr/Sonarr API keys" }
  }

  try {
    await saveRecyclarrConfig(ctx.config)
    return { success: true, message: "Config generated" }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Setup Profilarr for TRaSH profile management
 */
export async function setupProfilarr(ctx: SetupContext): Promise<SetupResult> {
  const profilarrConfig = getEnabledAppConfig(ctx, "profilarr")
  if (!profilarrConfig) {
    return { success: false, message: "Not enabled" }
  }

  const port = profilarrConfig.port || 6868
  const client = new ProfilarrApiClient("localhost", port)

  // Check if reachable
  const healthy = await client.isHealthy()
  if (!healthy) {
    return { success: false, message: "Not reachable yet" }
  }

  try {
    // Run the auto-setup process
    const result = await client.setup({
      username: ctx.globalUsername,
      password: ctx.globalPassword,
      env: ctx.env,
    })

    if (result.success) {
      // Configure Radarr if enabled
      const radarrConfig = getEnabledAppConfig(ctx, "radarr")
      if (radarrConfig && ctx.env["API_KEY_RADARR"]) {
        try {
          const radarrPort = radarrConfig.port || 7878
          await client.configureRadarr("radarr", radarrPort, ctx.env["API_KEY_RADARR"])
        } catch {
          /* connection failed */
        }
      }

      // Configure Sonarr if enabled
      const sonarrConfig = getEnabledAppConfig(ctx, "sonarr")
      if (sonarrConfig && ctx.env["API_KEY_SONARR"]) {
        try {
          const sonarrPort = sonarrConfig.port || 8989
          await client.configureSonarr("sonarr", sonarrPort, ctx.env["API_KEY_SONARR"])
        } catch {
          /* connection failed */
        }
      }
    }

    return result
  } catch (e) {
    return { success: false, message: String(e) }
  }
}
