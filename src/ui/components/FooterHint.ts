/**
 * Footer Hint Types and Utilities
 * Provides a flexible array-based structure for footer hints
 */

/** Base interface for all footer hint types with common styling */
export interface FooterHintBase {
  /** Foreground color */
  fg?: string
  /** Background color */
  bg?: string
}

/** A simple text message hint (e.g., "Press ? for help.") */
export interface FooterHintText extends FooterHintBase {
  type: "text"
  value: string
}

/** A keyboard shortcut hint (e.g., key: "↓", value: "Down") */
export interface FooterHintKey extends FooterHintBase {
  type: "key"
  key: string
  value: string
  /** Color for the key part (default: bright/highlighted) */
  keyColor?: string
  /** Color for the value part (default: dimmer) */
  valueColor?: string
  /** Background color for the key badge */
  keyBgColor?: string
  /** Whether to show brackets around the key */
  withBrackets?: boolean
}

/** Separator between hint groups */
export interface FooterHintSeparator extends FooterHintBase {
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
export function key(
  key: string,
  value: string,
  options?: { keyColor?: string; valueColor?: string; keyBgColor?: string; withBrackets?: boolean }
): FooterHintKey {
  return { type: "key", key, value, ...options }
}

/**
 * Helper to create a text hint
 */
export function text(value: string, fg?: string): FooterHintText {
  return { type: "text", value, fg }
}

/**
 * Helper to create a separator
 */
export function separator(char?: string): FooterHintSeparator {
  return { type: "separator", char }
}
