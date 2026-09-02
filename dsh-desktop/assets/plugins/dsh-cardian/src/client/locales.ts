// Copy for the "知识中心" sidebar surface. Registered under the
// `cardian.sidebar` locale namespace by the client plugin entry.
export type KnowledgeTreeKey =
  | 'title' | 'cards' | 'memory' | 'wiki' | 'search' | 'empty'
  | 'open' | 'close' | 'refresh' | 'noResults' | 'items'

export const zh: Record<KnowledgeTreeKey, string> = {
  title: '知识中心',
  cards: '知识卡片',
  memory: '记忆',
  wiki: 'RepoWiki',
  search: '搜索…',
  empty: '暂无内容，先用工具沉淀知识吧',
  noResults: '没有匹配结果',
  open: '知识中心',
  close: '关闭',
  refresh: '刷新',
  items: '条',
}

export const en: Record<KnowledgeTreeKey, string> = {
  title: 'Knowledge Center',
  cards: 'Cards',
  memory: 'Memory',
  wiki: 'RepoWiki',
  search: 'Search…',
  empty: 'Nothing here yet — capture some knowledge first',
  noResults: 'No matches',
  open: 'Knowledge Center',
  close: 'Close',
  refresh: 'Refresh',
  items: 'items',
}
