import { useEffect, useMemo, useRef, useState } from 'react'
import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { addAlert } from './components/alertSystem'
import Credentials from './components/Credentials'
import { generalFetch, getFetchData } from './components/fetch'
import ListColumn from './components/ListColumn'
import Toolbar from './components/Toolbar'
import type { DropIndicator, HistoryMap, ListDetail, ListId, ListItem, ListState } from './types'
import './css/app.css'

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

function createListItems(listId: ListId, labels: string[]) {
  return labels.map((label, index) => ({
    id: `${listId}-${index}-${label}`,
    label
  }))
}

function saveLists(lists: ListState) {
  return generalFetch('/api/meals', {
    meals: lists.meals.map(item => item.label),
    unordered: lists.unordered.map(item => item.label),
  })
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

function moveItem(items: ListItem[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return items
  const nextItems = items.filter((_, index) => index !== fromIndex)
  nextItems.splice(toIndex, 0, items[fromIndex])
  return nextItems
}

function getListEdgeDropIndex(itemCount: number, activeRect: DragOverEvent['active']['rect']['current']['translated'], overRect: NonNullable<DragOverEvent['over']>['rect']) {
  if (itemCount === 0) return 0
  if (!activeRect) return itemCount
  const activeCenter = activeRect.top + (activeRect.height / 2)
  const overMidpoint = overRect.top + (overRect.height / 2)
  return activeCenter <= overMidpoint ? 0 : itemCount
}

function getItemDropIndex(itemCount: number, overIndex: number, activeRect: DragOverEvent['active']['rect']['current']['translated'], overRect: NonNullable<DragOverEvent['over']>['rect']) {
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

export default function App() {
  const [lists, setLists] = useState<ListState>(initialLists)
  const [historyItems, setHistoryItems] = useState<HistoryMap>({})
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)
  const [isUnorderedVisible, setIsUnorderedVisible] = useState(true)
  const [isCredentialsOpen, setIsCredentialsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [credentialsWareSet, setCredentialsWareSet] = useState(localStorage.getItem("credentialsWareSet") === "1")
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const activeItem = useMemo(() => findItem(activeId, lists), [activeId, lists])
  const visibleListEntries = useMemo(
    () => listEntries.filter(([listId]) => isUnorderedVisible || listId !== 'unordered'),
    [isUnorderedVisible]
  )
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function loadMealLists(shouldApply: () => boolean = () => true) {
    const [mealsData, unorderedMeals] = await Promise.all([
      getFetchData<string[]>('/api/meals'),
      getFetchData<string[]>('/api/unordered'),
    ])
    if (!shouldApply() || mealsData === null || unorderedMeals === null) return

    setLists(currentLists => ({
      ...currentLists,
      meals: createListItems('meals', mealsData),
      unordered: createListItems('unordered', unorderedMeals),
    }))
    setIsUnorderedVisible(unorderedMeals.length > 0)
  }

  function handleCredentialsSaved() {
    localStorage.setItem("credentialsWareSet", "1")
    setCredentialsWareSet(true)
  }

  useEffect(() => {
    let isMounted = true
    async function loadBoardData() {
      const [historyData, credentialsWareSetServer] = await Promise.all([
        getFetchData<HistoryMap>('/api/history'),
        credentialsWareSet ? Promise.resolve(true) : getFetchData<boolean>('/api/credentials')
      ])
      if (!isMounted) return
      await loadMealLists(() => isMounted)
      if (!isMounted) return
      if (credentialsWareSetServer !== null) {
        setCredentialsWareSet(credentialsWareSetServer)
        if (credentialsWareSetServer) localStorage.setItem("credentialsWareSet", "1")
        else setIsCredentialsOpen(true)
      }
      if (historyData !== null) setHistoryItems(historyData)
    }

    void loadBoardData()
    return () => { isMounted = false }
  }, [])

  const handleDragStart = (event: DragStartEvent) => {
    const activeListId = findContainer(event.active.id, lists)
    const activeIndex = activeListId
      ? findItemIndex(lists, activeListId, event.active.id)
      : -1

    setActiveId(event.active.id)
    setDropIndicator(activeListId && activeIndex !== -1 ? { listId: activeListId, index: activeIndex } : null)
  }

  const handleDragOver = (event: DragOverEvent) => { setDropIndicator(getDropIndicator(event, lists)) }

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

  function handlePositionChange(itemId: UniqueIdentifier, nextPosition: number) {
    if (!Number.isInteger(nextPosition)) return
    setLists(currentLists => {
      const activeIndex = findItemIndex(currentLists, 'meals', itemId)
      if (activeIndex === -1) return currentLists
      const nextIndex = Math.max(0, Math.min(nextPosition - 1, currentLists.meals.length - 1))
      if (activeIndex === nextIndex) return currentLists
      const nextLists = {
        ...currentLists,
        meals: moveItem(currentLists.meals, activeIndex, nextIndex)
      }
      void saveLists(nextLists)
      return nextLists
    })
  }

  return <main className="app">
    <Toolbar
      historyItems={historyItems}
      loadMealLists={loadMealLists}
      isUnorderedVisible={isUnorderedVisible}
      onCredentialsClick={() => setIsCredentialsOpen(true)}
      onSearchChange={setSearchQuery}
      onUnorderedToggle={() => setIsUnorderedVisible(visible => !visible)}
      searchInputRef={searchInputRef}
      searchQuery={searchQuery}
    />
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
            onPositionChange={handlePositionChange}
            searchQuery={searchQuery}
          />
        ))}
      </section>
      <DragOverlay>
        {activeItem && <div className="item drag-overlay-item">{activeItem.label}</div>}
      </DragOverlay>
    </DndContext>
    {isCredentialsOpen && <Credentials
      firstTime={!credentialsWareSet}
      onClose={() => setIsCredentialsOpen(false)}
      onSaved={handleCredentialsSaved}
    />}
  </main>
}
