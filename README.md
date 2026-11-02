# enterprise-tour

An Agent Skill for creating navigable source-code tours with the [CodeTour VS Code extension](https://marketplace.visualstudio.com/items?itemName=vsls-contrib.codetour). Works with Codex and Claude Code.

The `create-code-tours` skill helps with:

- **Onboarding:** explain a domain or subsystem, its business operations, and how they work.
- **Closing cognitive debt after AI generation:** explain generated code's purpose, behavior, design decisions, and limitations so the team can review, maintain, and change it.
- **Diff review:** connect the requirement, previous behavior, implementation decisions, and observable result for a selected Git comparison.
- **Business logic:** follow execution, branches, state changes, and transaction boundaries in complete code blocks.

It produces `.tours/*.tour` files in the target repository and includes an offline validator for the schema, source anchors, selections, and `nextTour` links. Viewing tours requires the CodeTour extension; validation requires Node.js 18 or newer, with no npm installation or Python dependency.

## Install

### Codex

Ask Codex to install the skill with its built-in installer:

```text
Use $skill-installer to install create-code-tours from https://github.com/Mastermind-U/enterprise-tour/tree/main/skills/create-code-tours
```

If the skill does not appear after installation, restart Codex.

### Manual installation for Codex or Claude Code

Clone this repository and copy the complete `skills/create-code-tours` directory into one of these locations:

| Agent | All your projects | One project |
| --- | --- | --- |
| Codex | `~/.agents/skills/create-code-tours` | `<project>/.agents/skills/create-code-tours` |
| Claude Code | `~/.claude/skills/create-code-tours` | `<project>/.claude/skills/create-code-tours` |

Keep the directory name `create-code-tours` and include its supporting files. If the skill is already installed, update that installation rather than adding another copy to a second discovery directory.

```sh
git clone https://github.com/Mastermind-U/enterprise-tour.git
cd enterprise-tour
```

For macOS/Linux, choose the destination for your agent:

```sh
skill_parent="$HOME/.agents/skills" # Claude Code: "$HOME/.claude/skills"
mkdir -p "$skill_parent"
cp -R skills/create-code-tours "$skill_parent/"
```

For PowerShell:

```powershell
$skillParent = Join-Path $HOME '.agents/skills' # Claude Code: '.claude/skills'
New-Item -ItemType Directory -Force -Path $skillParent | Out-Null
Copy-Item -LiteralPath ./skills/create-code-tours -Destination $skillParent -Recurse
```

For project installation, use the corresponding project directory from the table instead. Start a new agent session if the skill is not yet listed. See the official [Codex skill documentation](https://learn.chatgpt.com/docs/build-skills) and [Claude Code skill documentation](https://code.claude.com/docs/en/skills) for discovery and invocation details.

## Use

Invoke the skill as `$create-code-tours` in Codex or `/create-code-tours` in Claude Code, followed by a request such as:

```text
Create an onboarding tour of the billing context.
Create a review tour of the complete branch diff relative to main (main...HEAD).
Walk through the order cancellation operation, including rollback and errors.
```

Specify the scope, comparison base when reviewing changes, and desired language. The agent reads the relevant workflow reference and writes tours anchored to the actual source files.

## Validate tours

Run from this repository, replacing the target path and tour filenames:

```sh
node skills/create-code-tours/scripts/validate_tours.mjs --root /path/to/project .tours/overview.tour
```

Without a tour list, the validator checks all `.tours/*.tour` files under `--root`. Use `--help` for its options. After installation, the same script is available inside the installed skill directory. Mechanical validation does not establish the accuracy of the explanations or prove that product tests passed.

To run the bundled validator tests:

```sh
node --test skills/create-code-tours/scripts/validate_tours.test.mjs
```

The skill entry point is [SKILL.md](skills/create-code-tours/SKILL.md). Instructions for rebuilding the bundled schema engine are in [validator-build.md](skills/create-code-tours/references/validator-build.md).

## License

[MIT](LICENSE). The installable skill includes its own copy of the license. Bundled dependencies retain their notices in [LICENSES.txt](skills/create-code-tours/scripts/vendor/LICENSES.txt).
