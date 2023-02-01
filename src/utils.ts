export const ERROR_NO_RESOLVE =
  '[next-static] FATAL, unable to start: Make sure to pass `--experimental-import-meta-resolve` or `NODE_OPTIONS=--experimental-import-meta-resolve`'

export const resolveEntry = async (file: string, context?: string) =>
  new URL((await import.meta?.resolve?.(file, context)) || '').pathname
