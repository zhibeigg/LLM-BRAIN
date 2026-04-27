function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeEscapedChar(ch: string): string {
  switch (ch) {
    case '"': return '"'
    case '\\': return '\\'
    case '/': return '/'
    case 'b': return '\b'
    case 'f': return '\f'
    case 'n': return '\n'
    case 'r': return '\r'
    case 't': return '\t'
    default: return ch
  }
}

export function extractPartialJsonStringField(source: string, fieldNames: string[]): string | undefined {
  for (const fieldName of fieldNames) {
    const pattern = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"`, 'g')
    const match = pattern.exec(source)
    if (!match) continue

    let value = ''
    let escaped = false
    const start = match.index + match[0].length

    for (let i = start; i < source.length; i++) {
      const ch = source[i]
      if (escaped) {
        if (ch === 'u' && i + 4 < source.length) {
          const hex = source.slice(i + 1, i + 5)
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            value += String.fromCharCode(parseInt(hex, 16))
            i += 4
          } else {
            value += ch
          }
        } else {
          value += decodeEscapedChar(ch)
        }
        escaped = false
        continue
      }

      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') return value
      value += ch
    }

    return value
  }

  return undefined
}

export function extractPartialJsonBooleanField(source: string, fieldNames: string[]): boolean | undefined {
  for (const fieldName of fieldNames) {
    const pattern = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*(true|false)`, 'i')
    const match = pattern.exec(source)
    if (!match) continue
    return match[1].toLowerCase() === 'true'
  }

  return undefined
}

export function extractPartialJsonNullableStringField(source: string, fieldNames: string[]): string | null | undefined {
  const stringValue = extractPartialJsonStringField(source, fieldNames)
  if (stringValue !== undefined) return stringValue

  for (const fieldName of fieldNames) {
    const pattern = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*null`, 'i')
    if (pattern.test(source)) return null
  }

  return undefined
}
