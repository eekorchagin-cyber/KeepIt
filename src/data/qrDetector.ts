import { BarcodeDetector } from 'barcode-detector/ponyfill'

let detector: BarcodeDetector | null = null

/**
 * Декодер QR и заводских штрихкодов (EAN, UPC, Code 128 — их можно присвоить вещи или месту):
 * системный API, если он есть, иначе ZXing (Safari).
 */
export function getQrDetector(): BarcodeDetector {
  detector ??= new BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })
  return detector
}
