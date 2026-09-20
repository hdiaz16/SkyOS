# Imágenes para contar SkyOS

Capturas reales del escritorio, no montajes: un perfil local recién creado, con la conversación y los widgets que
salieron de pedirle cosas a Sky. Hechas el 20 de septiembre de 2026 con la versión de ese día.

| Archivo | Qué se ve | Tamaño |
| --- | --- | --- |
| `skyos-escritorio-sky.png` | Sky contestando el tiempo de mañana y creando un widget de cuenta regresiva | 2400×1550 |
| `skyos-escritorio-nota.png` | Una nota abierta, el archivo en el escritorio y los widgets | 2400×1550 |
| `skyos-captura-1920.png` | La captura sola, sin marco ni textos | 3840×2160 |

Cómo se rehacen: `.env.shot.local` con las variables de Supabase en blanco (cuentas apagadas, perfil local),
`npx vite --mode shot --port 4183`, y Chrome sin ventana con `--remote-debugging-port` manejado por el protocolo
de DevTools. Los guiones quedaron en el scratchpad de la sesión; están descritos en `docs/auditoria/CONTINUAR.md`.
