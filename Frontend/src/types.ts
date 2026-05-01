export type ListId = 'meals' | 'unordered'

export type ListItem = {
  id: string
  label: string
}

export type ListState = Record<ListId, ListItem[]>

export type ListDetail = {
  title: string
  empty: string
}

export type HistoryMap = Record<string, string>

export type DropIndicator = {
  listId: ListId
  index: number
}

export type VisibleItem = {
  index: number
  item: ListItem
}
