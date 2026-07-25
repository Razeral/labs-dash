import raw from './projects.json'
import type { Project, Roster } from '../types'

const file = raw as Roster

// Slugs listed in `omit` are kept in the file (so their blurb, tier and notes are not lost)
// but never rendered. Editing that list is how you take something off the board.
export const omit: readonly string[] = file.omit ?? []

// Every entry in the file, including omitted ones. Used for export, so a round-trip through
// `copy projects.json` never silently drops an omitted project.
export const allProjects: Project[] = file.projects ?? []

export const roster: Project[] = allProjects.filter((p) => !omit.includes(p.slug))
