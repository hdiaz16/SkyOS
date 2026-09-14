import { GOOGLE_OAUTH } from '../config'
import type { Preregistered } from './auth'

/**
 * The apps Sky knows out of the box: every one is an official remote MCP server, so Sky needs nothing but
 * the person's consent. Anything else can be added by URL from the panel. Grouped by what people do with
 * them, which is how the panel opens.
 */

export type CategoryId = 'files' | 'notes' | 'mail' | 'chat' | 'plan' | 'code' | 'music' | 'custom'

export interface Category {
  id: CategoryId
  name: string
  tagline: string
}

export const CATEGORIES: Category[] = [
  { id: 'files', name: 'Archivos y documentos', tagline: 'Tus archivos en la nube, a la mano de Sky.' },
  { id: 'notes', name: 'Notas', tagline: 'Lo que escribes y guardas, para leerlo y ampliarlo.' },
  { id: 'mail', name: 'Correo', tagline: 'Leer, redactar y enviar correos desde el escritorio.' },
  { id: 'chat', name: 'Comunicación', tagline: 'Canales, mensajes y avisos del equipo.' },
  { id: 'plan', name: 'Agenda y tareas', tagline: 'Calendario y pendientes, sin cambiar de ventana.' },
  { id: 'code', name: 'Código', tagline: 'Repositorios, issues y pull requests.' },
  { id: 'music', name: 'Música', tagline: 'Lo que suena mientras trabajas.' },
  { id: 'custom', name: 'Otros servidores', tagline: 'Cualquier servidor MCP, por su URL.' },
]

export interface CatalogEntry {
  id: string
  name: string
  category: CategoryId
  /** One line on what Sky can do with it. */
  tagline: string
  abilities: string[]
  /** Brand color for the badge and the letters drawn on it. */
  color: string
  abbr: string
  url: string
  /** Scopes to ask for when the server does not say (Google publishes many; these are the useful minimum). */
  preferredScopes?: string[]
  /** OAuth client registered by hand, for authorization servers without dynamic registration (Google). */
  preregistered?: () => Preregistered | undefined
  /** Vendor documentation. */
  docsUrl?: string
}

const google = (): Preregistered | undefined => (GOOGLE_OAUTH.clientId ? GOOGLE_OAUTH : undefined)

export const CATALOG: CatalogEntry[] = [
  {
    id: 'google-drive',
    name: 'Google Drive',
    category: 'files',
    tagline: 'Buscar, leer y crear archivos de tu Drive.',
    abilities: ['Buscar archivos', 'Leer contenido', 'Crear y descargar'],
    color: '#1FA463',
    abbr: 'Dr',
    url: 'https://drivemcp.googleapis.com/mcp/v1',
    preferredScopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'],
    preregistered: google,
    docsUrl: 'https://developers.google.com/workspace/drive/api/guides/configure-mcp-server',
  },
  {
    id: 'google-docs',
    name: 'Google Docs',
    category: 'files',
    tagline: 'Leer y redactar documentos de Google Docs.',
    abilities: ['Leer documentos', 'Crear y editar'],
    color: '#4285F4',
    abbr: 'Do',
    url: 'https://docsmcp.googleapis.com/mcp/v1',
    preferredScopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive.file'],
    preregistered: google,
    docsUrl: 'https://developers.google.com/workspace/guides/configure-mcp-servers',
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'notes',
    tagline: 'Buscar y leer páginas, crear páginas nuevas y ampliar las que ya tienes.',
    abilities: ['Buscar páginas', 'Leer contenido', 'Crear y ampliar'],
    color: '#37352F',
    abbr: 'N',
    url: 'https://mcp.notion.com/mcp',
    docsUrl: 'https://developers.notion.com/guides/mcp/get-started-with-mcp',
  },
  {
    id: 'evernote',
    name: 'Evernote',
    category: 'notes',
    tagline: 'Buscar, leer y crear notas en tus libretas.',
    abilities: ['Buscar notas', 'Leer notas', 'Crear notas'],
    color: '#00A82D',
    abbr: 'Ev',
    url: 'https://mcp.evernote.com/mcp',
    docsUrl: 'https://dev.evernote.com/mcp/clients/any',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    category: 'mail',
    tagline: 'Leer tu correo, redactar respuestas y enviar mensajes como tú.',
    abilities: ['Leer y buscar correos', 'Redactar', 'Enviar'],
    color: '#EA4335',
    abbr: 'Gm',
    url: 'https://gmailmcp.googleapis.com/mcp/v1',
    preferredScopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.send'],
    preregistered: google,
    docsUrl: 'https://developers.google.com/workspace/guides/configure-mcp-servers',
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'chat',
    tagline: 'Leer canales, buscar mensajes y enviar como tú, sin abrir Slack.',
    abilities: ['Ver canales y mensajes', 'Buscar', 'Enviar mensajes', 'Canvas'],
    color: '#4A154B',
    abbr: 'Sl',
    url: 'https://mcp.slack.com/mcp',
    docsUrl: 'https://mcpservers.org/remote-mcp-servers/slack',
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    category: 'plan',
    tagline: 'Ver tu agenda y crear o mover eventos.',
    abilities: ['Ver eventos', 'Crear y mover eventos'],
    color: '#1967D2',
    abbr: 'Ca',
    url: 'https://calendarmcp.googleapis.com/mcp/v1',
    preferredScopes: ['https://www.googleapis.com/auth/calendar.events'],
    preregistered: google,
    docsUrl: 'https://developers.google.com/workspace/guides/configure-mcp-servers',
  },
  {
    id: 'todoist',
    name: 'Todoist',
    category: 'plan',
    tagline: 'Tus tareas y proyectos: ver, crear, completar y reorganizar.',
    abilities: ['Ver tareas', 'Crear y completar', 'Proyectos y etiquetas'],
    color: '#E44332',
    abbr: 'Td',
    url: 'https://ai.todoist.net/mcp',
    docsUrl: 'https://github.com/Doist/todoist-ai',
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'code',
    tagline: 'Repositorios, issues, pull requests y código, con tus permisos.',
    abilities: ['Issues y PRs', 'Leer código', 'Buscar en repos'],
    color: '#24292F',
    abbr: 'Gh',
    url: 'https://api.githubcopilot.com/mcp/',
    docsUrl: 'https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md',
  },
  {
    id: 'spotify',
    name: 'Spotify',
    category: 'music',
    tagline: 'Descubrir música y recomendaciones desde el escritorio.',
    abilities: ['Buscar música', 'Recomendaciones', 'Playlists'],
    color: '#1DB954',
    abbr: 'Sp',
    url: 'https://mcp-gateway-external-pilot.spotify.net/mcp',
    docsUrl: 'https://mcpservers.org/remote-mcp-servers/spotify',
  },
]

export const catalogFor = (id: string): CatalogEntry | undefined => CATALOG.find((c) => c.id === id)

export const categoryFor = (id: CategoryId): Category => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]
