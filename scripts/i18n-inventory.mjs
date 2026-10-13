// Inventar der deutschen Anzeigetexte; Datenwerte werden nicht veraendert.
import { parse } from '@babel/parser'
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const entries = new Map()
const normalize = (s) => s.replace(/\s+/g, ' ').trim()
const human = (s) => /[A-Za-zÄÖÜäöüß]/.test(s) && !/^(?:https?:|blob:|data:|\.\/|\.\.\/|\/|#|@)/.test(s) && !/^[\w./:-]+\.(?:svg|png|dcm|json|zip|pdf|txt|ts)$/.test(s) && !/^(?:bg-|text-|border-|flex |absolute |fixed |relative |w-|h-|px-|py-|rounded |space-|max-|min-|inline-|block |cursor-|translate-|opacity-)/.test(s)
function add(s, file) {
  s = normalize(s)
  if (!s || !human(s)) return
  if (!entries.has(s)) entries.set(s, new Set())
  entries.get(s).add(file)
}
function visit(node, file, parent) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'JSXText') add(node.value, file)
  if (node.type === 'StringLiteral') {
    const excluded = ['ImportDeclaration', 'ExportNamedDeclaration', 'TSLiteralType', 'Directive', 'ObjectProperty', 'JSXAttribute']
    const attr = parent?.type === 'JSXAttribute' ? parent.name?.name : ''
    const propertyKey = parent?.type === 'ObjectProperty' && parent.key === node
    if (!propertyKey && (!excluded.includes(parent?.type) || parent?.type === 'ObjectProperty' || ['title','titel','label','labelDone','recipeLabel','roleLabel','aria-label','placeholder','alt','text','subtitle','hint','modul','confirmLabel','cancelLabel'].includes(attr))) add(node.value, file)
  }
  if (node.type === 'TemplateLiteral') {
    let s = node.quasis[0].value.cooked ?? node.quasis[0].value.raw
    node.expressions.forEach((_, i) => { s += `{${i}}` + (node.quasis[i + 1].value.cooked ?? node.quasis[i + 1].value.raw) })
    if (/[ÄÖÜäöüß]/.test(s) || /\s[A-Za-z]{3}/.test(s) || /^[A-Za-z]{3}.*\s/.test(s)) add(s, file)
  }
  for (const [key, value] of Object.entries(node)) {
    if (['loc','tokens','comments','leadingComments','trailingComments','innerComments','extra'].includes(key)) continue
    if (Array.isArray(value)) value.forEach((v) => visit(v, file, node))
    else if (value && typeof value === 'object') visit(value, file, node)
  }
}
function scan(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'i18n') scan(file); continue }
    if (!/\.tsx?$/.test(file) || /\.test\.ts$/.test(file) || /(?:Catalog|Contours|Images|BackgroundsData|vite-env)\./.test(file)) continue
    visit(parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['typescript','jsx'] }).program, file)
  }
}
scan('src')
mkdirSync('.test-artifacts/i18n', { recursive: true })
const sorted = [...entries].sort(([a],[b]) => a.localeCompare(b, 'de'))
const groups = [[], [], []]
for (const entry of sorted) {
  const [message, files] = entry
  const category = [...files].some(f => /recipes|hip\\|knee\\|shoulder\\|FemurProfile|KneeOsteotomie|CpakMatrix|CpahMatrix|MeasurementPanel/.test(f)) ? 1 : [...files].some(f => /lib\\|state\\/.test(f)) ? 2 : 0
  groups[category].push({ message, files: [...files] })
}
groups.forEach((v,i) => writeFileSync(`.test-artifacts/i18n/source-${i}.json`, JSON.stringify(v, null, 2) + '\n'))
console.log(groups.map((v,i) => `source-${i}: ${v.length}`).join('\n'))
