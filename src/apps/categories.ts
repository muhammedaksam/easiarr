import type { AppCategory } from "../config/schema"

export const CATEGORY_ORDER: { id: AppCategory; short: string }[] = [
  { id: "servarr", short: "Media" },
  { id: "indexer", short: "Index" },
  { id: "downloader", short: "DL" },
  { id: "mediaserver", short: "Server" },
  { id: "request", short: "Request" },
  { id: "dashboard", short: "Dash" },
  { id: "utility", short: "Utils" },
  { id: "vpn", short: "VPN" },
  { id: "monitoring", short: "Monitor" },
  { id: "infrastructure", short: "Infra" },
]
