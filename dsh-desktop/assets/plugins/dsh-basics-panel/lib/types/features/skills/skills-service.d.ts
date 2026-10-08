import type { FeatureContext } from '../registry.ts';
/** Scope keys used by the client to group and label. */
export type SkillScope = 'project' | 'custom' | 'user' | 'bundled' | 'runtime' | 'other';
/**
 * How the skill-view scope was resolved: the caller named a live session
 * (`session`), the host fell back to another live Agent (`fallback`), or no
 * live Agent exists at all (`none` — the list can then only show global skills).
 */
export type SkillScopeSource = 'session' | 'fallback' | 'none';
/** Map a provider `source` string to a scope key. */
export declare function scopeOfSource(source: string): SkillScope;
/** One skill row in the list. */
export interface SkillRow {
    name: string;
    description: string;
    whenToUse?: string;
    modelInvocable: boolean;
    userInvocable: boolean;
    source: string;
    provider: string;
    /** Display location (the skill's resource base), when known. */
    location?: string;
    editable: boolean;
}
/** One scope group in the list. */
export interface SkillGroup {
    scope: SkillScope;
    skills: SkillRow[];
}
/** A loaded skill for the editor. */
export interface SkillDetail {
    name: string;
    description: string;
    whenToUse?: string;
    metadata?: Record<string, unknown>;
    modelInvocable: boolean;
    userInvocable: boolean;
    body: string;
    path?: string;
    source: string;
    provider: string;
    editable: boolean;
    mtime?: number;
}
/** Build the skills feature API. */
export declare function registerSkills(fc: FeatureContext): Record<string, (payload: unknown) => Promise<unknown> | unknown>;
