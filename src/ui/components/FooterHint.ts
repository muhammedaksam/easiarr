/**
 * Footer Hint Types and Utilities
 * Provides a flexible array-based structure for footer hints
 */

/** A simple text message hint (e.g., "Press ? for help.") */
export interface FooterHintText {
  type: "text"
  value: string
  color?: string
}

/** A keyboard shortcut hint (e.g., key: "↓", value: "Down") */
export interface FooterHintKey {
  type: "key"
  key: string
  value: string
  color?: string
}

/** Separator between hint groups */
export interface FooterHintSeparator {
  type: "separator"
  char?: string
}

/** Union type for all hint item types */
export type FooterHintItem = FooterHintText | FooterHintKey | FooterHintSeparator

/** Array of hint items */
export type FooterHint = FooterHintItem[]

/** Default separator character */
const DEFAULT_SEPARATOR = "  "

/**
 * Render footer hints to a plain string
 * Used by PageLayout for backward-compatible rendering
 */
export function renderFooterHint(hints: FooterHint): string {
  return hints
    .map((item) => {
      switch (item.type) {
        case "text":
          return item.value
        case "key":
          return `${item.key}: ${item.value}`
        case "separator":
          return item.char ?? DEFAULT_SEPARATOR
        default:
          return ""
      }
    })
    .join(DEFAULT_SEPARATOR)
}

/**
 * Parse legacy string format to FooterHint array
 * Supports both "Key: Action" and "Key Action" formats
 */
export function parseFooterHintString(hint: string): FooterHint {
  // Split on double spaces (common separator in existing hints)
  const parts = hint.split(/\s{2,}/)

  return parts.map((part): FooterHintItem => {
    // Try to parse as "Key: Action" or "Key Action" format
    const colonMatch = part.match(/^([^\s:]+):\s*(.+)$/)
    if (colonMatch) {
      return { type: "key", key: colonMatch[1], value: colonMatch[2] }
    }

    const spaceMatch = part.match(/^([^\s]+)\s+(.+)$/)
    if (spaceMatch) {
      return { type: "key", key: spaceMatch[1], value: spaceMatch[2] }
    }

    // Fallback to text
    return { type: "text", value: part }
  })
}

/**
 * Helper to create a key hint
 */
export function key(key: string, value: string, color?: string): FooterHintKey {
  return { type: "key", key, value, color }
}

/**
 * Helper to create a text hint
 */
export function text(value: string, color?: string): FooterHintText {
  return { type: "text", value, color }
}

/**
 * Helper to create a separator
 */
export function separator(char?: string): FooterHintSeparator {
  return { type: "separator", char }
}
