import { useCallback, useState } from 'react'

export function useObjectState<T extends object>(initialState: T) {
  const [state, setState] = useState<T>(initialState)
  const setPartial = useCallback((update: Partial<T> | ((prev: T) => Partial<T>)) => {
    setState(prev => ({
      ...prev,
      ...(typeof update === 'function' ? update(prev) : update),
    }))
  }, [])
  const reset = useCallback((update?: Partial<T> | ((initial: T) => Partial<T>)) => {
    setState({
      ...initialState,
      ...(typeof update === 'function' ? update(initialState) : update)
    })
  }, [initialState])
  return [state, setPartial, reset] as const
}
