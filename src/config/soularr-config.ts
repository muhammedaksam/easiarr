/**
 * Soularr Config Generator
 * Generates config.ini for Soularr based on easiarr configuration
 * Source: https://github.com/mrusse/soularr
 */

import type { EasiarrConfig } from "./schema"
import { readEnvSync } from "../utils/env"

/**
 * Generate Soularr config.ini content
 * This file should be placed in the Soularr config directory
 */
export function generateSoularrConfig(config: EasiarrConfig): string {
  const env = readEnvSync()

  const lidarrApiKey = env.API_KEY_LIDARR || "yourlidarrapikeygoeshere"
  const slskdApiKey = env.API_KEY_SLSKD || "yourslskdapikeygoeshere"

  // Find Lidarr and Slskd ports from config
  const lidarrPort = config.apps.find((a) => a.id === "lidarr")?.port || 8686
  const slskdPort = config.apps.find((a) => a.id === "slskd")?.port || 5030

  return `[Lidarr]
# Get from Lidarr: Settings > General > Security
api_key = ${lidarrApiKey}
# URL Lidarr uses (internal Docker network)
host_url = http://lidarr:${lidarrPort}
# Path to slskd downloads inside the Lidarr container
download_dir = /data/slskd_downloads
# If true, Lidarr won't auto-import from Slskd
disable_sync = False

[Slskd]
# Create manually in Slskd web UI
api_key = ${slskdApiKey}
# URL Slskd uses (internal Docker network)
host_url = http://slskd:${slskdPort}
url_base = /
# Download path inside Slskd container
download_dir = /downloads
# Delete search after Soularr runs
delete_searches = False
# Max seconds to wait for downloads (prevents infinite hangs)
stalled_timeout = 3600

[Release Settings]
# Pick release with most common track count
use_most_common_tracknum = True
allow_multi_disc = True
# Accepted release countries
accepted_countries = Europe,Japan,United Kingdom,United States,[Worldwide],Australia,Canada
# Don't check the region of the release
skip_region_check = False
# Accepted formats
accepted_formats = CD,Digital Media,Vinyl

[Search Settings]
search_timeout = 5000
maximum_peer_queue = 50
# Minimum upload speed (bits/sec)
minimum_peer_upload_speed = 0
# Minimum match ratio between Lidarr track and Soulseek filename
minimum_filename_match_ratio = 0.8
# Preferred file types and qualities (most to least preferred)
allowed_filetypes = flac 24/192,flac 16/44.1,flac,mp3 320,mp3
ignored_users = 
# Set to False to only search for album titles
search_for_tracks = True
# Prepend artist name when searching
album_prepend_artist = False
track_prepend_artist = True
# Search modes: all, incrementing_page, first_page
search_type = incrementing_page
# Albums to process per run
number_of_albums_to_grab = 10
# Unmonitor album on failure
remove_wanted_on_failure = False
# Blacklist words in album or track titles
title_blacklist = 
# Lidarr search source: "missing" or "cutoff_unmet"
search_source = missing
# Enable search denylist to skip albums that repeatedly fail
enable_search_denylist = False
# Number of consecutive search failures before denylisting
max_search_failures = 3

[Download Settings]
download_filtering = True
use_extension_whitelist = False
extensions_whitelist = lrc,nfo,txt

[Logging]
level = INFO
format = [%(levelname)s|%(module)s|L%(lineno)d] %(asctime)s: %(message)s
datefmt = %Y-%m-%dT%H:%M:%S%z
`
}

/**
 * Get the path where Soularr config should be saved
 */
export function getSoularrConfigPath(rootDir: string): string {
  return `${rootDir}/config/soularr/config.ini`
}
