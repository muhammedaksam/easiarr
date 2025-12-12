/**
 * Password Utilities
 * Helpers for password validation and transformation
 */

/**
 * Ensures a password meets minimum length requirements by repeating it.
 * If the password is already long enough, returns it unchanged.
 *
 * @param password - The original password
 * @param minLength - Minimum required length
 * @returns Password padded to at least minLength characters
 */
export function ensureMinPasswordLength(password: string, minLength: number): string {
  if (!password || password.length === 0) {
    throw new Error("Password cannot be empty")
  }

  if (password.length >= minLength) {
    return password
  }

  // Repeat the password until it meets minimum length
  let extendedPassword = password
  while (extendedPassword.length < minLength) {
    extendedPassword += password
  }

  // Return exactly minLength characters
  return extendedPassword.slice(0, minLength)
}

/**
 * Validates if a password meets minimum length requirements.
 *
 * @param password - The password to validate
 * @param minLength - Minimum required length
 * @returns true if password meets requirements
 */
export function isPasswordValid(password: string, minLength: number): boolean {
  return password !== undefined && password !== null && password.length >= minLength
}
