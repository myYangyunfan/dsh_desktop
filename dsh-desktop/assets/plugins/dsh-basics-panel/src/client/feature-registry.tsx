/**
 * Client-side feature registry: the extension seam for future visualizations.
 * A feature contributes an id, a tab label, and a React component. Adding a
 * visualization means adding one entry here plus the component — the panel
 * chrome (tab bar, settings section) is untouched.
 */
import type { ComponentType } from 'react'
import type { Context } from '../context-types.ts'
import { t } from './locales.ts'
import { McpSection } from './features/mcp/McpSection.tsx'
import { SkillsSection } from './features/skills/SkillsSection.tsx'
import { RulesSection } from './features/rules/RulesSection.tsx'
import { ArchivedSection } from './features/archived/ArchivedSection.tsx'

/** One panel feature (a tab). */
export interface PanelFeature {
  id: string
  label: () => string
  Component: ComponentType<{ ctx: Context }>
}

/** The ordered feature list. */
export const FEATURES: PanelFeature[] = [
  { id: 'mcp', label: () => t('tabMcp'), Component: McpSection },
  { id: 'skills', label: () => t('tabSkills'), Component: SkillsSection },
  { id: 'rules', label: () => t('tabRules'), Component: RulesSection },
  { id: 'archived', label: () => t('tabArchived'), Component: ArchivedSection },
]
