import { BarcodeDetector } from 'barcode-detector/ponyfill'

let detector: BarcodeDetector | null = null

/** QR-декодер: системный API, если он есть, иначе ZXing (Safari). */
export function getQrDetector(): BarcodeDetector {
  detector ??= new BarcodeDetector({ formats: ['qr_code'] })
  return detector
}
