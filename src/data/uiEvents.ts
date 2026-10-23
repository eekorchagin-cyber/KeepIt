const ADD_PLACE_EVENT = 'keepit:add-place'

/** Открыть окно «Новое место» верхней панели (оно живёт в TopBar) для текущего экрана */
export function requestAddPlace() {
  window.dispatchEvent(new Event(ADD_PLACE_EVENT))
}

export function onAddPlaceRequest(handler: () => void): () => void {
  window.addEventListener(ADD_PLACE_EVENT, handler)
  return () => window.removeEventListener(ADD_PLACE_EVENT, handler)
}
