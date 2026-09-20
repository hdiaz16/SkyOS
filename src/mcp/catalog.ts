import { APP_ORIGIN, OAUTH_CLIENTS, type RegistrarKey, type ShippedClient } from '../config'
import type { Preregistered } from './auth'

/** A server this deployment runs itself, next to the desktop: same origin as the page, so no CORS and no relay. */
const ownServer = (path: string): string => `${(typeof window !== 'undefined' ? window.location.origin : APP_ORIGIN) || 'http://localhost'}${path}`

/**
 * The apps Sky knows out of the box: every one is an official remote MCP server, so Sky needs nothing but
 * the person's consent. Anything else can be added by URL from the panel. Grouped by what people do with
 * them, which is how the panel opens.
 *
 * Consent is one click only where the authorization server lets Sky register itself. Checked against the
 * metadata each one publishes (19 September 2026): Dropbox, Notion, Evernote, Todoist and Zapier do; Google,
 * Spotify, GitHub, Slack and Box do not, and those name a `registrar` — whoever deploys SkyOS registers one
 * client there, once, and until then the card explains instead of asking the person for a client id.
 */

export type CategoryId = 'files' | 'notes' | 'mail' | 'chat' | 'plan' | 'code' | 'music' | 'all' | 'custom'

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
  { id: 'all', name: 'Todo en uno', tagline: 'Un solo permiso, cientos de apps a través de un intermediario.' },
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
  /** Whose authorization server only takes clients registered by hand (see REGISTRARS). Absent: the server registers Sky on its own. */
  registrar?: RegistrarKey
  /** What the company itself does today, said on the card before anyone clicks: a pilot that turns this application away, for one. */
  notice?: string
  /** Vendor documentation. */
  docsUrl?: string
  /** Words in a request that point at this app; its tools travel to the model only then (keeps requests small). */
  keywords: string[]
  /** Tools that cover most requests; they win the size budget unless the request clearly asks for others. */
  featuredTools?: string[]
  /** The app's own web address, for "Abrir en…". */
  webUrl?: string
  /** Aggregators expose a few meta-tools that must always travel, whatever the request mentions. */
  alwaysOn?: boolean
}

/** Who has to register the connection before it can be a click, and where. */
export interface Registrar {
  key: RegistrarKey
  /** The company, as the card names it. */
  name: string
  /** The variable the deployment reads the client id from. */
  env: string
  /** Whether the server also wants a client secret with the code exchange; the relay keeps it, the browser never does. */
  secret: boolean
  /** Where the deployer creates the client. */
  console: string
  /** What the company itself will not allow even with a client registered, said before anyone tries. */
  limit?: string
}

export const REGISTRARS: Record<RegistrarKey, Registrar> = {
  google: { key: 'google', name: 'Google', env: 'VITE_GOOGLE_CLIENT_ID', secret: false, console: 'https://console.cloud.google.com/apis/credentials' },
  spotify: {
    key: 'spotify',
    name: 'Spotify',
    env: 'VITE_SPOTIFY_CLIENT_ID',
    secret: false,
    console: 'https://developer.spotify.com/dashboard',
    // Spotify for Developers, 6 February 2026 («Update on Developer Access and Platform Security»), in force since
    // 11 February: Development Mode needs a Premium account, one client per developer, up to five authorized people
    // and fewer endpoints; the extended quota only goes to organizations with at least 250 000 monthly users.
    limit: 'Spotify solo deja que un cliente en modo desarrollo lo usen hasta cinco personas autorizadas a mano, y exige una cuenta Premium para crearlo; abrirlo a más gente está reservado a empresas con 250 000 usuarios al mes.',
  },
  github: { key: 'github', name: 'GitHub', env: 'VITE_GITHUB_CLIENT_ID', secret: true, console: 'https://github.com/settings/developers' },
  slack: { key: 'slack', name: 'Slack', env: 'VITE_SLACK_CLIENT_ID', secret: true, console: 'https://api.slack.com/apps' },
  box: { key: 'box', name: 'Box', env: 'VITE_BOX_CLIENT_ID', secret: true, console: 'https://app.box.com/developers/console' },
}

export const CATALOG: CatalogEntry[] = [
  {
    id: 'google-drive',
    name: 'Google Drive',
    category: 'files',
    tagline: 'Buscar, leer y crear archivos de tu Drive.',
    abilities: ['Buscar archivos', 'Leer contenido', 'Crear y descargar'],
    color: '#1FA463',
    abbr: 'Dr',
    keywords: ['drive', 'google drive', 'nube', 'archivo de google', 'archivos de google'],
    webUrl: 'https://drive.google.com',
    url: 'https://drivemcp.googleapis.com/mcp/v1',
    preferredScopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'],
    registrar: 'google',
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
    keywords: ['docs', 'google docs', 'documento de google', 'doc de google'],
    webUrl: 'https://docs.google.com',
    url: 'https://docsmcp.googleapis.com/mcp/v1',
    preferredScopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive.file'],
    registrar: 'google',
    docsUrl: 'https://developers.google.com/workspace/guides/configure-mcp-servers',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    category: 'files',
    tagline: 'Buscar, leer, crear y mover archivos de tu Dropbox; también sincroniza el escritorio.',
    abilities: ['Buscar y listar', 'Leer contenido', 'Crear, mover y borrar', 'Sincronizar el escritorio'],
    color: '#0061FF',
    abbr: 'Dx',
    keywords: ['dropbox'],
    featuredTools: ['Search', 'ListFolder', 'GetFileContent', 'GetFileMetadata', 'CreateFile', 'CreateFolder', 'Move'],
    webUrl: 'https://www.dropbox.com/home',
    url: 'https://mcp.dropbox.com/mcp',
    docsUrl: 'https://help.dropbox.com/integrations/connect-dropbox-mcp-server',
  },
  {
    id: 'box',
    name: 'Box',
    category: 'files',
    tagline: 'Buscar y leer el contenido de tu Box, con sus permisos.',
    abilities: ['Buscar archivos', 'Leer contenido', 'Box AI'],
    color: '#0061D5',
    abbr: 'Bx',
    keywords: ['box'],
    webUrl: 'https://app.box.com',
    url: 'https://mcp.box.com',
    registrar: 'box',
    docsUrl: 'https://developer.box.com/guides/box-mcp/setup',
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'notes',
    tagline: 'Buscar y leer páginas, crear páginas nuevas y ampliar las que ya tienes.',
    abilities: ['Buscar páginas', 'Leer contenido', 'Crear y ampliar'],
    color: '#37352F',
    abbr: 'N',
    keywords: ['notion', 'página', 'páginas', 'pagina', 'paginas', 'workspace', 'base de datos'],
    featuredTools: ['notion-search', 'notion-fetch', 'notion-list-recent-pages', 'notion-create-pages', 'notion-update-page', 'notion-create-comment', 'notion-get-comments'],
    webUrl: 'https://www.notion.so',
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
    keywords: ['evernote', 'libreta', 'libretas', 'nota', 'notas'],
    webUrl: 'https://www.evernote.com/client/web',
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
    keywords: ['gmail', 'correo', 'correos', 'mail', 'email', 'bandeja', 'mensaje de correo'],
    webUrl: 'https://mail.google.com',
    url: 'https://gmailmcp.googleapis.com/mcp/v1',
    preferredScopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.send'],
    registrar: 'google',
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
    keywords: ['slack', 'canal', 'canales', 'mensaje', 'mensajes', 'equipo', 'chat'],
    webUrl: 'https://app.slack.com',
    url: 'https://mcp.slack.com/mcp',
    registrar: 'slack',
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
    keywords: ['calendario', 'calendar', 'agenda', 'evento', 'eventos', 'reunión', 'reunion', 'cita', 'citas'],
    webUrl: 'https://calendar.google.com',
    url: 'https://calendarmcp.googleapis.com/mcp/v1',
    preferredScopes: ['https://www.googleapis.com/auth/calendar.events'],
    registrar: 'google',
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
    keywords: ['todoist', 'tarea', 'tareas', 'pendiente', 'pendientes', 'to do', 'proyecto de tareas'],
    webUrl: 'https://app.todoist.com',
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
    keywords: ['github', 'repo', 'repositorio', 'issue', 'issues', 'pull request', 'pr', 'commit', 'rama', 'código'],
    webUrl: 'https://github.com',
    url: 'https://api.githubcopilot.com/mcp/',
    registrar: 'github',
    docsUrl: 'https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md',
  },
  {
    id: 'spotify',
    name: 'Spotify',
    category: 'music',
    tagline: 'Buscar música, tus playlists y tu biblioteca, y controlar lo que suena.',
    abilities: ['Buscar música', 'Playlists y biblioteca', 'Reproducción'],
    color: '#1DB954',
    abbr: 'Sp',
    keywords: ['spotify', 'música', 'musica', 'canción', 'cancion', 'canciones', 'playlist', 'artista', 'álbum', 'album', 'podcast'],
    webUrl: 'https://open.spotify.com',
    // Spotify's own MCP server is a closed pilot: probed on 19 September 2026, it answered a valid token of this
    // application with 403 «RBAC: access denied» while the Web API took the same token. So the desktop talks to a
    // small MCP server of its own (`api/mcp/spotify`) that speaks Web API on the other side. The OAuth is still
    // Spotify's, and each person still signs in with their own account.
    url: ownServer('/api/mcp/spotify'),
    registrar: 'spotify',
    featuredTools: ['search', 'now_playing', 'play', 'my_playlists', 'saved_tracks'],
    docsUrl: 'https://developer.spotify.com/documentation/web-api',
    notice: 'Spotify tiene su servidor MCP en un piloto cerrado, así que SkyOS habla con la Web API de Spotify a través de un servidor MCP propio. En modo desarrollo, Spotify admite hasta cinco personas dadas de alta por quien registró la app, y reproducir requiere Premium.',
  },
  {
    id: 'rube',
    name: 'Rube (Composio)',
    category: 'all',
    tagline: 'Más de 500 apps con una sola autorización: Gmail, Slack, GitHub, Notion, Drive, HubSpot… Composio queda en medio.',
    abilities: ['500+ apps', 'Una autorización', 'Herramientas bajo demanda'],
    color: '#5B3DF5',
    abbr: 'Ru',
    keywords: ['rube', 'composio'],
    alwaysOn: true,
    webUrl: 'https://rube.app',
    url: 'https://rube.app/mcp',
    docsUrl: 'https://github.com/composiohq/rube',
  },
  {
    id: 'zapier',
    name: 'Zapier MCP',
    category: 'all',
    tagline: 'Miles de apps y acciones de Zapier desde Sky. Zapier queda en medio y aplica sus límites de plan.',
    abilities: ['9,000+ apps', 'Acciones de Zapier', 'Una autorización'],
    color: '#FF4F00',
    abbr: 'Za',
    keywords: ['zapier', 'zap'],
    alwaysOn: true,
    webUrl: 'https://mcp.zapier.com',
    url: 'https://mcp.zapier.com/api/mcp/mcp',
    docsUrl: 'https://help.zapier.com/hc/en-us/articles/36265392843917-Use-Zapier-MCP-with-your-client',
  },
]

export const catalogFor = (id: string): CatalogEntry | undefined => CATALOG.find((c) => c.id === id)

export const categoryFor = (id: CategoryId): Category => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]

/** The client this deployment ships for an app whose authorization server wants one registered by hand. */
export const shippedClient = (entry: CatalogEntry | undefined, clients: Partial<Record<RegistrarKey, ShippedClient | undefined>> = OAUTH_CLIENTS): Preregistered | undefined =>
  entry?.registrar ? clients[entry.registrar] : undefined

/**
 * Why connecting this app is not a click yet: its authorization server only takes clients registered by hand,
 * and neither the deployment nor the person has provided one. Undefined when nothing stands in the way.
 */
export function registrationGap(
  entry: CatalogEntry | undefined,
  record?: { manualClient?: { clientId: string } },
  clients: Partial<Record<RegistrarKey, ShippedClient | undefined>> = OAUTH_CLIENTS,
): Registrar | undefined {
  if (!entry?.registrar || record?.manualClient?.clientId || clients[entry.registrar]) return undefined
  return REGISTRARS[entry.registrar]
}
