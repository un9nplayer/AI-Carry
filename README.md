# AI-Carry 🤖✈️

AI-Carry is a **Terminal-First Agentic AI** designed for offensive security, scripting, and developer automation. It runs directly in your terminal using a beautiful, interactive TUI built with Ink (React for CLI).

With AI-Carry, you get both safe planning and active building modes, complete with automated tool execution, SQLite-backed session logs, and a fully featured input terminal environment.

---

## Features ✨

- **Mode-Driven Workflow**:
  - `PLAN Mode`: Safe planning, outlines steps, generates markdown strategies, no tools run.
  - `BUILD Mode`: Active execution, automatically parses XML tool commands and runs them with permission verification.
- **Rich Terminal UI**:
  - A real-time viewport scrolling chat history.
  - Interactive model selectors (`Ctrl+M`) and chat history loaders (`Ctrl+H`).
  - Animated thinking statuses, elapsed time indicators, and collapsible detail logs.
- **Developer Input Terminal Experience**:
  - Command history navigation with `Up`/`Down` and `Ctrl+P`/`Ctrl+N`.
  - Advanced cursor navigation: `Ctrl+Left Arrow` and `Ctrl+Right Arrow` to jump word-by-word.
  - Quick editing shortcuts:
    - `Ctrl+U`: Wipe text from cursor to start of line.
    - `Ctrl+K`: Wipe text from cursor to end of line.
    - `Ctrl+W`: Delete the word before the cursor.
- **Perfect Markdown Rendering**: Fully formats blockquotes, headers, bold/italic, lists, inline code, and syntax-highlighted code blocks.
- **Copy-Friendly Session History**: Prints the entire clean chat history to the standard terminal scrollback on exit, so you can copy the text natively.

---

## Installation & Setup 🛠️

### Prerequisites

- **Node.js**: `v24.0.0` or higher is required.
- **npm** (included with Node.js).

### 1. Clone the Repository
```bash
git clone git@github.com:un9nplayer/AI-Carry.git
cd AI-Carry
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Build the Project
Build the TypeScript source files to JavaScript:
```bash
npm run build
```

### 4. Link the Binary Globally (Optional)
To make the `aicarry` command accessible from anywhere on your system:
```bash
npm link
```

---

## Usage 🚀

### Running the App
If you linked the binary globally:
```bash
aicarry
```

Otherwise, run directly in development mode:
```bash
npm run dev
```

### In-App Shortcuts
- `Tab`: Toggle between **PLAN** and **BUILD** modes.
- `Ctrl+M`: Open the Model Selector panel.
- `Ctrl+H`: Open the Chat Sessions History selector.
- `Ctrl+P` / `Ctrl+N`: Navigate command history.
- `Ctrl+Z` / `Ctrl+Y`: Undo/Redo input buffer changes.
- `Esc`: Close selector panels, or exit the application.

### Available Slash Commands
- `/help` - Show the help menu.
- `/model <name>` - Switch active LLM model.
- `/models` - List all available models.
- `/new-chat` - Start a new chat session.
- `/chat list` - List previous sessions.
- `/chat load <id>` - Load a previous chat session.
- `/chat delete <id>` - Delete a session.
- `/plan` - Switch to PLAN Mode.
- `/build` - Switch to BUILD Mode.
- `/config [<key> <value>]` - View or update config settings.
- `/exit` - Exit the application.
