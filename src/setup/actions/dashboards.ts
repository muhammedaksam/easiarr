/**
 * Dashboard App Setup Actions
 *
 * Setup functions for Homarr, Heimdall, Homepage, and other dashboards.
 */

import { HeimdallClient } from "~/api/heimdall-api"
import { HomarrClient } from "~/api/homarr-api"
import { getEnabledAppConfig, SetupContext, SetupResult } from "~/setup/types"

/**
 * Setup Homarr dashboard
 */
export async function setupHomarr(ctx: SetupContext): Promise<SetupResult> {
  const homarrConfig = getEnabledAppConfig(ctx, "homarr")
  if (!homarrConfig) {
    return { success: false, message: "Not enabled" }
  }

  const port = homarrConfig.port || 7575
  const client = new HomarrClient("localhost", port)

  try {
    const result = await client.setup({
      username: ctx.globalUsername,
      password: ctx.globalPassword,
      env: ctx.env,
    })

    if (result.success) {
      // Add enabled apps to Homarr dashboard
      try {
        const addedCount = await client.setupEasiarrApps(ctx.config.apps)
        return { ...result, message: `${result.message}, ${addedCount} apps added` }
      } catch {
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
 * Setup Heimdall dashboard
 */
export async function setupHeimdall(ctx: SetupContext): Promise<SetupResult> {
  const heimdallConfig = getEnabledAppConfig(ctx, "heimdall")
  if (!heimdallConfig) {
    return { success: false, message: "Not enabled" }
  }

  const port = heimdallConfig.port || 8090
  const client = new HeimdallClient("localhost", port)

  try {
    const result = await client.setup({
      username: ctx.globalUsername,
      password: ctx.globalPassword,
      env: ctx.env,
    })

    if (result.success) {
      // Add enabled apps to Heimdall dashboard
      try {
        const addedCount = await client.setupEasiarrApps(ctx.config.apps)
        return { ...result, message: `${result.message}, ${addedCount} apps added` }
      } catch {
        return result
      }
    } else {
      return result
    }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}
