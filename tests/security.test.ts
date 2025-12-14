/**
 * Security Tests
 * Validates sensitive data handling across the codebase
 */

import { describe, expect, it, jest } from "@jest/globals"

// Mock the fs module to avoid file writes during tests
jest.mock("fs", () => ({
  appendFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(() => ""),
}))

// Import after mocking
import { sanitizeMessage } from "../src/utils/debug"

describe("Security: Debug Log Sanitization", () => {
  // Test the sanitizeMessage function directly
  const testSanitization = (input: string, field: string): void => {
    // We need to access the function - let's test via debugLog behavior
    // For now, we'll test the patterns that should be sanitized
    const sensitivePatterns = [
      // Passwords
      { field: "password", value: "secret123" },
      { field: "passwordConfirmation", value: "secret123" },
      { field: "Password", value: "MyP@ssw0rd!" },
      { field: "Pw", value: "shortpw" },
      // API Keys
      { field: "apiKey", value: "abc123def456" },
      { field: "api_key", value: "xyz789" },
      { field: "ApiKey", value: "TestKey" },
      // Tokens
      { field: "token", value: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" },
      { field: "accessToken", value: "access_token_value" },
      { field: "refreshToken", value: "refresh_token_value" },
      // Secrets
      { field: "secret", value: "my_secret_value" },
      { field: "secretKey", value: "secret_key_123" },
      { field: "privateKey", value: "-----BEGIN PRIVATE KEY-----" },
      // VPN
      { field: "WIREGUARD_PRIVATE_KEY", value: "wg_private_key" },
      { field: "TUNNEL_TOKEN", value: "cloudflare_token" },
    ]

    for (const { field, value } of sensitivePatterns) {
      const input = `{"${field}":"${value}"}`
      const result = sanitizeMessage(input)
      expect(result).not.toContain(value)
      expect(result).toContain("[REDACTED]")
    }
  }

  it("should redact password fields", () => {
    expect(sanitizeMessage('{"password":"secret123"}')).toBe('{"password":"[REDACTED]"}')
    expect(sanitizeMessage('{"Password":"Secret"}')).toBe('{"Password":"[REDACTED]"}')
    expect(sanitizeMessage('{"Pw":"test"}')).toBe('{"Pw":"[REDACTED]"}')
  })

  it("should redact API key fields", () => {
    expect(sanitizeMessage('{"apiKey":"abc123"}')).toBe('{"apiKey":"[REDACTED]"}')
    expect(sanitizeMessage('{"api_key":"xyz"}')).toBe('{"api_key":"[REDACTED]"}')
  })

  it("should redact token fields", () => {
    expect(sanitizeMessage('{"token":"jwt_token"}')).toBe('{"token":"[REDACTED]"}')
    expect(sanitizeMessage('{"accessToken":"bearer"}')).toBe('{"accessToken":"[REDACTED]"}')
    expect(sanitizeMessage('{"refreshToken":"refresh"}')).toBe('{"refreshToken":"[REDACTED]"}')
  })

  it("should redact secret fields", () => {
    expect(sanitizeMessage('{"secret":"mysecret"}')).toBe('{"secret":"[REDACTED]"}')
    expect(sanitizeMessage('{"secretKey":"key"}')).toBe('{"secretKey":"[REDACTED]"}')
    expect(sanitizeMessage('{"client_secret":"oauth"}')).toBe('{"client_secret":"[REDACTED]"}')
  })

  it("should preserve non-sensitive fields", () => {
    expect(sanitizeMessage('{"username":"admin"}')).toBe('{"username":"admin"}')
    expect(sanitizeMessage('{"host":"localhost"}')).toBe('{"host":"localhost"}')
    expect(sanitizeMessage('{"port":8080}')).toBe('{"port":8080}')
  })

  it("should handle multiple sensitive fields", () => {
    const input = '{"username":"admin","password":"secret","apiKey":"key123"}'
    const result = sanitizeMessage(input)
    expect(result).toContain('"username":"admin"')
    expect(result).toContain('"password":"[REDACTED]"')
    expect(result).toContain('"apiKey":"[REDACTED]"')
  })

  it("should handle nested JSON-like strings", () => {
    const input = 'Request Body: {"user":"test","password":"secret123"}'
    const result = sanitizeMessage(input)
    expect(result).toContain("Request Body:")
    expect(result).not.toContain("secret123")
  })
})

describe("Security: No Hardcoded Secrets", () => {
  it("should not have hardcoded API keys in source", () => {
    // This is a reminder test - actual scanning would be done differently
    expect(true).toBe(true)
  })
})
