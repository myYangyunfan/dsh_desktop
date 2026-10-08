import { describe, it, expect } from 'vitest'
import { splitSkillFile, parseFrontmatter, applySkillEdit, isSkillName } from '../src/features/skills/frontmatter.ts'

const SAMPLE = `---
name: my-skill
description: 一个测试技能
origin: some-source
# 保留的注释
whenToUse: 用到的时候
---
正文内容
`

describe('splitSkillFile', () => {
  it('splits a valid frontmatter block from the body', () => {
    const parts = splitSkillFile(SAMPLE)
    expect(parts).toBeDefined()
    expect(parts!.body).toBe('正文内容\n')
    expect(parts!.frontmatter).toContain('name: my-skill')
  })

  it('returns undefined without a frontmatter block', () => {
    expect(splitSkillFile('# 只有标题\n')).toBeUndefined()
  })
})

describe('parseFrontmatter', () => {
  it('parses a mapping to a plain object', () => {
    const data = parseFrontmatter('name: a-skill\ndescription: d\n')
    expect(data).toEqual({ name: 'a-skill', description: 'd' })
  })
})

describe('applySkillEdit', () => {
  it('edits description and body while preserving unknown keys and comments', () => {
    const next = applySkillEdit(SAMPLE, {
      description: '新的描述',
      body: '新的正文\n',
    })
    expect(next).toContain('description: 新的描述')
    expect(next).toContain('origin: some-source')
    expect(next).toContain('# 保留的注释')
    expect(next).toContain('新的正文')
    expect(next).not.toContain('正文内容')
  })

  it('maps modelInvocable=false to disable-model-invocation: true', () => {
    const next = applySkillEdit(SAMPLE, { modelInvocable: false })
    expect(next).toContain('disable-model-invocation: true')
  })

  it('removes the disable flag when modelInvocable is true', () => {
    const withDisabled = '---\nname: s\ndescription: d\ndisable-model-invocation: true\n---\nbody\n'
    const next = applySkillEdit(withDisabled, { modelInvocable: true })
    expect(next).not.toContain('disable-model-invocation')
  })

  it('rejects an empty description', () => {
    expect(() => applySkillEdit(SAMPLE, { description: '   ' })).toThrow()
  })
})

describe('isSkillName', () => {
  it('accepts kebab-case names and rejects others', () => {
    expect(isSkillName('my-skill')).toBe(true)
    expect(isSkillName('mySkill')).toBe(false)
    expect(isSkillName('-lead')).toBe(false)
  })
})
