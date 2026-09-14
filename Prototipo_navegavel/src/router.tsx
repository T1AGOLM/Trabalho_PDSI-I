import { useEffect, useState } from 'react'
import { makeRoute, Route } from './shell'

export type { Route }

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '')
  if (!raw) return makeRoute('landing')
  const [name, query] = raw.split('?')
  const params: Record<string, any> = {}
  if (query) {
    for (const kv of query.split('&')) {
      const [k, v] = kv.split('=')
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '')
    }
  }
  return makeRoute(name || 'landing', params)
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash)
  useEffect(() => {
    const h = () => setRoute(parseHash())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])
  return route
}

export function go(name: string, params: Record<string, any> = {}) {
  const q = Object.keys(params).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`).join('&')
  window.location.hash = `#/${name}${q ? '?' + q : ''}`
}
