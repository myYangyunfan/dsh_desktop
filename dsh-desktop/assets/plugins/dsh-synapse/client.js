window.__ModuleLoader__.load({
  id: 'dsh-synapse',
  factory: () => {
    const module = { exports: {} }
    const currentSession = ctx => {
      const snapshot = ctx.sessions.list.getSnapshot()
      const id = snapshot.current
      if (id === undefined) return null
      const session = snapshot.byId[id]
      return session === undefined ? null : { id, title: session.displayTitle, cwd: session.cwd ?? null }
    }
    const sessionSnapshot = ctx => {
      const snapshot = ctx.sessions.list.getSnapshot()
      return snapshot.ids.map(id => {
        const session = snapshot.byId[id]
        return session === undefined ? null : { id, title: session.displayTitle, cwd: session.cwd ?? null, parentId: session.parentId ?? null, blank: session.blank }
      }).filter(Boolean)
    }
    const workspaceSnapshot = ctx => {
      const sessions = ctx.sessions.list.getSnapshot()
      const snapshot = ctx.workspaces.list.getSnapshot()
      const accounted = new Set(snapshot.items.flatMap(workspace => workspace.sessionIds))
      return [
        ...snapshot.items.map(workspace => ({ id: workspace.workspaceId, title: workspace.title, path: workspace.path, sessionIds: workspace.sessionIds })),
        { id: 'dsh-ungrouped', title: '未分组', path: null, sessionIds: sessions.ids.filter(id => !accounted.has(id)) },
      ]
    }

    module.exports.inject = ['sessions', 'workspaces']
    module.exports.apply = ctx => {
      const prompt = async (sessionId, text) => {
        const scope = ctx.sessions.scope(sessionId)
        const session = scope === undefined ? undefined : ctx.sessions.sessionOf(scope)
        if (session === undefined) throw new Error('关联的 DSH 会话已不可用')
        const result = await session.prompt([{ type: 'text', text }], 'queue')
        if (!result.ok) throw new Error(result.error?.message ?? 'DSH 未接受这条消息')
      }
      const style = document.createElement('style')
      style.textContent = '.dsh-synapse-switch{position:fixed;z-index:80;top:12px;left:50%;display:flex;gap:2px;transform:translateX(-50%);border:1px solid #d1d5db;border-radius:999px;background:rgba(255,255,255,.96);padding:3px;backdrop-filter:blur(10px)}.dsh-synapse-switch button{height:28px;border:0;border-radius:999px;background:transparent;padding:0 11px;color:#6b7280;font:600 12px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}.dsh-synapse-switch button:hover{background:#f3f4f6;color:#111827}.dsh-synapse-switch button.active{background:#111827;color:#fff}.dsh-synapse-switch button:focus-visible{outline:2px solid #111827;outline-offset:2px}.dsh-synapse-overlay{position:fixed;z-index:100;inset:0;background:#f5f7fa}.dsh-synapse-overlay.is-opening{visibility:hidden}.dsh-synapse-overlay[hidden]{display:none}.dsh-synapse-overlay iframe{display:block;width:100%;height:100%;border:0}'
      document.head.append(style)
      const host = document.createElement('div')
      host.className = 'dsh-synapse-host'
      host.innerHTML = '<div class="dsh-synapse-switch" role="group" aria-label="视图切换"><button type="button" data-view="dialog" class="active" aria-pressed="true">对话</button><button type="button" data-view="map" aria-pressed="false">会话地图</button></div><section class="dsh-synapse-overlay" hidden><iframe title="会话地图" src="/synapse/"></iframe></section>'
      document.body.append(host)
      const dialogButton = host.querySelector('[data-view="dialog"]')
      const mapButton = host.querySelector('[data-view="map"]')
      const overlay = host.querySelector('.dsh-synapse-overlay')
      const frame = host.querySelector('iframe')

      const setView = view => {
        const showingMap = view === 'map'
        dialogButton.classList.toggle('active', !showingMap)
        dialogButton.setAttribute('aria-pressed', String(!showingMap))
        mapButton.classList.toggle('active', showingMap)
        mapButton.setAttribute('aria-pressed', String(showingMap))
      }
      const close = () => {
        window.clearTimeout(mapOpenFallback)
        mapOpening = false
        overlay.classList.remove('is-opening')
        overlay.hidden = true
        setView('dialog')
      }
      const send = (type, payload) => { frame.contentWindow?.postMessage({ source: 'dsh-synapse', type, ...payload }, location.origin) }
      let syncQueued = false
      let knownSessionIds = new Set()
      const liveUnsubscribers = new Map()
      const syncLiveSessions = () => {
        const snapshot = ctx.sessions.list.getSnapshot()
        for (const id of snapshot.ids) {
          if (liveUnsubscribers.has(id)) continue
          const scope = ctx.sessions.scope(id)
          const session = scope === undefined ? undefined : ctx.sessions.sessionOf(scope)
          if (session === undefined) continue
          const publish = () => {
            if (overlay.hidden) return
            const state = session.getSnapshot()
            const text = state.partial?.blocks.filter(block => block.kind === 'text').map(block => block.text).join('\n') ?? ''
            send('synapse:live-reply', { sessionId: id, running: state.running, text })
          }
          liveUnsubscribers.set(id, session.subscribe(publish))
          publish()
        }
        for (const [id, unsubscribe] of liveUnsubscribers) if (!snapshot.ids.includes(id)) { unsubscribe(); liveUnsubscribers.delete(id) }
      }
      const syncSessions = () => {
        if (syncQueued) return
        syncQueued = true
        queueMicrotask(() => {
          syncQueued = false
          const sessions = sessionSnapshot(ctx)
          const sessionIds = new Set(sessions.map(session => session.id))
          const removedSessionIds = [...knownSessionIds].filter(id => !sessionIds.has(id))
          knownSessionIds = sessionIds
          void fetch('/synapse/api/sessions/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessions, removedSessionIds }) }).catch(() => {})
        })
      }
      const syncCurrentSession = () => {
        syncSessions()
        syncLiveSessions()
        if (!overlay.hidden) {
          send('synapse:workspaces', { workspaces: workspaceSnapshot(ctx) })
          send('synapse:current-session', { session: currentSession(ctx) })
        }
      }
      let mapOpenFallback = 0
      let mapOpening = false
      const showMapOverlay = () => {
        window.clearTimeout(mapOpenFallback)
        mapOpening = false
        overlay.hidden = false
        overlay.classList.remove('is-opening')
        syncCurrentSession()
      }
      const open = () => {
        window.clearTimeout(mapOpenFallback)
        mapOpening = true
        setView('map')
        // Keep the iframe laid out while hidden so its canvas can receive a
        // real scroll offset. display:none would clamp scrollTop back to zero.
        overlay.hidden = false
        overlay.classList.add('is-opening')
        window.requestAnimationFrame(() => {
          send('synapse:map-opened')
          syncCurrentSession()
        })
        mapOpenFallback = window.setTimeout(showMapOverlay, 300)
      }
      const onFrameLoad = () => {
        syncCurrentSession()
        if (mapOpening) send('synapse:map-opened')
      }
      const onMessage = event => {
        if (event.origin !== location.origin || event.data?.source !== 'dsh-synapse') return
        if (event.data.type === 'synapse:close') return close()
        if (event.data.type === 'synapse:map-ready') return showMapOverlay()
        if (event.data.type === 'synapse:request-current') {
          send('synapse:workspaces', { workspaces: workspaceSnapshot(ctx) })
          return send('synapse:current-session', { session: currentSession(ctx) })
        }
        if (event.data.type === 'synapse:open-session') {
          try { ctx.sessions.open(event.data.sessionId); close() } catch { send('synapse:bridge-error', { message: '关联的 DSH 会话已不可用' }) }
          return
        }
        if (event.data.type === 'synapse:activate-session') {
          // Bidirectional current-session sync: switch DSH's current session
          // without closing the map; the sessions-list subscription re-sends
          // synapse:current-session so the map follows the new highlight.
          try { ctx.sessions.open(event.data.sessionId) } catch { send('synapse:bridge-error', { message: '关联的 DSH 会话已不可用' }) }
          return
        }
        if (event.data.type === 'synapse:fork-session') {
          const atSeq = Number.isInteger(event.data.atSeq) ? event.data.atSeq : undefined
          ctx.sessions.fork({ sessionId: event.data.sessionId, atSeq, increaseTitle: true }).then(id => {
            const snapshot = ctx.sessions.list.getSnapshot()
            send('synapse:forked-session', { requestId: event.data.requestId, session: { id, title: snapshot.byId[id]?.displayTitle ?? 'DSH 分支' } })
          }).catch(() => { send('synapse:bridge-error', { message: 'DSH 分支创建失败，请确认源会话已经完成当前轮次' }) })
          return
        }
        if (event.data.type === 'synapse:send-message') {
          const text = typeof event.data.text === 'string' ? event.data.text.trim() : ''
          if (text === '') return send('synapse:bridge-error', { requestId: event.data.requestId, message: '消息不能为空' })
          prompt(event.data.sessionId, text).then(() => {
            send('synapse:message-sent', { requestId: event.data.requestId, sessionId: event.data.sessionId })
          }).catch(error => {
            send('synapse:bridge-error', { requestId: event.data.requestId, message: error instanceof Error ? error.message : 'DSH 消息发送失败' })
          })
          return
        }
        if (event.data.type === 'synapse:create-session') {
          const workspaceId = typeof event.data.workspaceId === 'string' && event.data.workspaceId !== '' && event.data.workspaceId !== 'dsh-ungrouped' ? event.data.workspaceId : undefined
          const cwd = typeof event.data.cwd === 'string' && event.data.cwd !== '' ? event.data.cwd : undefined
          const create = workspaceId === undefined ? ctx.sessions.create(cwd === undefined ? {} : { cwd }) : ctx.sessions.create({ workspaceId })
          create.then(id => {
            const snapshot = ctx.sessions.list.getSnapshot()
            send('synapse:created-session', { requestId: event.data.requestId, session: { id, title: snapshot.byId[id]?.displayTitle ?? '新会话', cwd: snapshot.byId[id]?.cwd ?? cwd ?? null } })
          }).catch(() => { send('synapse:bridge-error', { requestId: event.data.requestId, message: 'DSH 会话创建失败，请先在 DSH 选择工作目录' }) })
        }
      }
      const onKeyDown = event => { if (event.key === 'Escape' && !overlay.hidden) close() }
      const unsubscribeSessions = ctx.sessions.list.subscribe(syncCurrentSession)
      const unsubscribeWorkspaces = ctx.workspaces.list.subscribe(syncCurrentSession)
      dialogButton.addEventListener('click', close)
      mapButton.addEventListener('click', open)
      frame.addEventListener('load', onFrameLoad)
      window.addEventListener('message', onMessage)
      window.addEventListener('keydown', onKeyDown)
      ctx.effect(() => () => {
        dialogButton.removeEventListener('click', close)
        mapButton.removeEventListener('click', open)
        frame.removeEventListener('load', onFrameLoad)
        window.removeEventListener('message', onMessage)
        window.removeEventListener('keydown', onKeyDown)
        unsubscribeSessions()
        unsubscribeWorkspaces()
        for (const unsubscribe of liveUnsubscribers.values()) unsubscribe()
        host.remove()
        style.remove()
      }, 'synapse: web workspace switch')
    }
    return module.exports
  },
})
