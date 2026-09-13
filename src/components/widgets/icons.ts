import type { ComponentType } from 'react'
import { Clock, CloudSun, Coins, History, ListTodo, Sparkles, StickyNote, Timer } from 'lucide-react'
import type { WidgetType } from '../../kernel/widgets'

export type IconType = ComponentType<{ className?: string; strokeWidth?: number }>

export const WIDGET_ICONS: Record<WidgetType, IconType> = {
  weather: CloudSun,
  currency: Coins,
  recent: History,
  clock: Clock,
  todo: ListTodo,
  note: StickyNote,
  timer: Timer,
  html: Sparkles,
}
