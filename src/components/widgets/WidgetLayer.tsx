import { AnimatePresence } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { widgets, type Widget } from '../../kernel/widgets'
import { WIDGET_ICONS } from './icons'
import { WidgetFrame } from './WidgetFrame'
import { WeatherWidget } from './WeatherWidget'
import { CurrencyWidget } from './CurrencyWidget'
import { RecentWidget } from './RecentWidget'
import { ClockWidget } from './ClockWidget'
import { NoteWidget } from './NoteWidget'
import { TodoWidget } from './TodoWidget'
import { TimerWidget } from './TimerWidget'
import { HtmlWidget } from './HtmlWidget'

function renderWidget(w: Widget) {
  switch (w.type) {
    case 'weather':
      return <WeatherWidget widget={w} />
    case 'currency':
      return <CurrencyWidget widget={w} />
    case 'recent':
      return <RecentWidget widget={w} />
    case 'clock':
      return <ClockWidget widget={w} />
    case 'note':
      return <NoteWidget widget={w} />
    case 'todo':
      return <TodoWidget widget={w} />
    case 'timer':
      return <TimerWidget widget={w} />
    case 'html':
      return <HtmlWidget widget={w} />
  }
}

/** Widgets live on the desktop layer: above icons, below windows. */
export function WidgetLayer() {
  const list = useLiveQuery(() => widgets.list(), []) ?? []
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      <AnimatePresence>
        {list.map((w) => (
          <WidgetFrame key={w.id} widget={w} icon={WIDGET_ICONS[w.type]} flush={w.type === 'html'}>
            {renderWidget(w)}
          </WidgetFrame>
        ))}
      </AnimatePresence>
    </div>
  )
}
