import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

// Audita as consultas compostas declaradas diretamente no código do aplicativo.
// Não consulta nem publica nada no Firebase.
const config = JSON.parse(readFileSync('firestore.indexes.json', 'utf8'))
let checked = 0
const failures = []
for (const index of config.indexes) {
  if (index.fields.length < 2) failures.push(`${index.collectionGroup}: índice composto com menos de dois campos; use fieldOverrides para campos simples`)
}
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? files(path) : /\.tsx?$/.test(path) && !/\.test\./.test(path) ? [path] : []
  })
}
for (const path of files('src')) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const constants = new Map()
  function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isStringLiteral(node.initializer)) {
      constants.set(node.name.text, node.initializer.text)
    }
    ts.forEachChild(node, collect)
  }
  collect(source)
  const value = (node) => node && (ts.isStringLiteral(node) ? node.text : constants.get(node.getText(source)))
  const call = (node, name) => ts.isCallExpression(node) && node.expression.getText(source) === name
  function visit(node) {
    if (call(node, 'query')) {
      const fields = new Map()
      for (const constraint of node.arguments.slice(1)) {
        if (call(constraint, 'where')) {
          const field = value(constraint.arguments[0])
          const op = value(constraint.arguments[1])
          fields.set(field, { fieldPath: field, equality: op === '==', order: 'ASCENDING' })
        }
        if (call(constraint, 'orderBy')) {
          const field = value(constraint.arguments[0])
          fields.set(field, { fieldPath: field, order: value(constraint.arguments[1]) === 'desc' ? 'DESCENDING' : 'ASCENDING' })
        }
      }
      if (fields.size > 1) {
        const ref = node.arguments[0]
        const collection = call(ref, 'collection') ? value(ref.arguments[1]) : undefined
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
        const location = `${path}:${line + 1}`
        const equality = [...fields.values()].filter((field) => field.equality)
        const ordered = [...fields.values()].filter((field) => !field.equality)
        const matches = config.indexes.some((index) => {
          if (index.collectionGroup !== collection || index.queryScope !== 'COLLECTION' || index.fields.length !== fields.size) return false
          const prefix = index.fields.slice(0, equality.length)
          return equality.every((field) => prefix.some((candidate) => candidate.fieldPath === field.fieldPath)) &&
            ordered.every((field, i) => index.fields[equality.length + i]?.fieldPath === field.fieldPath && index.fields[equality.length + i]?.order === field.order)
        })
        checked += 1
        if (!matches) failures.push(`${location}: índice ausente para ${collection ?? 'coleção não resolvida'} (${[...fields.keys()].join(', ')})`)
        else console.log(`OK ${location}: ${collection} (${[...fields.keys()].join(', ')})`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else {
  console.log(`${checked} consultas compostas cobertas. Campos simples usam índices automáticos/fieldOverrides.`)
}
