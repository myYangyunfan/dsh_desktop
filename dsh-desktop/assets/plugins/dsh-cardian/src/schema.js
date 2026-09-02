// Config schema factory.
//
// Under a real DeepSeek Harness host, schemastery's `Schema` is available from
// `@deepseek-ai/cordis` and is preferred (it gives cardian declarative config
// validation and `cordis.yml` support). When cardian is run standalone — e.g.
// in its test harness or as a plain Node library — we fall back to a tiny
// schema with the same `.default()` / `.description()` / `.required()` chaining
// surface so the plugin contract (`export const Config`) stays identical.
//
// NOTE: the deepseek-harness fork of `@deepseek-ai/cordis` (4.0.x) no longer
// exports `Schema`; its registry validates plugin config through the Standard
// Schema v1 interface (`Config['~standard'].validate(config)`). The fallback
// therefore implements that contract too, so cardian loads correctly on any
// host regardless of whether a declarative Schema is available.

let Schema = null

try {
  const cordis = await import('@deepseek-ai/cordis')
  if (cordis && cordis.Schema) Schema = cordis.Schema
} catch {
  /* fall through to the local schema */
}

if (!Schema) {
  const ISSUE = (message, path) => ({ message, path: path || [] })

  const validateAny = (schema, input, path = []) => {
    if (input === undefined) {
      if (schema.requiredValue) return { issues: [ISSUE('Value is required.', path)] }
      if (schema.defaultValue !== undefined) return { value: schema.defaultValue }
      return { value: undefined }
    }
    switch (schema.kind) {
      case 'string': {
        if (typeof input !== 'string') return { issues: [ISSUE('Expected a string.', path)] }
        return { value: input }
      }
      case 'number': {
        if (typeof input !== 'number' || Number.isNaN(input)) return { issues: [ISSUE('Expected a number.', path)] }
        return { value: input }
      }
      case 'boolean': {
        if (typeof input !== 'boolean') return { issues: [ISSUE('Expected a boolean.', path)] }
        return { value: input }
      }
      case 'const': {
        if (!Object.is(input, schema.constValue)) {
          return { issues: [ISSUE(`Expected ${JSON.stringify(schema.constValue)}.`, path)] }
        }
        return { value: input }
      }
      case 'array': {
        if (!Array.isArray(input)) return { issues: [ISSUE('Expected an array.', path)] }
        const value = []
        const issues = []
        for (let i = 0; i < input.length; i++) {
          const res = validateAny(schema.children, input[i], [...path, i])
          if (res.issues) issues.push(...res.issues)
          else value.push(res.value)
        }
        return issues.length ? { issues } : { value }
      }
      case 'dict': {
        if (input === null || typeof input !== 'object' || Array.isArray(input)) {
          return { issues: [ISSUE('Expected a dict.', path)] }
        }
        const value = {}
        const issues = []
        for (const [key, raw] of Object.entries(input)) {
          const res = validateAny(schema.children, raw, [...path, key])
          if (res.issues) issues.push(...res.issues)
          else value[key] = res.value
        }
        return issues.length ? { issues } : { value }
      }
      case 'union': {
        const candidates = schema.children ?? []
        for (const candidate of candidates) {
          const res = validateAny(candidate, input, path)
          if (!res.issues) return res
        }
        return { issues: [ISSUE('No union branch matched.', path)] }
      }
      case 'object': {
        if (input === null || typeof input !== 'object' || Array.isArray(input)) {
          return { issues: [ISSUE('Expected an object.', path)] }
        }
        const value = {}
        const issues = []
        for (const [key, child] of Object.entries(schema.children ?? {})) {
          const raw = input[key]
          const res = validateAny(child, raw, [...path, key])
          if (res.issues) issues.push(...res.issues)
          else if (res.value !== undefined) value[key] = res.value
        }
        // Pass through unknown keys (permissive by default).
        for (const key of Object.keys(input)) {
          if (!(key in value)) value[key] = input[key]
        }
        if (issues.length) return { issues }
        return { value }
      }
      default:
        return { value: input }
    }
  }

  const node = (kind, opts = {}) => {
    const schema = {
      kind,
      desc: opts.description ?? null,
      constValue: opts.const,
      defaultValue: undefined,
      requiredValue: false,
      children: opts.children ?? null,
    }
    schema.description = (text) => {
      schema.desc = text
      return schema
    }
    schema.default = (value) => {
      schema.defaultValue = value
      return schema
    }
    schema.required = (value = true) => {
      schema.requiredValue = value
      return schema
    }
    // Standard Schema v1 contract — required by the deepseek-harness cordis
    // fork's registry (`Config['~standard'].validate(config)`) when a plugin
    // exports a `Config`. Kept fully synchronous.
    schema['~standard'] = {
      version: 1,
      vendor: 'dsh-cardian',
      validate: (input) => validateAny(schema, input),
    }
    return schema
  }

  Schema = {
    string: (opts) => node('string', opts),
    number: (opts) => node('number', opts),
    boolean: (opts) => node('boolean', opts),
    array: (item, opts) => node('array', { ...opts, children: item }),
    dict: (item, opts) => node('dict', { ...opts, children: item }),
    union: (items, opts) => node('union', { ...opts, children: items }),
    object: (fields, opts) => node('object', { ...opts, children: fields }),
    const: (value, opts) => node('const', { ...opts, const: value }),
  }
}

export { Schema }