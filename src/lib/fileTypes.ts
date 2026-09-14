export interface FileType {
  id: string
  label: string
  ext: string
  mime: string
  defaultName: string
  template: string
}

export const FILE_TYPES: FileType[] = [
  { id: 'note', label: 'Nota', ext: 'md', mime: 'text/markdown', defaultName: 'Nota', template: '' },
  { id: 'canvas', label: 'Lienzo', ext: 'canvas', mime: 'application/x-sky-canvas+json', defaultName: 'Lienzo', template: '{\n  "version": 1,\n  "blocks": []\n}\n' },
  { id: 'text', label: 'Texto', ext: 'txt', mime: 'text/plain', defaultName: 'Texto', template: '' },
  { id: 'csv', label: 'Datos (CSV)', ext: 'csv', mime: 'text/csv', defaultName: 'Datos', template: 'columna_1,columna_2,columna_3\n' },
  { id: 'json', label: 'JSON', ext: 'json', mime: 'application/json', defaultName: 'Datos', template: '{\n  \n}\n' },
  {
    id: 'html',
    label: 'Página web',
    ext: 'html',
    mime: 'text/html',
    defaultName: 'Página',
    template: '<!doctype html>\n<html lang="es">\n  <head>\n    <meta charset="utf-8" />\n    <title>Página</title>\n  </head>\n  <body>\n    \n  </body>\n</html>\n',
  },
  { id: 'script', label: 'Script (JS)', ext: 'js', mime: 'text/javascript', defaultName: 'script', template: '' },
]

export const FILE_TYPE_IDS = FILE_TYPES.map((t) => t.id)

export function fileTypeById(id: string | undefined): FileType {
  return FILE_TYPES.find((t) => t.id === id) ?? FILE_TYPES[0]
}
