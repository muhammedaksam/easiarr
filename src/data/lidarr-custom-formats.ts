/**
 * Lidarr Custom Formats (Davo's Community Guide)
 * Source: https://wiki.servarr.com/lidarr/community-guide
 *
 * Unlike Radarr/Sonarr, these are NOT from TRaSH Guides.
 * Lidarr custom formats use different implementation types.
 * Uses the same CustomFormat interface from custom-format-api.ts for compatibility.
 */

import type { CustomFormat } from "../api/custom-format-api"

/**
 * Preferred Groups - Release groups that are consistently high quality
 */
export const CF_PREFERRED_GROUPS: Omit<CustomFormat, "id"> = {
  name: "Preferred Groups",
  includeCustomFormatWhenRenaming: false,
  specifications: [
    {
      name: "DeVOiD",
      implementation: "ReleaseGroupSpecification",
      negate: false,
      required: false,
      fields: [{ name: "value", value: "\\bDeVOiD\\b" }],
    },
    {
      name: "PERFECT",
      implementation: "ReleaseGroupSpecification",
      negate: false,
      required: false,
      fields: [{ name: "value", value: "\\bPERFECT\\b" }],
    },
    {
      name: "ENRiCH",
      implementation: "ReleaseGroupSpecification",
      negate: false,
      required: false,
      fields: [{ name: "value", value: "\\bENRiCH\\b" }],
    },
  ],
}

/**
 * CD - Tag releases that are from CD source
 */
export const CF_CD: Omit<CustomFormat, "id"> = {
  name: "CD",
  includeCustomFormatWhenRenaming: false,
  specifications: [
    {
      name: "CD",
      implementation: "ReleaseTitleSpecification",
      negate: false,
      required: false,
      fields: [{ name: "value", value: "\\bCD\\b" }],
    },
  ],
}

/**
 * WEB - Tag releases that are from WEB source
 */
export const CF_WEB: Omit<CustomFormat, "id"> = {
  name: "WEB",
  includeCustomFormatWhenRenaming: false,
  specifications: [
    {
      name: "WEB",
      implementation: "ReleaseTitleSpecification",
      negate: false,
      required: false,
      fields: [{ name: "value", value: "\\bWEB\\b" }],
    },
  ],
}

/**
 * Lossless - Tag releases that are lossless (flac/flac24)
 */
export const CF_LOSSLESS: Omit<CustomFormat, "id"> = {
  name: "Lossless",
  includeCustomFormatWhenRenaming: false,
  specifications: [
    {
      name: "Flac",
      implementation: "ReleaseTitleSpecification",
      negate: false,
      required: false,
      fields: [{ name: "value", value: "\\blossless\\b" }],
    },
  ],
}

/**
 * Vinyl - Tag releases that are from Vinyl source
 */
export const CF_VINYL: Omit<CustomFormat, "id"> = {
  name: "Vinyl",
  includeCustomFormatWhenRenaming: false,
  specifications: [
    {
      name: "Vinyl",
      implementation: "ReleaseTitleSpecification",
      negate: false,
      required: false,
      fields: [{ name: "value", value: "\\bVinyl\\b" }],
    },
  ],
}

/**
 * All Lidarr custom formats from Davo's guide
 */
export const LIDARR_CUSTOM_FORMATS: Omit<CustomFormat, "id">[] = [
  CF_PREFERRED_GROUPS,
  CF_CD,
  CF_WEB,
  CF_LOSSLESS,
  CF_VINYL,
]

/**
 * Get all Lidarr custom format names
 */
export function getLidarrCFNames(): string[] {
  return LIDARR_CUSTOM_FORMATS.map((cf) => cf.name)
}
