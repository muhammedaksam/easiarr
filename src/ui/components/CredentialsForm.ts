/**
 * CredentialsForm Component
 * Reusable form for username/password/email input with tab navigation
 */

import type { CliRenderer, KeyEvent } from "@opentui/core"

import { BoxRenderable, InputRenderable, TextRenderable } from "@opentui/core"

export interface CredentialsFormOptions {
  title?: string
  initialUsername?: string
  initialPassword?: string
  initialEmail?: string
  showEmail?: boolean
  showOverride?: boolean
  initialOverride?: boolean
}

export interface CredentialsFormResult {
  username: string
  password: string
  email: string
  override: boolean
}

export class CredentialsForm extends BoxRenderable {
  private renderer: CliRenderer
  private keyHandler!: (key: KeyEvent) => void
  private userInput!: InputRenderable
  private passInput!: InputRenderable
  private emailInput?: InputRenderable
  private overrideText?: TextRenderable
  private focusedInput: InputRenderable | null = null
  private override: boolean

  private onSubmit: (result: CredentialsFormResult) => void
  private onCancel: () => void

  constructor(
    renderer: CliRenderer,
    options: CredentialsFormOptions,
    onSubmit: (result: CredentialsFormResult) => void,
    onCancel: () => void
  ) {
    super(renderer, {
      flexDirection: "column",
      gap: 1,
    })

    this.renderer = renderer
    this.onSubmit = onSubmit
    this.onCancel = onCancel
    this.override = options.initialOverride ?? false

    this.buildForm(options)
    this.setupKeyHandler(options)
  }

  private buildForm(options: CredentialsFormOptions) {
    if (options.title) {
      this.add(
        new TextRenderable(this.renderer, {
          content: `${options.title}\n`,
          fg: "#4a9eff",
        })
      )
    }

    // Username input
    this.add(new TextRenderable(this.renderer, { content: "Username:", fg: "#aaaaaa" }))
    this.userInput = new InputRenderable(this.renderer, {
      id: "credentials-user-input",
      width: 30,
      placeholder: "admin",
      value: options.initialUsername ?? "",
      focusedBackgroundColor: "#1a1a1a",
    })
    this.add(this.userInput)
    this.add(new BoxRenderable(this.renderer, { width: 1, height: 1 }))

    // Password input
    this.add(new TextRenderable(this.renderer, { content: "Password:", fg: "#aaaaaa" }))
    this.passInput = new InputRenderable(this.renderer, {
      id: "credentials-pass-input",
      width: 30,
      placeholder: "Enter password",
      value: options.initialPassword ?? "",
      focusedBackgroundColor: "#1a1a1a",
    })
    this.add(this.passInput)
    this.add(new BoxRenderable(this.renderer, { width: 1, height: 1 }))

    // Email input (optional)
    if (options.showEmail !== false) {
      this.add(new TextRenderable(this.renderer, { content: "Email (optional):", fg: "#aaaaaa" }))
      this.emailInput = new InputRenderable(this.renderer, {
        id: "credentials-email-input",
        width: 40,
        placeholder: "you@example.com",
        value: options.initialEmail ?? "",
        focusedBackgroundColor: "#1a1a1a",
      })
      this.add(this.emailInput)
      this.add(new BoxRenderable(this.renderer, { width: 1, height: 1 }))
    }

    // Override toggle (optional)
    if (options.showOverride) {
      this.overrideText = new TextRenderable(this.renderer, {
        id: "override-toggle",
        content: `[O] Override existing: ${this.override ? "Yes" : "No"}`,
        fg: this.override ? "#50fa7b" : "#6272a4",
      })
      this.add(this.overrideText)
    }

    // Focus first input
    this.userInput.focus()
    this.focusedInput = this.userInput
  }

  private setupKeyHandler(options: CredentialsFormOptions) {
    this.keyHandler = (key: KeyEvent) => {
      const inputIsFocused = this.focusedInput !== null

      if (key.name === "o" && !inputIsFocused && options.showOverride) {
        this.override = !this.override
        if (this.overrideText) {
          this.overrideText.content = `[O] Override existing: ${this.override ? "Yes" : "No"}`
          this.overrideText.fg = this.override ? "#50fa7b" : "#6272a4"
        }
      } else if (key.name === "tab") {
        this.cycleInputFocus()
      } else if (key.name === "escape") {
        this.cleanup()
        this.onCancel()
      } else if (key.name === "return") {
        this.cleanup()
        this.onSubmit({
          username: this.userInput.value || "admin",
          password: this.passInput.value,
          email: this.emailInput?.value ?? "",
          override: this.override,
        })
      }
    }
    this.renderer.keyInput.on("keypress", this.keyHandler)
  }

  private cycleInputFocus() {
    if (this.focusedInput === this.userInput) {
      this.userInput.blur()
      this.passInput.focus()
      this.focusedInput = this.passInput
    } else if (this.focusedInput === this.passInput) {
      this.passInput.blur()
      if (this.emailInput) {
        this.emailInput.focus()
        this.focusedInput = this.emailInput
      } else {
        this.focusedInput = null
      }
    } else if (this.focusedInput === this.emailInput) {
      this.emailInput?.blur()
      this.focusedInput = null
    } else {
      this.userInput.focus()
      this.focusedInput = this.userInput
    }
  }

  cleanup() {
    this.renderer.keyInput.off("keypress", this.keyHandler)
    this.userInput.blur()
    this.passInput.blur()
    this.emailInput?.blur()
    this.focusedInput = null
  }
}
