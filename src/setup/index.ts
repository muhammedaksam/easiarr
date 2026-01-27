/**
 * Setup Actions
 *
 * Reusable setup functions for all easiarr apps.
 * Import from here rather than individual action files.
 *
 * @example
 * ```ts
 * import { runJellyseerrFullSetup, createSetupContext } from "~/setup"
 *
 * const ctx = createSetupContext(config, env)
 * const result = await runJellyseerrFullSetup(ctx)
 * ```
 */

// Core types
export type { SetupContext, SetupResult, SetupStep, SetupStepStatus } from "./types"

// Core functions
export { reportStep, createSetupContext, isAppEnabled, getEnabledAppConfig } from "./types"

// Arr common actions (root folders, naming, quality, auth, external URLs)
export {
  setupArrRootFolders,
  setupArrNaming,
  setupArrQuality,
  setupArrAuthentication,
  setupBazarrAuthentication,
  setupArrExternalUrls,
} from "./actions/arr-common"

// Jellyseerr actions
export {
  checkJellyseerrPrerequisites,
  createJellyseerrClient,
  runJellyseerrWizard,
  configureJellyseerrRadarr,
  configureJellyseerrSonarr,
  setJellyseerrExternalUrl,
  setJellyseerrJellyfinUrl,
  syncJellyseerrLibraries,
  runJellyseerrFullSetup,
  type JellyseerrSetupOptions,
} from "./actions/jellyseerr"

// Prowlarr actions
export {
  createProwlarrClient,
  setupProwlarrApps,
  setupFlareSolverr,
  runProwlarrFullSetup,
} from "./actions/prowlarr"

// Download client actions
export { setupQBittorrent } from "./actions/download-clients"

// Media server actions
export { setupJellyfin, setupPlex } from "./actions/media-servers"

// Monitoring actions
export { setupUptimeKuma, setupGrafana, setupTautulli } from "./actions/monitoring"

// Dashboard actions
export { setupHomarr, setupHeimdall } from "./actions/dashboards"

// Utility actions
export {
  setupPortainer,
  setupCloudflare,
  setupOverseerr,
  setupMaintainerr,
  setupBazarr,
  setupHuntarr,
  setupSlskd,
  setupSoularr,
  setupRecyclarr,
  setupProfilarr,
} from "./actions/utilities"
