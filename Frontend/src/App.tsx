import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { addAlert } from './components/alertSystem'
import Credentials from './components/Credentials'
import { generalFetch, getFetchData } from './components/fetch'
import './css/app.css'

type ListId = 'meals' | 'unordered'

type ListItem = {
  id: string
  label: string
}

type ListState = Record<ListId, ListItem[]>

type ListDetail = {
  title: string
  empty: string
}

type HistoryMap = Record<string, string>
type DropIndicator = {
  listId: ListId
  index: number
}

const listIds: ListId[] = ['meals', 'unordered']

const initialLists: ListState = {
  meals: [],
  unordered: []
}

const listDetails: Record<ListId, ListDetail> = {
  meals: {
    title: 'Meals',
    empty: 'No meals available.'
  },
  unordered: {
    title: 'Unordered Meals',
    empty: 'No unordered meals available.'
  }
}

const listEntries = listIds.map(listId => [listId, listDetails[listId]] as const)
const isListId = (value: UniqueIdentifier | null | undefined): value is ListId => value === 'meals' || value === 'unordered'
const getId = (value: UniqueIdentifier) => String(value)
const isHistoryMap = (value: unknown): value is HistoryMap => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every(item => typeof item === 'string')
}

function createListItems(listId: ListId, labels: string[]) {
  return labels.map((label, index) => ({
    id: `${listId}-${index}-${label}`,
    label
  }))
}

const saveLists = (lists: ListState) => generalFetch('/api/meals', {
  meals: lists.meals.map(item => item.label),
  unordered: lists.unordered.map(item => item.label),
})

function getListEdgeDropIndex(itemCount: number, activeRect: DragOverEvent['active']['rect']['current']['translated'], overRect: DragOverEvent['over'] extends null ? never : NonNullable<DragOverEvent['over']>['rect']) {
  if (itemCount === 0) return 0
  if (!activeRect) return itemCount
  const activeCenter = activeRect.top + (activeRect.height / 2)
  const overMidpoint = overRect.top + (overRect.height / 2)
  return activeCenter <= overMidpoint ? 0 : itemCount
}

function getItemDropIndex(itemCount: number, overIndex: number, activeRect: DragOverEvent['active']['rect']['current']['translated'], overRect: DragOverEvent['over'] extends null ? never : NonNullable<DragOverEvent['over']>['rect']) {
  if (!activeRect) return overIndex

  const activeTop = activeRect.top
  const activeBottom = activeRect.top + activeRect.height
  const activeCenter = activeTop + (activeRect.height / 2)
  const overMidpoint = overRect.top + (overRect.height / 2)

  if (overIndex === 0 && activeTop <= overRect.top + (overRect.height * 0.75)) return 0
  if (overIndex === itemCount - 1 && activeBottom >= overRect.bottom - (overRect.height * 0.25)) return itemCount

  return overIndex + (activeCenter > overMidpoint ? 1 : 0)
}

function getDropIndicator(event: Pick<DragOverEvent, 'active' | 'over'>, lists: ListState): DropIndicator | null {
  if (!event.over) return null
  const over = event.over
  const id = { active: findContainer(event.active.id, lists), over: findContainer(over.id, lists) }
  if (!id.active || !id.over) return null
  if (isListId(over.id)) {
    return {
      listId: id.over,
      index: getListEdgeDropIndex(lists[id.over].length, event.active.rect.current.translated, over.rect)
    }
  }
  const indexAbout = { active: findItemIndex(lists, id.active, event.active.id), over: findItemIndex(lists, id.over, over.id) }
  if (indexAbout.active === -1 || indexAbout.over === -1) return null
  let index = getItemDropIndex(
    lists[id.over].length,
    indexAbout.over,
    event.active.rect.current.translated,
    over.rect
  )
  if (id.active === id.over && indexAbout.active < index) index -= 1
  return {
    listId: id.over,
    index: Math.max(0, Math.min(index, lists[id.over].length))
  }
}

function findContainer(id: UniqueIdentifier, lists: ListState): ListId | null {
  if (isListId(id)) return id
  return (listIds.find(listId => lists[listId].some(item => item.id === getId(id))) ?? null)
}

function findItemIndex(lists: ListState, listId: ListId, itemId: UniqueIdentifier) {
  return lists[listId].findIndex(item => item.id === getId(itemId))
}

function findItem(id: UniqueIdentifier | null, lists: ListState) {
  if (!id) return null
  const itemId = getId(id)
  for (const listId of listIds) {
    const item = lists[listId].find(listItem => listItem.id === itemId)
    if (item) return item
  }
  return null
}

function getItemText(item: ListItem, index?: number) {
  return typeof index === 'number' ? `${index + 1}. ${item.label}` : item.label
}

function MealItem({ as: Component = 'li', className = '', item, }: { as?: 'div' | 'li', className?: string, item: ListItem }) {
  return <Component className={`item ${className}`}>{getItemText(item)}</Component>
}

function SortableItem({ index, item }: { index: number, item: ListItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return <li
    className={`item ${isDragging ? 'is-dragging' : ''}`}
    ref={setNodeRef}
    style={{
      transform: CSS.Transform.toString(transform),
      transition,
    }}
    {...attributes}
    {...listeners}
  >
    {getItemText(item, index)}
  </li>
}

function GhostItem({ index, item }: { index: number, item: ListItem }) {
  return <li aria-hidden="true" className="item item-ghost">{getItemText(item, index)}</li>
}

function ListColumn({ activeId, activeItem, details, dropIndicator, items, listId }: {
  activeId: UniqueIdentifier | null
  activeItem: ListItem | null
  details: ListDetail
  dropIndicator: DropIndicator | null
  items: ListItem[]
  listId: ListId
}) {
  const { setNodeRef } = useDroppable({ id: listId })
  const visibleItems = activeId ? items.filter(item => item.id !== getId(activeId)) : items
  const ghostIndex = dropIndicator?.listId === listId && activeItem
    ? Math.max(0, Math.min(dropIndicator.index, visibleItems.length))
    : null

  return <section className="list" data-list-id={listId}>
    <h2>{details.title}</h2>
    <SortableContext
      items={visibleItems.map(item => item.id)}
      strategy={verticalListSortingStrategy}
    >
      <ul className="items" ref={setNodeRef}>
        {visibleItems.map((item, index) => <Fragment key={item.id}>
          {ghostIndex === index && activeItem && <GhostItem index={index} item={activeItem} />}
          <SortableItem
            index={ghostIndex !== null && ghostIndex <= index ? index + 1 : index}
            item={item}
          />
        </Fragment>)}
        {ghostIndex === visibleItems.length && activeItem && <GhostItem index={visibleItems.length} item={activeItem} />}
      </ul>
    </SortableContext>
    {visibleItems.length === 0 && ghostIndex === null && <p className="empty-message">{details.empty}</p>}
  </section>
}

function OrderHistory({ items }: { items: HistoryMap }) {
  const entries = Object.entries(items)
  if (entries.length === 0) return <p className="empty-message history-empty">No order history yet.</p>
  return <ul className="popup-list history-list">
    {entries.map(([date, meal]) => <li className="history-item" key={date}>
      <span className="history-date">{date.split("-").splice(1).join("-")}</span>
      <span className="history-meal">{meal}</span>
    </li>)}
  </ul>
}

export default function App() {
  const [lists, setLists] = useState<ListState>(initialLists)
  const [historyItems, setHistoryItems] = useState<HistoryMap>({})
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)
  const [isUnorderedVisible, setIsUnorderedVisible] = useState(true)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isCredentialsOpen, setIsCredentialsOpen] = useState(false)
  const [credentialsWareSet, setCredentialsWareSet] = useState(localStorage.getItem("credentialsWareSet") === "1")
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const activeItem = useMemo(() => findItem(activeId, lists), [activeId, lists])
  const historyNotificationCount = useMemo(() => Object.keys(historyItems).length, [historyItems])
  const visibleListEntries = useMemo(
    () => listEntries.filter(([listId]) => isUnorderedVisible || listId !== 'unordered'),
    [isUnorderedVisible]
  )
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleCredentialsSaved() {
    localStorage.setItem("credentialsWareSet", "1")
    setCredentialsWareSet(true)
  }

  useEffect(() => {
    let isMounted = true
    async function loadBoardData() {
      const [mealsData, unorderedMeals, historyData, credentialsWareSetServer] = await Promise.all([
        getFetchData<string[]>('/api/meals'),
        getFetchData<string[]>('/api/unordered'),
        getFetchData<HistoryMap>('/api/history'),
        credentialsWareSet ? Promise.resolve(true) : getFetchData<unknown>('/api/credentials')
      ])
      if (!isMounted) return
      if (typeof credentialsWareSetServer === 'boolean') {
        setCredentialsWareSet(credentialsWareSetServer)
        if (credentialsWareSetServer) localStorage.setItem("credentialsWareSet", "1")
        else setIsCredentialsOpen(true)
      }
      setLists(currentLists => {
        let nextLists = currentLists
        let hasUpdate = false
        if (mealsData) {
          nextLists = { ...nextLists, meals: createListItems('meals', mealsData) }
          hasUpdate = true
        }
        else if (mealsData !== null) addAlert('Meals response is invalid.', 'E')

        if (unorderedMeals) {
          nextLists = { ...nextLists, unordered: createListItems('unordered', unorderedMeals) }
          hasUpdate = true
          setIsUnorderedVisible(unorderedMeals.length > 0)
        }
        else if (unorderedMeals !== null) addAlert('Unordered meals response is invalid.', 'E')
        return hasUpdate ? nextLists : currentLists
      })
      if (isHistoryMap(historyData)) setHistoryItems(historyData)
      else if (historyData !== null) addAlert('History response is invalid.', 'E')
    }

    void loadBoardData()

    function handlePointerDown(event: PointerEvent) {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setIsHistoryOpen(false)
        setIsMenuOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsHistoryOpen(false)
        setIsMenuOpen(false)
        setIsCredentialsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      isMounted = false
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const handleDragStart = (event: DragStartEvent) => {
    const activeListId = findContainer(event.active.id, lists)
    const activeIndex = activeListId
      ? findItemIndex(lists, activeListId, event.active.id)
      : -1

    setActiveId(event.active.id)
    setDropIndicator(activeListId && activeIndex !== -1 ? { listId: activeListId, index: activeIndex } : null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    setDropIndicator(getDropIndicator(event, lists))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active } = event
    setActiveId(null)
    setDropIndicator(null)
    setLists(currentLists => {
      const activeListId = findContainer(active.id, currentLists)
      const nextDropIndicator = getDropIndicator(event, currentLists)

      if (!activeListId || !nextDropIndicator) return currentLists
      const activeIndex = findItemIndex(currentLists, activeListId, active.id)
      if (activeIndex === -1) return currentLists

      if (activeListId === nextDropIndicator.listId) {
        if (activeIndex === nextDropIndicator.index) return currentLists
        const nextLists = {
          ...currentLists,
          [activeListId]: arrayMove(currentLists[activeListId], activeIndex, nextDropIndicator.index)
        }
        void saveLists(nextLists)
        return nextLists
      }

      const movedItem = currentLists[activeListId][activeIndex]
      const nextActiveItems = currentLists[activeListId].filter(item => item.id !== movedItem.id)
      const nextOverItems = [...currentLists[nextDropIndicator.listId]]

      nextOverItems.splice(nextDropIndicator.index, 0, movedItem)
      const nextLists = {
        ...currentLists,
        [activeListId]: nextActiveItems,
        [nextDropIndicator.listId]: nextOverItems,
      }
      void saveLists(nextLists)
      return nextLists
    })
  }

  function handleGather() {
    getFetchData("/api/gather")
    console.log("GATHER")
  }
  function handleOrder() {
    getFetchData("/api/order")
    console.log("ORDER")
  }

  return <main className="app">
    <div className="app-toolbar" ref={toolbarRef}>
      <div className="toolbar-group">
        <button
          aria-expanded={isHistoryOpen}
          aria-haspopup="dialog"
          className="menu-button history-button"
          onClick={() => {
            setIsHistoryOpen(open => !open)
            setIsMenuOpen(false)
          }}
          type="button"
        >
          Order history
          {historyNotificationCount > 0 && <span className="history-badge">{historyNotificationCount}</span>}
        </button>
        {isHistoryOpen && <div className="menu-popup menu-popup-left" role="dialog" aria-label="Order history">
          <OrderHistory items={historyItems} />
        </div>}
      </div>
      <div className="toolbar-group toolbar-group-right">
        <button
          className="menu-button"
          onClick={() => setIsUnorderedVisible(visible => !visible)}
          type="button"
        >
          {isUnorderedVisible ? 'Hide Unordered' : 'Show Unordered'}
        </button>
        <button
          className="menu-button"
          onClick={() => {
            setIsCredentialsOpen(true)
            setIsMenuOpen(false)
            setIsHistoryOpen(false)
          }}
          type="button"
        >
          Credentials
        </button>
        <button
          aria-expanded={isMenuOpen}
          aria-haspopup="dialog"
          className="menu-button"
          onClick={() => {
            setIsMenuOpen(open => !open)
            setIsHistoryOpen(false)
          }}
          type="button"
        >
          User actions
        </button>
        {isMenuOpen && <div className="menu-popup menu-popup-right" role="dialog" aria-label="Actions menu">
          <button type="button" onClick={handleGather}>Gather</button>
          <button type="button" onClick={handleOrder}>Order</button>
        </div>}
      </div>
    </div>
    <DndContext
      collisionDetection={closestCorners}
      onDragCancel={() => {
        setActiveId(null)
        setDropIndicator(null)
      }}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <section className={`board ${activeId ? 'is-dragging' : ''} ${visibleListEntries.length === 1 ? 'board-single' : ''}`} aria-label="Meal lists">
        {visibleListEntries.map(([listId, details]) => (
          <ListColumn
            activeId={activeId}
            activeItem={activeItem}
            details={details}
            dropIndicator={dropIndicator}
            items={lists[listId]}
            key={listId}
            listId={listId}
          />
        ))}
      </section>
      <DragOverlay>
        {activeItem && <MealItem as="div" item={activeItem} className="drag-overlay-item" />}
      </DragOverlay>
    </DndContext>
    {isCredentialsOpen && <Credentials
      firstTime={!credentialsWareSet}
      onClose={() => setIsCredentialsOpen(false)}
      onSaved={handleCredentialsSaved}
    />}
  </main>
}
