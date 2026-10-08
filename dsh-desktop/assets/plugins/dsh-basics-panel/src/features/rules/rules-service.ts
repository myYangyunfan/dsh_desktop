/**
 * Rules feature (host): list every DSH rule file (the user-global AGENTS.md
 * plus the project-root-to-cwd instruction chain), load one rule for editing,
 * save an edit back, and create a new rule file. Every read/save/create
 * re-resolves candidates from the filesystem discovery (never from a
 * client-supplied path alone), mirroring how @deepseek-ai/dsh-agent-instructions
 * finds instruction files. Rule baselines load at session start, so saves
 * take effect for new sessions.
 */
import { readFile, stat } from 'node:fs/promises'
import { dshHomeDisplay, resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { FeatureContext } from '../registry.ts'
import { BasicsError, requireString } from '../../wire.ts'
import { atomicWrite, samePath } from '../../atomic.ts'
import {
  createRulePath,
  discoverRuleFiles,
  findProjectRoot,
  ruleTemplate,
  type RuleCreateScope,
  type RuleFile,
} from './scan.ts'

/** One rule row in the list. */
export interface RuleRow {
  /** Stable id (the absolute path; the host re-checks it against discovery). */
  key: string
  scope: 'global' | 'project'
  fileName: string
  displayPath: string
  directory: string
  size?: number
  mtime?: number
  editable: boolean
}

/** One scope group in the list. */
export interface RuleGroup {
  scope: 'global' | 'project'
  rules: RuleRow[]
}

/** A loaded rule for the editor. */
export interface RuleDetail {
  key: string
  scope: 'global' | 'project'
  fileName: string
  displayPath: string
  content: string
  mtime?: number
  editable: boolean
}

/** Build the rules feature API. */
export function registerRules(fc: FeatureContext): Record<string, (payload: unknown) => Promise<unknown> | unknown> {
  const { ctx, resolved } = fc

  const cwdOf = (payload: unknown): string => {
    const record = payload as Record<string, unknown> | null
    const cwd = typeof record?.cwd === 'string' && record.cwd !== '' ? record.cwd : undefined
    return cwd ?? fc.sessionCwdOf(payload)
  }

  const homeOf = (): { dshHome: string; displayHome: string } => {
    const dshHome = resolveDshHome()
    return { dshHome, displayHome: dshHomeDisplay(dshHome) }
  }

  /** Re-resolve a rule key against the fresh discovery; reject anything else. */
  const findRule = async (key: string, cwd: string): Promise<RuleFile> => {
    const { dshHome, displayHome } = homeOf()
    const rules = await discoverRuleFiles({ cwd, dshHome, displayHome })
    const rule = rules.find(candidate => samePath(candidate.absolutePath, key))
    if (rule === undefined) {
      throw new BasicsError('forbidden', '该规则文件不在可编辑范围内', 403)
    }
    return rule
  }

  const list = async (payload: unknown): Promise<{
    groups: RuleGroup[]
    cwd: string
    projectRoot: string
  }> => {
    const cwd = cwdOf(payload)
    const { dshHome, displayHome } = homeOf()
    const projectRoot = await findProjectRoot(cwd)
    const rules = await discoverRuleFiles({ cwd, dshHome, displayHome, projectRoot })
    const rows: RuleRow[] = await Promise.all(rules.map(async rule => {
      const info = await stat(rule.absolutePath).catch(() => undefined)
      return {
        key: rule.absolutePath,
        scope: rule.scope,
        fileName: rule.fileName,
        displayPath: rule.displayPath,
        directory: rule.directory,
        ...(info !== undefined ? { size: info.size, mtime: info.mtimeMs } : {}),
        editable: !resolved.readOnly,
      }
    }))
    const globals = rows.filter(row => row.scope === 'global')
    const projects = rows.filter(row => row.scope === 'project')
    const groups: RuleGroup[] = []
    if (globals.length > 0) groups.push({ scope: 'global', rules: globals })
    if (projects.length > 0) groups.push({ scope: 'project', rules: projects })
    return { groups, cwd, projectRoot }
  }

  const get = async (payload: unknown): Promise<RuleDetail> => {
    const key = requireString(payload, 'key')
    const cwd = cwdOf(payload)
    const rule = await findRule(key, cwd)
    let raw: string
    let mtime: number | undefined
    try {
      const [content, info] = await Promise.all([readFile(rule.absolutePath, 'utf8'), stat(rule.absolutePath)])
      raw = content
      mtime = info.mtimeMs
    } catch (error) {
      throw new BasicsError('fs-error', `无法读取规则文件: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    if (Buffer.byteLength(raw, 'utf8') > resolved.maxRuleBytes) {
      throw new BasicsError('rule-error', `规则文件超过大小上限 ${resolved.maxRuleBytes} 字节，无法编辑`, 400)
    }
    return {
      key: rule.absolutePath,
      scope: rule.scope,
      fileName: rule.fileName,
      displayPath: rule.displayPath,
      content: raw,
      ...(mtime !== undefined ? { mtime } : {}),
      editable: !resolved.readOnly,
    }
  }

  const save = async (payload: unknown): Promise<{ ok: true; mtime?: number }> => {
    if (resolved.readOnly) throw new BasicsError('read-only', '面板处于只读模式', 403)
    const key = requireString(payload, 'key')
    const record = payload as Record<string, unknown> | null
    const content = record?.content
    if (typeof content !== 'string') {
      throw new BasicsError('bad-request', '缺少规则内容 "content"')
    }
    const expectedMtime = typeof record?.expectedMtime === 'number' ? record.expectedMtime : undefined
    const cwd = cwdOf(payload)
    const rule = await findRule(key, cwd)

    let mtime: number | undefined
    try {
      const info = await stat(rule.absolutePath)
      mtime = info.mtimeMs
    } catch (error) {
      throw new BasicsError('fs-error', `无法读取规则文件: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    if (expectedMtime !== undefined && mtime !== undefined && Math.abs(expectedMtime - mtime) > 1) {
      throw new BasicsError('conflict', '规则文件已被修改，请刷新后重试', 409)
    }
    if (Buffer.byteLength(content, 'utf8') > resolved.maxRuleBytes) {
      throw new BasicsError('rule-error', `规则文件超过大小上限 ${resolved.maxRuleBytes} 字节`, 400)
    }
    try {
      await atomicWrite(rule.absolutePath, content)
    } catch (error) {
      throw new BasicsError('fs-error', `无法写入规则文件: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    const info = await stat(rule.absolutePath).catch(() => undefined)
    return { ok: true, ...(info !== undefined ? { mtime: info.mtimeMs } : {}) }
  }

  const create = async (payload: unknown): Promise<{
    ok: true
    key: string
    scope: 'global' | 'project'
    fileName: string
    displayPath: string
    mtime?: number
  }> => {
    if (resolved.readOnly) throw new BasicsError('read-only', '面板处于只读模式', 403)
    const scope = requireString(payload, 'scope') as RuleCreateScope
    const fileName = requireString(payload, 'fileName')
    if (scope !== 'global' && scope !== 'project' && scope !== 'cwd') {
      throw new BasicsError('bad-request', '非法的规则作用域 "scope"')
    }
    const cwd = cwdOf(payload)
    const { dshHome, displayHome } = homeOf()
    const target = await createRulePath({ cwd, dshHome, displayHome, scope, fileName })
    if (target === undefined) {
      throw new BasicsError('forbidden', '不允许创建该规则文件', 403)
    }
    try {
      await stat(target.absolutePath)
      throw new BasicsError('conflict', '规则文件已存在，请改为编辑', 409)
    } catch (error) {
      if (error instanceof BasicsError) throw error
      // stat 失败 = 文件不存在，可以创建
    }
    try {
      await atomicWrite(target.absolutePath, ruleTemplate(target.fileName))
    } catch (error) {
      throw new BasicsError('fs-error', `无法创建规则文件: ${error instanceof Error ? error.message : String(error)}`, 400)
    }
    const info = await stat(target.absolutePath).catch(() => undefined)
    return {
      ok: true,
      key: target.absolutePath,
      scope: target.scope,
      fileName: target.fileName,
      displayPath: target.displayPath,
      ...(info !== undefined ? { mtime: info.mtimeMs } : {}),
    }
  }

  return {
    'rules.list': list,
    'rules.get': get,
    'rules.save': save,
    'rules.create': create,
  }
}
