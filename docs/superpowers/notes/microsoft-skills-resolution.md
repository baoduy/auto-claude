# microsoft-skills + azure-skills resolution

## microsoft/skills
- Marketplace name: `skills`
- Plugins: `deep-wiki`, `azure-skills`, `azure-sdk-python`, `azure-sdk-dotnet`, `azure-sdk-typescript`, `azure-sdk-java`, `azure-sdk-rust`
- Install strategy: single id — `deep-wiki` is the canonical general-purpose flagship (AI-powered wiki generator; the SDK plugins are language-specific opt-ins)
- Resolved install command: `claude plugin marketplace add microsoft/skills && claude plugin install deep-wiki@skills`
- Resolved uninstall command: `claude plugin uninstall deep-wiki`
- detect versionMatch: `skills` (matches the marketplace name returned by `claude plugin list`)

## microsoft/azure-skills
- Marketplace name: `azure-skills`
- Plugins: `azure`
- Install strategy: single id — only one plugin published
- Resolved install command: `claude plugin marketplace add microsoft/azure-skills && claude plugin install azure@azure-skills`
- Resolved uninstall command: `claude plugin uninstall azure`
- detect versionMatch: `azure-skills` (matches the marketplace name)

## Sources
- `https://raw.githubusercontent.com/microsoft/skills/main/.claude-plugin/marketplace.json`
- `https://raw.githubusercontent.com/microsoft/azure-skills/main/.claude-plugin/marketplace.json`
