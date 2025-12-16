/**
 * URL Utilities
 * Functions for generating app URLs based on Traefik configuration
 */

import type { EasiarrConfig } from "../config/schema"
import { getLocalIp } from "./env"

/**
 * Get the local URL for an app (http://LOCAL_IP:PORT)
 */
export function getLocalAppUrl(port: number): string {
  const localIp = getLocalIp()
  return `http://${localIp}:${port}`
}

/**
 * Get the external URL for an app (https://APP.DOMAIN)
 * Returns null if Traefik is not enabled
 */
export function getExternalAppUrl(appId: string, config: EasiarrConfig): string | null {
  if (!config.traefik?.enabled || !config.traefik.domain) {
    return null
  }
  return `https://${appId}.${config.traefik.domain}`
}

/**
 * Get the appropriate applicationUrl based on Traefik status
 * Returns external URL if Traefik enabled, otherwise local URL
 */
export function getApplicationUrl(appId: string, port: number, config: EasiarrConfig): string {
  const externalUrl = getExternalAppUrl(appId, config)
  if (externalUrl) {
    return externalUrl
  }
  return getLocalAppUrl(port)
}
