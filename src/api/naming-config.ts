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
  multiEpisodeStyle: "extend" | "duplicate" | "repeat" | "scene" | "range" | "prefixedRange" | number
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

export interface LidarrNamingConfig {
  renameTracks: boolean
  replaceIllegalCharacters: boolean
  colonReplacementFormat: "dash" | "spaceDash" | "spaceDashSpace" | "smart" | "delete" | number
  standardTrackFormat: string
  multiDiscTrackFormat: string
  artistFolderFormat: string
  albumFolderFormat: string
}

export type NamingConfig = RadarrNamingConfig | SonarrNamingConfig | LidarrNamingConfig

// TRaSH Guides Recommended Naming Schemes
// Source: https://trash-guides.info/Radarr/Radarr-recommended-naming-scheme/
// Source: https://trash-guides.info/Sonarr/Sonarr-recommended-naming-scheme/
// Lidarr: https://wiki.servarr.com/lidarr/settings#media-management

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
    multiEpisodeStyle: 5, // 5 = Prefixed Range
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

  lidarr: {
    renameTracks: true,
    replaceIllegalCharacters: true,
    colonReplacementFormat: "dash",
    // Standard track format: Artist - Album (Year) - Track# - Title
    standardTrackFormat: "{Artist CleanName} - {Album CleanTitle} ({Release Year}) - {track:00} - {Track CleanTitle}",
    // Multi-disc format includes disc number
    multiDiscTrackFormat:
      "{Artist CleanName} - {Album CleanTitle} ({Release Year}) - {medium:00}-{track:00} - {Track CleanTitle}",
    // Artist folder: Artist Name
    artistFolderFormat: "{Artist CleanName}",
    // Album folder: Album Title (Year) [Quality]
    albumFolderFormat: "{Album CleanTitle} ({Release Year})",
  } as LidarrNamingConfig,
}
