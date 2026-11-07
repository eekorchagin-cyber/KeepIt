/**
 * Поиск названия товара по заводскому штрихкоду (EAN/UPC) в открытых базах Open Facts.
 * Работает из браузера (CORS *); для произвольных QR и Code 128 не вызывается.
 */

export type ProductLookupResult = {
  name: string
  brand: string
  /** Какая база нашла товар */
  source: 'food' | 'beauty' | 'products'
}

const USER_AGENT = 'KeepIt (https://github.com/eekorchagin-cyber/KeepIt)'

const SOURCES: Array<{
  id: ProductLookupResult['source']
  host: string
}> = [
  { id: 'food', host: 'https://world.openfoodfacts.org' },
  { id: 'beauty', host: 'https://world.openbeautyfacts.org' },
  { id: 'products', host: 'https://world.openproductsfacts.org' },
]

const FIELDS = ['product_name', 'product_name_ru', 'generic_name', 'generic_name_ru', 'brands', 'code'].join(',')

/** Только «чистый» GTIN/EAN/UPC из цифр — не URL KeepIt и не произвольный текст QR. */
export function parseGtinBarcode(raw: string): string | null {
  const trimmed = raw.trim()
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(trimmed)) return null
  // Отсечь заведомо невалидные (все нули и т. п.)
  if (/^0+$/.test(trimmed)) return null
  return trimmed
}

function pickName(product: Record<string, unknown>): string {
  const candidates = [
    product.product_name_ru,
    product.generic_name_ru,
    product.product_name,
    product.generic_name,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim().replace(/\s+/g, ' ')
  }
  return ''
}

function pickBrand(product: Record<string, unknown>): string {
  const brands = product.brands
  if (typeof brands !== 'string' || !brands.trim()) return ''
  // В базах бренды через запятую — берём первый
  return brands.split(',')[0]?.trim() ?? ''
}

function formatTitle(name: string, brand: string): string {
  if (!name) return ''
  if (!brand) return name
  const lower = name.toLowerCase()
  if (lower.includes(brand.toLowerCase())) return name
  return `${brand} ${name}`
}

async function lookupInSource(
  host: string,
  code: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
  const url = `${host}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  })
  if (response.status === 404) return null
  if (!response.ok) return null
  const data = (await response.json()) as { status?: number; product?: Record<string, unknown> }
  if (data.status !== 1 || !data.product) return null
  return data.product
}

/**
 * Найти товар по EAN/UPC. Если код не похож на штрихкод — сразу null.
 * Источники по очереди: еда → косметика → прочие товары Open Facts.
 */
export async function lookupProductByBarcode(
  raw: string,
  signal?: AbortSignal,
): Promise<ProductLookupResult | null> {
  const code = parseGtinBarcode(raw)
  if (!code) return null

  for (const source of SOURCES) {
    if (signal?.aborted) return null
    try {
      const product = await lookupInSource(source.host, code, signal)
      if (!product) continue
      const name = pickName(product)
      const brand = pickBrand(product)
      const title = formatTitle(name, brand)
      if (!title) continue
      return { name: title, brand, source: source.id }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null
      // сеть / таймаут — пробуем следующую базу
    }
  }
  return null
}

export function productLookupSourceLabel(source: ProductLookupResult['source']): string {
  switch (source) {
    case 'food':
      return 'Open Food Facts'
    case 'beauty':
      return 'Open Beauty Facts'
    case 'products':
      return 'Open Products Facts'
  }
}
