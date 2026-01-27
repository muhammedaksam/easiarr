/**
 * Setup Types
 *
 * Core types shared by all setup actions.
 * These enable code reuse between FullAutoSetup and individual app screens.
 */

import { EasiarrConfig } from "../config/schema"

/**
 * Context passed to all setup actions.
 * Contains everything needed to configure an app.
 */
export interface SetupContext {
  /** The current easiarr configuration */
  config: EasiarrConfig

  /** Environment variables from .env file */
  env: Record<string, string>

  /** Global username for authentication (from USERNAME_GLOBAL) */
  globalUsername: string

  /** Global password for authentication (from PASSWORD_GLOBAL) */
  globalPassword: string

  /**
   * Optional callback when a step starts.
   * Used by UI to show "running" status.
   */
  onStepStart?: (stepName: string) => void

  /**
   * Optional callback when a step completes.
   * Used by UI to show success/error/skipped status.
   */
  onStepComplete?: (step: SetupStep) => void
}

/**
 * Status of a single step in a setup action.
 */
export type SetupStepStatus = "pending" | "running" | "success" | "error" | "skipped"

/**
 * Represents a single step in a multi-step setup action.
 */
export interface SetupStep {
  /** Human-readable name of the step */
  name: string

  /** Current status of the step */
  status: SetupStepStatus

  /** Optional message (e.g., error details, success info) */
  message?: string
}

/**
 * Result returned from a setup action.
 */
export interface SetupResult {
  /** Whether the action succeeded */
  success: boolean

  /** Human-readable message describing the result */
  message?: string

  /**
   * Environment variable updates to persist to .env file.
   * Caller is responsible for persisting these.
   */
  envUpdates?: Record<string, string>

  /**
   * Additional data returned by the action.
   * Type depends on the specific action.
   */
  data?: unknown
}

/**
 * Helper to report step progress during multi-step actions.
 *
 * @example
 * ```ts
 * reportStep(ctx, "Configure Radarr", "running")
 * const result = await configureRadarr(ctx)
 * reportStep(ctx, "Configure Radarr", result.success ? "success" : "error", result.message)
 * ```
 */
export function reportStep(ctx: SetupContext, name: string, status: SetupStepStatus, message?: string): void {
  if (status === "running") {
    ctx.onStepStart?.(name)
  }
  ctx.onStepComplete?.({ name, status, message })
}

/**
 * Creates a SetupContext from common sources.
 *
 * @param config - The easiarr configuration
 * @param env - Environment variables (typically from readEnvSync())
 * @param callbacks - Optional progress callbacks
 */
export function createSetupContext(
  config: EasiarrConfig,
  env: Record<string, string>,
  callbacks?: {
    onStepStart?: (stepName: string) => void
    onStepComplete?: (step: SetupStep) => void
  }
): SetupContext {
  return {
    config,
    env,
    globalUsername: env["USERNAME_GLOBAL"] || "admin",
    globalPassword: env["PASSWORD_GLOBAL"] || "",
    onStepStart: callbacks?.onStepStart,
    onStepComplete: callbacks?.onStepComplete,
  }
}

/**
 * Helper to check if an app is enabled in the config.
 */
export function isAppEnabled(ctx: SetupContext, appId: string): boolean {
  return ctx.config.apps.some((a) => a.id === appId && a.enabled)
}

/**
 * Helper to get app config if enabled.
 */
export function getEnabledAppConfig(ctx: SetupContext, appId: string): EasiarrConfig["apps"][number] | undefined {
  return ctx.config.apps.find((a) => a.id === appId && a.enabled)
}
