import { describe, expect, test, jest } from "@jest/globals"

// Mock config/manager to avoid JSON module import issues
jest.mock("../src/config/manager", () => ({
  getComposePath: () => "/mock/path/docker-compose.yml",
}))

import { parseEnvFile, serializeEnv } from "../src/utils/env"

// Note: readEnv, updateEnv, getEnvPath require file system access
// We test the pure functions here; integration tests would need mocked fs

describe("Env Utilities", () => {
  describe("parseEnvFile", () => {
    test("parses simple key=value pairs", () => {
      const content = `FOO=bar
BAZ=qux`
      const result = parseEnvFile(content)
      expect(result).toEqual({ FOO: "bar", BAZ: "qux" })
    })

    test("handles values with equals signs", () => {
      const content = `DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require`
      const result = parseEnvFile(content)
      expect(result.DATABASE_URL).toBe("postgres://user:pass@host:5432/db?sslmode=require")
    })

    test("ignores comments", () => {
      const content = `# This is a comment
FOO=bar
# Another comment
BAZ=qux`
      const result = parseEnvFile(content)
      expect(result).toEqual({ FOO: "bar", BAZ: "qux" })
      expect(result["# This is a comment"]).toBeUndefined()
    })

    test("ignores empty lines", () => {
      const content = `FOO=bar

BAZ=qux

`
      const result = parseEnvFile(content)
      expect(result).toEqual({ FOO: "bar", BAZ: "qux" })
    })

    test("trims whitespace from keys and values", () => {
      const content = `  FOO  =  bar  
BAZ=qux`
      const result = parseEnvFile(content)
      expect(result.FOO).toBe("bar")
    })

    test("handles empty values", () => {
      const content = `FOO=
BAZ=qux`
      const result = parseEnvFile(content)
      // Empty value after = is captured as empty string
      expect(result.FOO).toBe("")
      expect(result.BAZ).toBe("qux")
    })

    test("returns empty object for empty content", () => {
      expect(parseEnvFile("")).toEqual({})
    })
  })

  describe("serializeEnv", () => {
    test("serializes object to env format", () => {
      const env = { FOO: "bar", BAZ: "qux" }
      const result = serializeEnv(env)
      expect(result).toBe("FOO=bar\nBAZ=qux")
    })

    test("handles empty object", () => {
      expect(serializeEnv({})).toBe("")
    })

    test("preserves values with special characters", () => {
      const env = { URL: "https://example.com?foo=bar&baz=qux" }
      const result = serializeEnv(env)
      expect(result).toBe("URL=https://example.com?foo=bar&baz=qux")
    })
  })

  describe("parseEnvFile + serializeEnv roundtrip", () => {
    test("content survives roundtrip", () => {
      const original = { FOO: "bar", DATABASE: "postgres://host:5432/db" }
      const serialized = serializeEnv(original)
      const parsed = parseEnvFile(serialized)
      expect(parsed).toEqual(original)
    })
  })
})
