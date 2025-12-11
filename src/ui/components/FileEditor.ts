import {
  BoxRenderable,
  TextareaRenderable,
  TextRenderable,
  CliRenderer,
  RenderContext,
  BoxOptions,
  RGBA,
  KeyEvent,
} from "@opentui/core"

export interface FileEditorOptions extends BoxOptions {
  filename: string
  initialContent: string
  onSave: (content: string) => void
  onCancel: () => void
}

export class FileEditor extends BoxRenderable {
  private textarea: TextareaRenderable
  private helpText: TextRenderable
  private onSave: (content: string) => void
  private onCancel: () => void
  private filename: string
  private renderer: CliRenderer
  private keyHandler: ((k: KeyEvent) => void) | null = null

  constructor(renderer: CliRenderer | RenderContext, options: FileEditorOptions) {
    super(renderer, {
      ...options,
      border: true,
      borderStyle: "double",
      title: `Editing: ${options.filename}`,
      titleAlignment: "center",
      flexDirection: "column",
    })

    this.renderer = renderer as CliRenderer
    this.onSave = options.onSave
    this.onCancel = options.onCancel
    this.filename = options.filename

    this.textarea = new TextareaRenderable(renderer, {
      width: "100%",
      flexGrow: 1, // fill remaining space
      initialValue: options.initialContent,
      showCursor: true,
      wrapMode: "none",
    })
    this.add(this.textarea)

    // Help Footer
    this.helpText = new TextRenderable(renderer, {
      content: "Ctrl+S: Save  |  ESC: Cancel",
      width: "100%",
      height: 1,
      fg: RGBA.fromHex("#888888"),
    })
    this.add(this.helpText)

    // Use global key handler for reliability
    this.keyHandler = (key: KeyEvent) => {
      // If we are not visible or destroyed, don't handle keys
      if (this.isDestroyed || !this.visible) return

      if (key.name === "s" && key.ctrl) {
        this.onSave(this.textarea.plainText)
      } else if (key.name === "escape") {
        this.onCancel()
      }
    }

    this.renderer.keyInput.on("keypress", this.keyHandler)
  }

  override destroy(): void {
    if (this.keyHandler) {
      this.renderer.keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }
    super.destroy()
  }

  focus() {
    this.textarea.focus()
  }

  getValue(): string {
    return this.textarea.plainText
  }
}
