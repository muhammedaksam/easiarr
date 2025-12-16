export interface RadarrNamingConfig {
  renameMovies: boolean
  replaceIllegalCharacters: boolean
  colonReplacementFormat: "dash" | "spaceDash" | "spaceDashSpace" | "smart" | "delete" | number
  standardMovieFormat: string
  movieFolderFormat: string
  includeQuality: boolean
  replaceSpaces: boolean
}

export interface SonarrNamingConfig {
  renameEpisodes: boolean
  replaceIllegalCharacters: boolean
  colonReplacementFormat: "dash" | "spaceDash" | "spaceDashSpace" | "smart" | "delete" | number
  multiEpisodeStyle: "extend" | "duplicate" | "repeat" | "scene" | "range" | "prefixedRange"
  dailyEpisodeFormat: string
  animeEpisodeFormat: string
  seriesFolderFormat: string
  seasonFolderFormat: string
  standardEpisodeFormat: string
  includeSeriesTitle: boolean
  includeEpisodeTitle: boolean
  includeQuality: boolean
  replaceSpaces: boolean
  separator: string
  numberStyle: string
}

export type NamingConfig = RadarrNamingConfig | SonarrNamingConfig

// TRaSH Guides Recommended Naming Schemes
// Source: https://trash-guides.info/Radarr/Radarr-recommended-naming-scheme/
// Source: https://trash-guides.info/Sonarr/Sonarr-recommended-naming-scheme/

export const TRASH_NAMING_CONFIG = {
  radarr: {
    renameMovies: true,
    replaceIllegalCharacters: true,
    colonReplacementFormat: "dash",
    standardMovieFormat:
      "{Movie CleanTitle} ({Release Year}) {edition-{Edition Tags}} {[Custom Formats]}{[Quality Full]}{[MediaInfo 3D]}{[Mediainfo AudioCodec}{ Mediainfo AudioChannels]}{[MediaInfo VideoDynamicRangeType]}{[Mediainfo VideoCodec]}{-Release Group}",
    movieFolderFormat: "{Movie CleanTitle} ({Release Year})",
    includeQuality: true,
    replaceSpaces: false,
  } as RadarrNamingConfig,

  sonarr: {
    renameEpisodes: true,
    replaceIllegalCharacters: true,
    colonReplacementFormat: 1, // 1 = Dash
    multiEpisodeStyle: "prefixedRange",
    standardEpisodeFormat:
      "{Series TitleYear} - S{season:00}E{episode:00} - {Episode CleanTitle} {[Custom Formats]}{[Quality Full]}{[Mediainfo AudioCodec}{ Mediainfo AudioChannels]}{[MediaInfo VideoDynamicRangeType]}{[Mediainfo VideoCodec]}{-Release Group}",
    dailyEpisodeFormat:
      "{Series TitleYear} - {Air-Date} - {Episode CleanTitle} {[Custom Formats]}{[Quality Full]}{[MediaInfo 3D]}{[Mediainfo AudioCodec}{ Mediainfo AudioChannels]}{[MediaInfo VideoDynamicRangeType]}{[Mediainfo VideoCodec]}{-Release Group}",
    animeEpisodeFormat:
      "{Series TitleYear} - S{season:00}E{episode:00} - {absolute:000} - {Episode CleanTitle} {[Custom Formats]}{[Quality Full]}{[MediaInfo 3D]}{[Mediainfo AudioCodec}{ Mediainfo AudioChannels]}{MediaInfo AudioLanguages}{[MediaInfo VideoDynamicRangeType]}[{Mediainfo VideoCodec }{MediaInfo VideoBitDepth}bit]{-Release Group}",
    seriesFolderFormat: "{Series TitleYear}",
    seasonFolderFormat: "Season {season:00}",
    includeSeriesTitle: true,
    includeEpisodeTitle: true,
    includeQuality: true,
    replaceSpaces: false,
    separator: " - ",
    numberStyle: "S{season:00}E{episode:00}",
  } as SonarrNamingConfig,
}
