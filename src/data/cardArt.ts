// Background art for cards, discovered at build time.
//
// Vite hashes and bundles anything under src/assets, so each image gets a content-addressed
// URL and can be cached for a year. Dropping a `<slug>.jpg` into src/assets/cards is the whole
// act of adding art — no data-file entry, no registry to keep in sync. A slug with no file
// simply renders without art.
const files = import.meta.glob('../assets/cards/*.jpg', { eager: true, query: '?url', import: 'default' })

export const cardArt: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [
    path.replace(/^.*\/([^/]+)\.jpg$/, '$1'),
    url as string
  ])
)
