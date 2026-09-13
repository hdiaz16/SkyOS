# Mesa

Un escritorio web minimalista, fluido y pensado para que la inteligencia artificial sea la forma principal de usarlo.
Escritorio, carpetas y ventanas como metáfora visual; una sola barra universal como punto de entrada.

**Estado: fase 0.** Funciona como un escritorio local sin IA. Todo se guarda en el navegador.

## Correr en local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` en Chrome o Edge (Firefox y Safari funcionan con almacenamiento alternativo).

## Qué hace hoy

- Escritorio con íconos, carpetas anidadas, ventanas arrastrables y redimensionables, dock.
- Crear carpetas y notas, renombrar (F2), mover arrastrando, papelera con restaurar.
- Importar archivos arrastrándolos desde el sistema o con el selector.
- Editor de texto con autoguardado, visor de imágenes, visor de PDF.
- Barra universal (Ctrl+K) para buscar archivos y ejecutar acciones.
- Toda acción pasa por un bus de comandos con historial y deshacer (Ctrl+Z).
- Tema claro, oscuro o del sistema.

## Arquitectura

```
src/
  kernel/            núcleo sin UI
    types.ts         modelo de nodo (archivo/carpeta) y detección de tipo
    db.ts            esquema Dexie (IndexedDB) para metadatos
    blobs.ts         bytes de archivos: OPFS, con respaldo en IndexedDB
    fs.ts            servicio de sistema de archivos
    commands.ts      registro de comandos, dispatch, diario y deshacer
    commands/        comandos concretos: fs.* y ui.*
  state/             stores Zustand: ventanas, selección/menús, ajustes
  components/        escritorio, ventanas, dock, barra universal, apps
```

**El bus de comandos es la pieza central.** Los botones de la interfaz y, en la fase 1, la IA llaman exactamente los
mismos comandos (`fs.createFolder`, `fs.move`, `fs.trash`, `ui.open`...). Cada comando declara sus parámetros con una
descripción legible, pensada para convertirse en herramientas del modelo, y devuelve una función de deshacer.

## Plan

1. **Fase 0, el shell.** Hecha.
2. **Fase 1, la IA entra.** Adaptador de Claude con el SDK oficial, la barra acepta lenguaje natural, tool calling sobre
   el bus, vista previa de cambios, streaming.
3. **Fase 2, multi-modelo y memoria.** Selector de proveedor (Anthropic, OpenAI, Gemini, Ollama, OpenRouter),
   embeddings locales, búsqueda por significado, "pregúntale a tu escritorio".
4. **Fase 3, pulido.** Atajos, montar carpeta real del disco, exportar todo, PWA.

## Stack

Vite · React 19 · TypeScript · Tailwind 4 · Motion · Zustand · Dexie · OPFS · SDK de Anthropic
