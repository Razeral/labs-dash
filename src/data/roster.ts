import raw from './projects.json'
import type { Project, Roster } from '../types'
import { fetchOverlay, applyOverlay } from './overlay'
import type { Overlay } from './overlay'

const file = raw as Roster

// Slugs listed in `omit` are kept in the file (so their blurb, tier and notes are not lost)
// but never rendered. Editing that list is how you take something off the board at build time.
export const omit: readonly string[] = file.omit ?? []

// Every entry in the file, including omitted ones. Used for export, so a round-trip through
// `copy projects.json` never silently drops an omitted project.
export const allProjects: Project[] = file.projects ?? []

// Base roster: compiled-in data minus the build-time omit list.
export const baseRoster: Project[] = allProjects.filter((p) => !omit.includes(p.slug))

// Live roster: base + runtime overlay from S3 config.json.
// Fetched once on load; falls back to base roster if the overlay is unavailable.
export const roster: Project[] = baseRoster

// Call this after mount to apply the live overlay. Returns the merged roster.
export async function loadLiveRoster(): Promise<Project[]> {
  const overlay: Overlay = await fetchOverlay()
  return applyOverlay(allProjects, [...omit], overlay)
}
