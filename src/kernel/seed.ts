import { db } from './db'
import { fs } from './fs'
import { ROOT_ID } from './types'

const WELCOME = `# Bienvenido a Mesa

Mesa es un escritorio donde la inteligencia artificial será la protagonista.
La barra de abajo es el centro de todo: ahí pides, buscas y navegas.

Por ahora funciona como un escritorio tranquilo, con pocas acciones bien cuidadas:

- Escribe en la barra de abajo para buscar archivos, ejecutar acciones o buscar en Google.
- Ctrl+K lleva el foco a la barra desde cualquier lugar.
- Clic derecho en el escritorio para crear carpetas, notas y otros tipos de archivo.
- Arrastra archivos desde tu computadora para importarlos.
- Ctrl+Z deshace la última acción. Todo lo que pasa aquí se puede deshacer.
- Doble clic abre. F2 renombra. Supr envía a la papelera.
- Haz clic en la hora para ver el calendario.

Todo se guarda en tu navegador. Nada sale de tu computadora.

En la siguiente fase, la barra aceptará lenguaje natural:
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
