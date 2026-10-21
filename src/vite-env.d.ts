/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __RELEASE_HISTORY__: Array<{ version: string; date: string; notes: string }>

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_PUBLIC_APP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface BarcodeDetector {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string; format: string }>>
}

declare const BarcodeDetector: {
  new (options?: { formats?: string[] }): BarcodeDetector
  getSupportedFormats?: () => Promise<string[]>
}
