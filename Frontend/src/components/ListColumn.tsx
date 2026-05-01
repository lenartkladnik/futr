import { Fragment } from 'react'
import type { UniqueIdentifier } from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { DropIndicator, ListDetail, ListId, ListItem, VisibleItem } from '../types'

function getItemText(item: ListItem, index?: number) {
  return typeof index === 'number' ? `${index + 1}. ${item.label}` : item.label
}

function isOdjavaItem(item: ListItem) {
  return ["ODJAVA", "ODJAVI"].includes(item.label.trim().toUpperCase())
}

function searchItems(items: ListItem[], searchQuery: string): VisibleItem[] {
  const query = searchQuery.trim().toLowerCase()
  return items
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => !query || item.label.toLowerCase().includes(query) || isOdjavaItem(item))
}

function SortableItem({ index, isAfterOdjava, isOdjava, item, listId, onPositionChange }: {
  index: number
  isAfterOdjava: boolean
  isOdjava: boolean
  item: ListItem
  listId: ListId
  onPositionChange: (itemId: UniqueIdentifier, nextPosition: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const isOrderedMeal = listId === 'meals'

  function promptForPosition() {
    const value = window.prompt(`Move "${item.label}" to position`, String(index + 1))
    if (value === null) return
    const nextPosition = Number(value)
    if (Number.isInteger(nextPosition)) onPositionChange(item.id, nextPosition)
  }

  return <li
    className={`item ${isDragging ? 'is-dragging' : ''} ${isOdjava ? 'item-odjava' : ''} ${isAfterOdjava ? 'item-after-odjava' : ''}`}
    ref={setNodeRef}
    style={{
      transform: CSS.Transform.toString(transform),
      transition,
    }}
    {...attributes}
    {...listeners}
  >
    {isOrderedMeal && <button
      aria-label={`Move ${item.label} to another position`}
      className="item-position-button"
      onClick={event => {
        event.stopPropagation()
        promptForPosition()
      }}
      onKeyDown={event => { event.stopPropagation() }}
      onPointerDown={event => event.stopPropagation()}
      type="button"
    >
      {index + 1}.
    </button>}
    <span>{isOrderedMeal ? item.label : getItemText(item, index)}</span>
  </li>
}

function GhostItem({ index, item }: { index: number, item: ListItem }) {
  return <li aria-hidden="true" className="item item-ghost">{getItemText(item, index)}</li>
}

export default function ListColumn({ activeId, activeItem, details, dropIndicator, items, listId, onPositionChange, searchQuery }: {
  activeId: UniqueIdentifier | null
  activeItem: ListItem | null
  details: ListDetail
  dropIndicator: DropIndicator | null
  items: ListItem[]
  listId: ListId
  onPositionChange: (itemId: UniqueIdentifier, nextPosition: number) => void
  searchQuery: string
}) {
  const { setNodeRef } = useDroppable({ id: listId })
  const odjavaIndex = listId === 'meals' ? items.findIndex(isOdjavaItem) : -1
  const searchResults = searchItems(items, searchQuery)
  const visibleItems = activeId ? searchResults.filter(({ item }) => item.id !== String(activeId)) : searchResults
  const ghostIndex = dropIndicator?.listId === listId && activeItem
    ? visibleItems.findIndex(({ index }) => index >= dropIndicator.index)
    : null
  const resolvedGhostIndex = ghostIndex === -1 ? visibleItems.length : ghostIndex
  const emptyMessage = searchQuery.trim() ? 'No matches.' : details.empty

  return <section className="list" data-list-id={listId}>
    <h2>{details.title}</h2>
    <SortableContext
      items={visibleItems.map(({ item }) => item.id)}
      strategy={verticalListSortingStrategy}
    >
      <ul className="items" ref={setNodeRef}>
        {visibleItems.length === 0 && ghostIndex === null && <li className="empty-message">{emptyMessage}</li>}
        {visibleItems.map(({ index, item }, visibleIndex) => <Fragment key={item.id}>
          {resolvedGhostIndex === visibleIndex && activeItem && <GhostItem index={dropIndicator?.index ?? index} item={activeItem} />}
          <SortableItem
            index={index}
            isAfterOdjava={odjavaIndex !== -1 && index > odjavaIndex}
            isOdjava={isOdjavaItem(item)}
            item={item}
            listId={listId}
            onPositionChange={onPositionChange}
          />
        </Fragment>)}
        {resolvedGhostIndex === visibleItems.length && activeItem && <GhostItem index={dropIndicator?.index ?? visibleItems.length} item={activeItem} />}
      </ul>
    </SortableContext>
  </section>
}
