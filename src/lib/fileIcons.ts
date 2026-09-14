import { Braces, CodeXml, File, FileArchive, FileAudio, FileImage, FileText, FileVideo, LayoutDashboard, Table, Type, type LucideIcon } from 'lucide-react'
import { extOf, type FileKind } from '../kernel/types'

/**
 * How a file looks on the desktop: the official mark of its program or language when there is one
 * (Word, Excel, PowerPoint, PDF, HTML, TypeScript…), a tinted glyph otherwise. Logos live in public/filetypes.
 */
export interface FileIconSpec {
  /** File name under public/filetypes, without extension. */
  logo?: string
  glyph?: LucideIcon
  /** Brand color; tints the glyph and the extension tag. */
  color: string
  /** Short Spanish label for tooltips and the "type" column. */
  label: string
}

interface Brand {
  logo: string
  color: string
  label: string
}

const BRANDS: Record<string, Brand> = {
  word: { logo: 'word', color: '#185ABD', label: 'Documento de Word' },
  excel: { logo: 'excel', color: '#107C41', label: 'Hoja de Excel' },
  powerpoint: { logo: 'powerpoint', color: '#C43E1C', label: 'Presentación de PowerPoint' },
  pdf: { logo: 'pdf', color: '#E2574C', label: 'Documento PDF' },
  html: { logo: 'html', color: '#E34F26', label: 'Página HTML' },
  css: { logo: 'css', color: '#663399', label: 'Hoja de estilos' },
  javascript: { logo: 'javascript', color: '#C9B000', label: 'JavaScript' },
  typescript: { logo: 'typescript', color: '#3178C6', label: 'TypeScript' },
  react: { logo: 'react', color: '#2FA7C8', label: 'Componente React' },
  json: { logo: 'json', color: '#5A5A5A', label: 'Datos JSON' },
  python: { logo: 'python', color: '#3776AB', label: 'Python' },
  markdown: { logo: 'markdown', color: '#4A5568', label: 'Nota Markdown' },
  yaml: { logo: 'yaml', color: '#CB171E', label: 'YAML' },
  shell: { logo: 'shell', color: '#4EAA25', label: 'Script de shell' },
  vue: { logo: 'vue', color: '#4FC08D', label: 'Componente Vue' },
  svelte: { logo: 'svelte', color: '#FF3E00', label: 'Componente Svelte' },
  php: { logo: 'php', color: '#777BB4', label: 'PHP' },
  java: { logo: 'java', color: '#437291', label: 'Java' },
  go: { logo: 'go', color: '#00ADD8', label: 'Go' },
  rust: { logo: 'rust', color: '#6B4A2B', label: 'Rust' },
  ruby: { logo: 'ruby', color: '#CC342D', label: 'Ruby' },
  swift: { logo: 'swift', color: '#F05138', label: 'Swift' },
  kotlin: { logo: 'kotlin', color: '#7F52FF', label: 'Kotlin' },
  dart: { logo: 'dart', color: '#0175C2', label: 'Dart' },
  docker: { logo: 'docker', color: '#2496ED', label: 'Dockerfile' },
  git: { logo: 'git', color: '#F05032', label: 'Configuración de Git' },
  csharp: { logo: 'csharp', color: '#512BD4', label: 'C#' },
  sqlite: { logo: 'sqlite', color: '#003B57', label: 'Base de datos' },
}

/** Extension → brand. Names are matched lowercase; the name-only entries (Dockerfile) are checked first. */
const BY_EXTENSION: Record<string, keyof typeof BRANDS> = {
  docx: 'word', doc: 'word', dotx: 'word', odt: 'word', rtf: 'word',
  xlsx: 'excel', xls: 'excel', xlsm: 'excel', ods: 'excel',
  pptx: 'powerpoint', ppt: 'powerpoint', odp: 'powerpoint',
  pdf: 'pdf',
  html: 'html', htm: 'html',
  css: 'css', scss: 'css', less: 'css',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript',
  jsx: 'react', tsx: 'react',
  json: 'json', jsonc: 'json',
  py: 'python', pyw: 'python',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  yml: 'yaml', yaml: 'yaml',
  sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'shell',
  vue: 'vue',
  svelte: 'svelte',
  php: 'php',
  java: 'java', jar: 'java',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  swift: 'swift',
  kt: 'kotlin', kts: 'kotlin',
  dart: 'dart',
  cs: 'csharp',
  sql: 'sqlite', sqlite: 'sqlite', db: 'sqlite',
}

const BY_NAME: Record<string, keyof typeof BRANDS> = {
  dockerfile: 'docker',
  '.gitignore': 'git',
  '.gitattributes': 'git',
  '.gitmodules': 'git',
}

interface Glyph {
  glyph: LucideIcon
  color: string
  label: string
}

const GLYPHS: Record<string, Glyph> = {
  xml: { glyph: CodeXml, color: '#E38B2C', label: 'XML' },
  svg: { glyph: FileImage, color: '#FFB13B', label: 'Gráfico vectorial' },
  csv: { glyph: Table, color: '#2E7D32', label: 'Datos CSV' },
  tsv: { glyph: Table, color: '#2E7D32', label: 'Datos TSV' },
  txt: { glyph: FileText, color: '#6B7280', label: 'Texto' },
  log: { glyph: FileText, color: '#6B7280', label: 'Registro' },
  env: { glyph: Braces, color: '#6B7280', label: 'Variables de entorno' },
  toml: { glyph: Braces, color: '#9C4221', label: 'TOML' },
  ini: { glyph: Braces, color: '#6B7280', label: 'Configuración' },
  zip: { glyph: FileArchive, color: '#8D6E63', label: 'Archivo comprimido' },
  rar: { glyph: FileArchive, color: '#8D6E63', label: 'Archivo comprimido' },
  '7z': { glyph: FileArchive, color: '#8D6E63', label: 'Archivo comprimido' },
  tar: { glyph: FileArchive, color: '#8D6E63', label: 'Archivo comprimido' },
  gz: { glyph: FileArchive, color: '#8D6E63', label: 'Archivo comprimido' },
  mp3: { glyph: FileAudio, color: '#7C3AED', label: 'Audio' },
  wav: { glyph: FileAudio, color: '#7C3AED', label: 'Audio' },
  ogg: { glyph: FileAudio, color: '#7C3AED', label: 'Audio' },
  m4a: { glyph: FileAudio, color: '#7C3AED', label: 'Audio' },
  mp4: { glyph: FileVideo, color: '#DB2777', label: 'Video' },
  mov: { glyph: FileVideo, color: '#DB2777', label: 'Video' },
  webm: { glyph: FileVideo, color: '#DB2777', label: 'Video' },
  mkv: { glyph: FileVideo, color: '#DB2777', label: 'Video' },
  ttf: { glyph: Type, color: '#4B5563', label: 'Fuente' },
  otf: { glyph: Type, color: '#4B5563', label: 'Fuente' },
  woff: { glyph: Type, color: '#4B5563', label: 'Fuente' },
  woff2: { glyph: Type, color: '#4B5563', label: 'Fuente' },
}

const BY_KIND: Record<Exclude<FileKind, 'folder'>, Glyph> = {
  text: { glyph: FileText, color: '#6B7280', label: 'Texto' },
  image: { glyph: FileImage, color: '#10B981', label: 'Imagen' },
  pdf: { glyph: File, color: '#E2574C', label: 'Documento PDF' },
  document: { glyph: FileText, color: '#185ABD', label: 'Documento' },
  spreadsheet: { glyph: Table, color: '#107C41', label: 'Hoja de cálculo' },
  presentation: { glyph: File, color: '#C43E1C', label: 'Presentación' },
  canvas: { glyph: LayoutDashboard, color: '#4A8A68', label: 'Lienzo' },
  other: { glyph: File, color: '#6B7280', label: 'Archivo' },
}

/** The icon for a file, by its name first (brand or glyph), then by its broad kind. */
export function fileIconFor(name: string, kind: FileKind): FileIconSpec {
  const lower = name.toLowerCase()
  const byName = BY_NAME[lower]
  if (byName) return BRANDS[byName]
  const ext = extOf(lower)
  const brand = BY_EXTENSION[ext]
  if (brand) return BRANDS[brand]
  const glyph = GLYPHS[ext]
  if (glyph) return glyph
  return BY_KIND[kind === 'folder' ? 'other' : kind]
}
