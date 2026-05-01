import type { HistoryMap } from '../types'

export default function OrderHistory({ items }: { items: HistoryMap }) {
  const entries = Object.entries(items)
  if (entries.length === 0) return <p className="empty-message history-empty">No order history yet.</p>
  return <ul className="popup-list history-list">
    {entries.map(([date, meal]) => <li className="history-item" key={date}>
      <span className="history-date">{date.split("-").splice(1).join("-")}</span>
      <span className="history-meal">{meal}</span>
    </li>)}
  </ul>
}
