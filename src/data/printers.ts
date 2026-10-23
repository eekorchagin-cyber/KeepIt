/**
 * Принтеры, для которых печать меток проверена и надёжна:
 * — AirPrint: печать прямо из KeepIt через системное окно печати;
 * — фирменное приложение: KeepIt готовит метки картинками точно под размер этикетки,
 *   печать — в приложении производителя (прямого протокола из браузера на iPhone нет).
 */

export type LabelSize = { widthMm: number; heightMm: number }

export type PrinterMethod = 'airprint-tape' | 'airprint-a4' | 'image'

export type PrinterProfile = {
  id: string
  name: string
  kind: string
  method: PrinterMethod
  /** Размеры этикеток (для «image»); первый — по умолчанию */
  sizes: LabelSize[]
  /** Точек на мм при подготовке картинок (203 dpi ≈ 8) */
  dotsPerMm: number
  steps: string[]
}

const SAVE_IMAGES_STEP =
  'Нажмите «Подготовить метки-картинки», затем «Сохранить картинки» → «Сохранить изображения» — метки попадут в «Фото».'

export const PRINTERS: PrinterProfile[] = [
  {
    id: 'brother-ql',
    name: 'Brother QL-810W / QL-820NWB',
    kind: 'AirPrint · лента 62 мм',
    method: 'airprint-tape',
    sizes: [{ widthMm: 62, heightMm: 40 }],
    dotsPerMm: 12,
    steps: [
      'Вставьте непрерывную ленту 62 мм (DK-22205 или DK-22251).',
      'Подключите принтер к той же сети Wi-Fi, что и телефон.',
      'Нажмите «Печать» внизу — откроется окно AirPrint.',
      'Выберите принтер Brother QL, бумагу 62 мм, масштаб 100%.',
      'Каждая метка печатается отдельной этикеткой 62×40 мм с отрезкой.',
    ],
  },
  {
    id: 'hp-m426',
    name: 'HP LaserJet Pro MFP M426dw',
    kind: 'AirPrint · лист A4 или A5',
    method: 'airprint-a4',
    sizes: [{ widthMm: 210, heightMm: 297 }],
    dotsPerMm: 12,
    steps: [
      'Выберите «Формат бумаги» (A4 или A5) и «Этикеток на листе» — столько, сколько на вашем листе этикеток; для листа без разметки (обычная или сплошная самоклеящаяся бумага) метки печатаются с пунктиром для разрезания.',
      'Для небольшого числа меток разрежьте лист этикеток A4 поперёк пополам и выберите A5 → «Половина листа этикеток A4».',
      'Положите бумагу в лоток, подключите принтер к той же сети Wi-Fi, что и телефон.',
      'Нажмите «Печать» внизу — откроется окно AirPrint.',
      'Выберите HP LaserJet, бумагу того же формата, масштаб 100% (не «Вписать»).',
      'Печать и «Печать в файл PDF» дают одинаковый результат.',
    ],
  },
  {
    id: 'niimbot-b1',
    name: 'NIIMBOT B1',
    kind: 'Через приложение NIIMBOT · этикетки до 50 мм',
    method: 'image',
    sizes: [
      { widthMm: 50, heightMm: 30 },
      { widthMm: 40, heightMm: 30 },
      { widthMm: 30, heightMm: 20 },
    ],
    dotsPerMm: 8,
    steps: [
      'Выберите размер этикетки — как у рулона в принтере.',
      SAVE_IMAGES_STEP,
      'Откройте приложение NIIMBOT и подключите принтер по Bluetooth.',
      'Создайте новую этикетку того же размера и добавьте элемент «Изображение» — выберите сохранённую метку.',
      'Растяните картинку на всю этикетку и нажмите «Печать». Для каждой метки повторите выбор изображения.',
    ],
  },
  {
    id: 'niimbot-b21s',
    name: 'NIIMBOT B21S',
    kind: 'Через приложение NIIMBOT · этикетки до 50 мм',
    method: 'image',
    sizes: [
      { widthMm: 50, heightMm: 30 },
      { widthMm: 40, heightMm: 30 },
      { widthMm: 30, heightMm: 20 },
    ],
    dotsPerMm: 8,
    steps: [
      'Выберите размер этикетки — как у рулона в принтере.',
      SAVE_IMAGES_STEP,
      'Откройте приложение NIIMBOT и подключите принтер по Bluetooth.',
      'Создайте новую этикетку того же размера и добавьте элемент «Изображение» — выберите сохранённую метку.',
      'Растяните картинку на всю этикетку и нажмите «Печать». Для каждой метки повторите выбор изображения.',
    ],
  },
  {
    id: 'niimbot-b3s',
    name: 'NIIMBOT B3S',
    kind: 'Через приложение NIIMBOT · этикетки до 75 мм',
    method: 'image',
    sizes: [
      { widthMm: 70, heightMm: 40 },
      { widthMm: 60, heightMm: 40 },
      { widthMm: 50, heightMm: 30 },
    ],
    dotsPerMm: 8,
    steps: [
      'Выберите размер этикетки — как у рулона в принтере.',
      SAVE_IMAGES_STEP,
      'Откройте приложение NIIMBOT и подключите принтер по Bluetooth.',
      'Создайте новую этикетку того же размера и добавьте элемент «Изображение» — выберите сохранённую метку.',
      'Растяните картинку на всю этикетку и нажмите «Печать». Для каждой метки повторите выбор изображения.',
    ],
  },
  {
    id: 'aiyin-ip802bt',
    name: 'AIYIN IP-802BT',
    kind: 'Через приложение AIYIN · этикетки до 80 мм',
    method: 'image',
    sizes: [
      { widthMm: 58, heightMm: 40 },
      { widthMm: 58, heightMm: 30 },
      { widthMm: 75, heightMm: 50 },
    ],
    dotsPerMm: 8,
    steps: [
      'Выберите размер этикетки — как у рулона в принтере (для маркетплейсов обычно 58×40 мм).',
      SAVE_IMAGES_STEP,
      'Откройте фирменное приложение AIYIN (указано в инструкции к принтеру) и подключите принтер по Bluetooth.',
      'Выберите печать изображения (картинки), укажите размер этикетки и выберите сохранённые метки.',
      'Проверьте предпросмотр — метка должна занимать всю этикетку — и нажмите «Печать».',
    ],
  },
]

export const DEFAULT_PRINTER_ID = 'brother-ql'

export function findPrinter(id: string | null | undefined): PrinterProfile {
  return PRINTERS.find((printer) => printer.id === id) ?? PRINTERS[0]!
}

export function sizeLabel(size: LabelSize): string {
  return `${size.widthMm}×${size.heightMm} мм`
}
