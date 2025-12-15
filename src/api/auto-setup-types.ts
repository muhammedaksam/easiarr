/**
 * Auto-Setup Types
 * Interfaces for auto-setup capability metadata and clients
 */

import type { AppId } from "../config/schema"

/**
 * Describes an app's auto-setup capability
 */
export interface AutoSetupCapability {
  /** Type of auto-setup support */
  type: "full" | "partial" | "manual"
  /** Human-readable description of what gets configured */
  description: string
  /** Other apps that must be set up first */
  requires?: AppId[]
  /** Environment variables required for setup */
  envVars?: string[]
  /** Setup function name in FullAutoSetup (for dynamic discovery) */
  setupMethod?: string
}

/**
 * Result of an auto-setup operation
 */
export interface AutoSetupResult {
  success: boolean
  message?: string
  /** Data to persist (e.g., API keys, tokens) */
  envUpdates?: Record<string, string>
}

/**
 * Base interface for auto-setup clients
 */
export interface IAutoSetupClient {
  /** Check if service is reachable */
  isHealthy(): Promise<boolean>

  /** Check if service is already configured */
  isInitialized(): Promise<boolean>

  /** Run the auto-setup process */
  setup(options: AutoSetupOptions): Promise<AutoSetupResult>
}

/**
 * Common options for auto-setup
 */
export interface AutoSetupOptions {
  /** Global username for auth */
  username: string
  /** Global password for auth */
  password: string
  /** Environment variables available */
  env: Record<string, string>
}
