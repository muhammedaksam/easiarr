/**
 * TRaSH Guide Quality Profile Presets
 * Pre-configured quality profiles based on TRaSH Guides recommendations
 */

export interface TRaSHProfilePreset {
  id: string
  name: string
  description: string
  app: "radarr" | "sonarr" | "both"
  cutoffQuality: string
  allowedQualities: string[]
  cfScores: Record<string, number>
}

// Quality names for different resolutions
export const RADARR_QUALITIES = {
  // HD
  "Bluray-1080p": "Bluray-1080p",
  "WEB-1080p": "WEBDL-1080p",
  "HDTV-1080p": "HDTV-1080p",
  "Bluray-720p": "Bluray-720p",
  "WEB-720p": "WEBDL-720p",
  // UHD
  "Bluray-2160p": "Bluray-2160p",
  "WEB-2160p": "WEBDL-2160p",
  // Remux
  "Remux-1080p": "Remux-1080p",
  "Remux-2160p": "Remux-2160p",
}

export const SONARR_QUALITIES = {
  "WEB-1080p": "WEBDL-1080p",
  "WEB-720p": "WEBDL-720p",
  "WEB-2160p": "WEBDL-2160p",
  "HDTV-1080p": "HDTV-1080p",
  "HDTV-720p": "HDTV-720p",
  "Bluray-1080p": "Bluray-1080p",
  "Bluray-720p": "Bluray-720p",
  "Bluray-2160p": "Bluray-2160p",
  "Remux-1080p": "Remux-1080p",
  "Remux-2160p": "Remux-2160p",
}

// TRaSH recommended Custom Format scores
export const CF_SCORES = {
  // Unwanted (use negative scores)
  "BR-DISK": -10000,
  LQ: -10000,
  "LQ (Release Title)": -10000,
  "3D": -10000,
  x265: -10000, // Only for HD, not UHD
  Extras: -10000,

  // Preferred (positive scores)
  "Repack/Proper": 5,
  Repack2: 6,

  // HDR Formats
  "DV HDR10Plus": 1600,
  "DV HDR10": 1500,
  DV: 1400,
  "DV HLG": 1300,
  "DV SDR": 1200,
  HDR10Plus: 700,
  HDR10: 600,
  HDR: 500,
  "HDR (undefined)": 400,
  PQ: 300,
  HLG: 200,

  // Audio Formats
  "TrueHD Atmos": 5000,
  "DTS X": 4500,
  TrueHD: 4000,
  "DTS-HD MA": 3500,
  FLAC: 3000,
  PCM: 2500,
  "DTS-HD HRA": 2000,
  "DD+ Atmos": 1500,
  "DD+": 1000,
  "DTS-ES": 800,
  DTS: 600,
  AAC: 400,
  DD: 300,

  // Streaming Services
  AMZN: 0,
  ATVP: 100,
  DSNP: 100,
  HBO: 0,
  HMAX: 0,
  Hulu: 0,
  MA: 0,
  NF: 0,
  PCOK: 0,
  PMTP: 0,

  // Movie Versions
  "IMAX Enhanced": 800,
  IMAX: 700,
  Hybrid: 100,
  "Criterion Collection": 100,
  "Special Edition": 50,
  "Theatrical Cut": 0,

  // HQ Release Groups
  "HQ-Remux": 1750,
  "HQ-WEBDL": 1700,
  HQ: 1600,
}

// Radarr Profile Presets
export const RADARR_PRESETS: TRaSHProfilePreset[] = [
  {
    id: "hd-bluray-web",
    name: "HD Bluray + WEB",
    description: "High-Quality HD Encodes (Bluray-720p/1080p). Size: 6-15 GB",
    app: "radarr",
    cutoffQuality: "Bluray-1080p",
    allowedQualities: ["Bluray-1080p", "Bluray-720p", "WEBDL-1080p", "WEBDL-720p", "WEBRip-1080p", "WEBRip-720p"],
    cfScores: {
      "BR-DISK": -10000,
      LQ: -10000,
      "LQ (Release Title)": -10000,
      "3D": -10000,
      "x265 (HD)": -10000,
      "Repack/Proper": 5,
      "HQ-WEBDL": 1700,
      HQ: 1600,
    },
  },
  {
    id: "uhd-bluray-web",
    name: "UHD Bluray + WEB",
    description: "High-Quality UHD Encodes (Bluray-2160p). Size: 20-60 GB",
    app: "radarr",
    cutoffQuality: "Bluray-2160p",
    allowedQualities: ["Bluray-2160p", "WEBDL-2160p", "WEBRip-2160p"],
    cfScores: {
      "BR-DISK": -10000,
      LQ: -10000,
      "LQ (Release Title)": -10000,
      "DV HDR10Plus": 1600,
      "DV HDR10": 1500,
      DV: 1400,
      HDR10Plus: 700,
      HDR10: 600,
      "Repack/Proper": 5,
      "TrueHD Atmos": 5000,
      "DTS X": 4500,
      "HQ-WEBDL": 1700,
    },
  },
  {
    id: "remux-web-1080p",
    name: "Remux + WEB 1080p",
    description: "1080p Remuxes. Size: 20-40 GB",
    app: "radarr",
    cutoffQuality: "Remux-1080p",
    allowedQualities: ["Remux-1080p", "WEBDL-1080p", "WEBRip-1080p"],
    cfScores: {
      "BR-DISK": -10000,
      LQ: -10000,
      "x265 (HD)": -10000,
      "HQ-Remux": 1750,
      "Repack/Proper": 5,
      "TrueHD Atmos": 5000,
      "DTS X": 4500,
      TrueHD: 4000,
      "DTS-HD MA": 3500,
    },
  },
  {
    id: "remux-web-2160p",
    name: "Remux + WEB 2160p",
    description: "2160p Remuxes. Size: 40-100 GB",
    app: "radarr",
    cutoffQuality: "Remux-2160p",
    allowedQualities: ["Remux-2160p", "WEBDL-2160p", "WEBRip-2160p"],
    cfScores: {
      "BR-DISK": -10000,
      LQ: -10000,
      "DV HDR10Plus": 1600,
      "DV HDR10": 1500,
      DV: 1400,
      HDR10Plus: 700,
      HDR10: 600,
      "HQ-Remux": 1750,
      "Repack/Proper": 5,
      "TrueHD Atmos": 5000,
      "DTS X": 4500,
    },
  },
]

// Sonarr Profile Presets
export const SONARR_PRESETS: TRaSHProfilePreset[] = [
  {
    id: "web-1080p",
    name: "WEB-1080p",
    description: "720p/1080p WEBDL. Balanced quality and size",
    app: "sonarr",
    cutoffQuality: "WEBDL-1080p",
    allowedQualities: ["WEBDL-1080p", "WEBRip-1080p", "WEBDL-720p", "WEBRip-720p"],
    cfScores: {
      "BR-DISK": -10000,
      LQ: -10000,
      "x265 (HD)": -10000,
      "Repack/Proper": 5,
      "HQ-WEBDL": 1700,
      AMZN: 100,
      ATVP: 100,
      DSNP: 100,
      NF: 100,
    },
  },
  {
    id: "web-2160p",
    name: "WEB-2160p",
    description: "2160p WEBDL with HDR. Premium quality",
    app: "sonarr",
    cutoffQuality: "WEBDL-2160p",
    allowedQualities: ["WEBDL-2160p", "WEBRip-2160p"],
    cfScores: {
      "BR-DISK": -10000,
      LQ: -10000,
      "DV HDR10Plus": 1600,
      "DV HDR10": 1500,
      DV: 1400,
      HDR10Plus: 700,
      HDR10: 600,
      "Repack/Proper": 5,
      "HQ-WEBDL": 1700,
      AMZN: 100,
      ATVP: 100,
      NF: 100,
    },
  },
]

// Get all presets for an app
export function getPresetsForApp(app: "radarr" | "sonarr"): TRaSHProfilePreset[] {
  if (app === "radarr") return RADARR_PRESETS
  if (app === "sonarr") return SONARR_PRESETS
  return []
}

// Get a specific preset by ID
export function getPresetById(id: string): TRaSHProfilePreset | undefined {
  return [...RADARR_PRESETS, ...SONARR_PRESETS].find((p) => p.id === id)
}
