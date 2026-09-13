import { db } from './db'
import { fs } from './fs'
import { ROOT_ID } from './types'

const WELCOME = `# Bienvenido a Mesa

Mesa es un escritorio que, muy pronto, entenderá lo que le pides.

Por ahora funciona como un escritorio normal, con pocas acciones bien cuidadas:

- Clic derecho en el escritorio para crear carpetas o notas.
- Arrastra archivos desde tu computadora para importarlos.
- Ctrl+K abre la barra universal: busca archivos o ejecuta acciones.
- Ctrl+Z deshace la última acción. Todo lo que pasa aquí se puede deshacer.
- Doble clic abre. F2 renombra. Supr envía a la papelera.

Todo se guarda en tu navegador. Nada sale de tu computadora.

En la siguiente fase, la barra universal aceptará lenguaje natural:
"junta las facturas de agosto en una carpeta" será una instrucción válida.
`

let seeding: Promise<void> | null = null

/** Creates the starter content once. Safe to call more than once (StrictMode runs effects twice). */
export function seedIfEmpty(): Promise<void> {
  seeding ??= (async () => {
    const count = await db.nodes.count()
    if (count > 0) return
    await fs.createFolder(ROOT_ID, 'Proyectos')
    await fs.createText(ROOT_ID, 'Bienvenido a Mesa.md', WELCOME)
  })()
  return seeding
}
