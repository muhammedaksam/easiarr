/**
 * TRaSH Guides Quality Definitions (File Size Limits)
 * Min/Preferred/Max in MB/min
 * Source: ../Guides/docs/json/radarr/quality-size/movie.json
 * Source: ../Guides/docs/json/sonarr/quality-size/series.json
 */

export interface TrashQualityDefinition {
  quality: string
  min: number
  preferred: number
  max: number
}

export const TRASH_RADARR_QUALITY_DEFINITIONS: TrashQualityDefinition[] = [
  {
    quality: "HDTV-720p",
    min: 17.1,
    preferred: 1999,
    max: 2000,
  },
  {
    quality: "WEBDL-720p",
    min: 12.5,
    preferred: 1999,
    max: 2000,
  },
  {
    quality: "WEBRip-720p",
    min: 12.5,
    preferred: 1999,
    max: 2000,
  },
  {
    quality: "Bluray-720p",
    min: 25.7,
    preferred: 1999,
    max: 2000,
  },
  {
    quality: "HDTV-1080p",
    min: 33.8,
    preferred: 1999,
    max: 2000,
  },
  {
    quality: "WEBDL-1080p",
    min: 12.5,
    preferred: 1999,
    max: 2000,
  },
  {
    quality: "WEBRip-1080p",
    min: 12.5,
    preferred: 1999,
    max: 2000,
  },
  {
    quality: "Bluray-1080p",
    min: 50.8,
    preferred: 1999,
    max: 2000,
  },
  {
    quality: "Remux-1080p",
    min: 102,
    preferred: 1999,
    max: 2000,
  },
  {
    quality: "HDTV-2160p",
    min: 85,
    preferred: 1999,
    max: 2000,
  },
  {
    quality: "WEBDL-2160p",
    min: 34.5,
    preferred: 1999,
    max: 2000,
  },
  {
    quality: "WEBRip-2160p",
    min: 34.5,
    preferred: 1999,
    max: 2000,
  },
  {
    quality: "Bluray-2160p",
    min: 102,
    preferred: 1999,
    max: 2000,
  },
  {
    quality: "Remux-2160p",
    min: 187.4,
    preferred: 1999,
    max: 2000,
  },
]

export const TRASH_SONARR_QUALITY_DEFINITIONS: TrashQualityDefinition[] = [
  {
    quality: "HDTV-720p",
    min: 10,
    preferred: 995,
    max: 1000,
  },
  {
    quality: "HDTV-1080p",
    min: 15,
    preferred: 995,
    max: 1000,
  },
  {
    quality: "WEBRip-720p",
    min: 10,
    preferred: 995,
    max: 1000,
  },
  {
    quality: "WEBDL-720p",
    min: 10,
    preferred: 995,
    max: 1000,
  },
  {
    quality: "Bluray-720p",
    min: 17.1,
    preferred: 995,
    max: 1000,
  },
  {
    quality: "WEBRip-1080p",
    min: 15,
    preferred: 995,
    max: 1000,
  },
  {
    quality: "WEBDL-1080p",
    min: 15,
    preferred: 995,
    max: 1000,
  },
  {
    quality: "Bluray-1080p",
    min: 50.4,
    preferred: 995,
    max: 1000,
  },
  {
    quality: "Bluray-1080p Remux",
    min: 69.1,
    preferred: 995,
    max: 1000,
  },
  {
    quality: "HDTV-2160p",
    min: 25,
    preferred: 995,
    max: 1000,
  },
  {
    quality: "WEBRip-2160p",
    min: 25,
    preferred: 995,
    max: 1000,
  },
  {
    quality: "WEBDL-2160p",
    min: 25,
    preferred: 995,
    max: 1000,
  },
  {
    quality: "Bluray-2160p",
    min: 94.6,
    preferred: 995,
    max: 1000,
  },
  {
    quality: "Bluray-2160p Remux",
    min: 187.4,
    preferred: 995,
    max: 1000,
  },
]
