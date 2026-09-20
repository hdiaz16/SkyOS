# Imágenes para contar SkyOS

Capturas reales del escritorio, no montajes: un perfil local recién creado, con la conversación y los widgets que
salieron de pedirle cosas a Sky. Hechas el 20 de septiembre de 2026. El orbe de la cabecera está recortado de la
propia pantalla de inicio, así que es el del sistema y no un dibujo parecido.

| Archivo | Qué se ve | Tamaño |
| --- | --- | --- |
| `skyos-inicio.png` | La pantalla de inicio: «Hola. Soy Sky. Solo necesito tu nombre.» | 2400×1550 |
| `skyos-escritorio-sky.png` | Sky contestando el tiempo de mañana y creando un widget de cuenta regresiva | 2400×1550 |
| `skyos-escritorio-nota.png` | Una nota abierta, su archivo en el escritorio y los widgets | 2400×1550 |
| `skyos-inicio-1920.png` | La pantalla de inicio sola, sin marco ni textos | 3840×2160 |
| `orbe.png` | El orbe recortado, para cabeceras y avatares | 432×432 |

Cómo se rehacen: `.env.shot.local` con las variables de Supabase en blanco (cuentas apagadas, perfil local),
`npx vite --mode shot --port 4183`, y Chrome sin ventana con `--remote-debugging-port` manejado por el protocolo
de DevTools. El procedimiento está descrito en `docs/auditoria/CONTINUAR.md`.
