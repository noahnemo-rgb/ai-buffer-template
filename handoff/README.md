# Temporary handoff — do not merge

This branch holds patch files so a new Cursor chat can publish work that was finished for five other repositories.

Leave this pull request unmerged. After those five pull requests exist, close this one and delete the branch `cursor/hold-five-apps-4f6f`.

| App | Repository to select in the new chat | Patch |
| --- | --- | --- |
| Idea Forge | `noahnemo-rgb/ONE-idea-forge-ai` | `handoff/idea-forge.patch` |
| Syntax IDE | `noahnemo-rgb/ONE-Syntax-IDE` | `handoff/syntax-ide.patch` |
| Canopy | `noahnemo-rgb/canopy-map` | `handoff/canopy-map.patch` |
| Repo Mapper | `noahnemo-rgb/ONE-repo-mapper-live` | `handoff/repo-mapper.patch` |
| SeedFeast | `noahnemo-rgb/ONE-SeedFeast` | `handoff/seedfeast.patch` |

Each new chat must be started with that app’s repository selected. Apply the patch with `git am`, push the branch named in the patch, and open a pull request on that app repository.
