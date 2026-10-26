import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hito, Tarea } from '../types'

const PANEL = 'progreso-agentes'
const TITULO = 'Progreso de agentes'
const tareas = atom({ plugin: 'progreso-agentes', key: 'tareas' } as const, {})
const tick = atom({ plugin: 'progreso-agentes', key: 'tick' } as const, 0)

const ESTIMADO_POR_DEFECTO = 15 * 60_000
const OCULTAR_TERMINADAS_MS = 15 * 60_000
const ANCHO_BARRA = 20
const TEXTO = '#87CEEB'
const ATASCADO_MS = 3 * 60_000
const GIRO = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

// La barra cambia de color según cómo va contra el estimado: a tiempo, cerca, pasado
export function colorBarra(dur: number, est: number): string {
  const r = dur / est
  return r < 0.7 ? '#2E8B57' : r <= 1 ? '#FFA500' : '#FF6F61'
}

// Qué comando marca cada hito (sobre el comando de Bash)
const HITOS: [keyof Tarea['hitos'], RegExp][] = [
  ['tests', /\b(pytest|unittest|jest|vitest|mocha|rspec|phpunit)\b|\b(npm|yarn|pnpm|bun)\s+(run\s+)?test\b|\b(go|cargo|dotnet|mvn|gradle|\.\/gradlew|mix)\s+test\b/],
  ['commit', /\bgit\b[^|;&]*\bcommit\b/],
  ['push', /\bgit\b[^|;&]*\bpush\b/],
  ['deploy', /\brailway\s+(up|redeploy)\b|\bvercel\b[^|;&]*--prod|\b(fly|flyctl)\s+deploy\b|\bkubectl\s+(apply|rollout)\b|\bhelm\s+(upgrade|install)\b|\bterraform\s+apply\b|\bgcloud\b[^|;&]*\bdeploy\b|\b(serverless|sls|cdk|netlify)\s+deploy\b|\b(npm|yarn|pnpm)\s+run\s+deploy\b/],
]

const nueva = (id: string, descripcion: string, inicio: number, aproximado: boolean): Tarea => ({
  id, descripcion, inicio, aproximado, pasos: 0, ultima: 'arrancando', estado: 'corriendo',
  hitos: { tests: 'pendiente', commit: 'pendiente', push: 'pendiente', deploy: 'pendiente' },
})

export function minutos(ms: number): string {
  const m = Math.floor(ms / 60_000)
  return m < 1 ? `${Math.floor(ms / 1000)} s` : `${m} min`
}

// Barra con octavos de bloque, para que avance de a poco y no a saltos
const OCTAVOS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
export function barra(fraccion: number, ancho = ANCHO_BARRA): string {
  const ochos = Math.round(Math.max(0, Math.min(1, fraccion)) * ancho * 8)
  const llenos = Math.floor(ochos / 8)
  const resto = OCTAVOS[ochos % 8]!
  return '█'.repeat(llenos) + resto + '░'.repeat(ancho - llenos - (resto ? 1 : 0))
}

// Minutos sin usar ninguna herramienta (y sin ninguna en curso); 0 si está activo
export function quieto(t: Tarea, ahora: number): number {
  if ((t.enCurso ?? 0) > 0) return 0
  const ms = ahora - (t.ultimaActividad ?? t.inicio)
  return ms > ATASCADO_MS ? Math.floor(ms / 60_000) : 0
}

// Lo que el agente está haciendo, en pocas palabras
export function accion(e: { tool: string; [k: string]: unknown }): string {
  const texto = (v: unknown) => (typeof v === 'string' ? v : '')
  const archivo = (v: unknown) => texto(v).split('/').pop() ?? ''
  switch (e.tool) {
    case 'Bash': return texto(e.description) || (texto(e.command).split('\n')[0] ?? '').slice(0, 60)
    case 'Read': return `lee ${archivo(e.file_path)}`
    case 'Edit': return `edita ${archivo(e.file_path)}`
    case 'Write': return `escribe ${archivo(e.file_path)}`
    case 'Grep': return `busca "${texto(e.pattern).slice(0, 30)}"`
    case 'Glob': return `busca archivos ${texto(e.pattern)}`
    default: return e.tool
  }
}

// Ícono por agente: según de qué trata la tarea; si no encaja, uno fijo elegido por su id
// Palabras en español e inglés; el primero que encaja gana
const TEMAS: [RegExp, string][] = [
  [/deploy|despleg|release|railway/i, '🚀'],
  [/test|prueba|spec/i, '🧪'],
  [/clave|key|token|rotar|rotate|secret|credential/i, '🔑'],
  [/seguridad|security|auth|filtro|vulnerab/i, '🛡️'],
  [/migra|database|base de datos|schema|sql/i, '🗃️'],
  [/refactor|limpi|cleanup|simplif/i, '🧹'],
  [/perf|rendimiento|optimi|speed|cache/i, '⚡'],
  [/\bapi\b|endpoint|integra|webhook/i, '🔌'],
  [/panel|dashboard|resumen|report|metric/i, '📊'],
  [/backtest|evalua|medir|medici|analy|anális/i, '📈'],
  [/dato|data|precio|price|macro/i, '📡'],
  [/juez|jueces|judge|review|revisa/i, '⚖️'],
  [/telegram|slack|bot|mensaje|message|notif/i, '💬'],
  [/busca|search|explora|explore|investiga|research/i, '🔍'],
  [/arregl|fix|corrig|bug|error/i, '🩹'],
  [/\bdocs?\b|document|readme|\bnotas?\b|\bnotes?\b/i, '📝'],
  [/\bui\b|frontend|\bcss\b|diseñ|design|color|estilo|style/i, '🎨'],
  [/build|compil|bundle|docker/i, '📦'],
]
const ANIMALES = ['🦊', '🐙', '🦉', '🐝', '🦄', '🐢', '🐬', '🦋', '🐧', '🦜', '🐳', '🦔']

export function icono(t: { id: string; descripcion: string }): string {
  const tema = TEMAS.find(([re]) => re.test(t.descripcion))
  if (tema) return tema[1]
  let h = 0
  for (const c of t.id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return ANIMALES[h % ANIMALES.length]!
}

// Los hitos como recorrido: tests ✓ › commit ✓ › push ⟳ › deploy …
// Cada estado tiene su propio símbolo además del color (tema daltonizado)
const MARCA: Record<Hito, { signo: string; color: string }> = {
  pendiente: { signo: '…', color: 'gray' },
  corriendo: { signo: '⟳', color: '#FFA500' },
  ok: { signo: '✓', color: '#3CB371' },
  fallo: { signo: '✗', color: '#FF6F61' },
}
const ORDEN_HITOS: (keyof Tarea['hitos'])[] = ['tests', 'commit', 'push', 'deploy']

export function recorrido(t: Tarea): { nombre: string; signo: string; color: string }[] {
  return ORDEN_HITOS.map(k => ({ nombre: k, ...MARCA[t.hitos[k]] }))
}

const textoRecorrido = (t: Tarea) => recorrido(t).map(r => `${r.nombre} ${r.signo}`).join(' › ')

async function estimado($: EngineInterface): Promise<number> {
  const durs = ((await $.store.get('duraciones')) as number[] | undefined) ?? []
  if (!durs.length) return ESTIMADO_POR_DEFECTO
  const orden = [...durs].sort((a, b) => a - b)
  return orden[Math.floor(orden.length / 2)]!
}

// true si el agente se sigue. Uno que ya andaba cuando se cargó el mod se toma de la lista;
// los ids que la lista no nombra (copias internas del motor, como la compactación) se ignoran
async function asegurar($: EngineInterface, id: string): Promise<boolean> {
  if ((await read($, tareas))[id]) return true
  const info = (await $.agent.list()).find(a => a.id === id)
  if (!info) return false
  const ahora = await $.clock.now()
  await update($, tareas, t => (t[id] ? t : { ...t, [id]: nueva(id, info.description, ahora, true) }))
  return true
}

// Cierra las tareas cuyo agente ya terminó (o que la lista ya no nombra) sin que se oyera su final
async function conciliar($: EngineInterface): Promise<void> {
  const activas = Object.values(await read($, tareas)).filter(t => t.estado === 'corriendo')
  if (!activas.length) return
  const lista = await $.agent.list()
  const ahora = await $.clock.now()
  await update($, tareas, t => {
    const nuevo = { ...t }
    for (const x of activas) {
      const info = lista.find(a => a.id === x.id)
      if (!info) delete nuevo[x.id]
      else if (['completed', 'failed', 'killed'].includes(info.status))
        nuevo[x.id] = { ...x, fin: ahora, estado: info.status === 'completed' ? 'listo' : 'fallo' }
    }
    return nuevo
  })
}

async function estado($: EngineInterface): Promise<void> {
  // La línea se dibuja en la franja sobre el prompt (con color): aquí solo se limpia la de estado
  $.ui.status(undefined)
}

// Una línea compacta por agente: ⠋ 🚀 nombre ████░░ 80 % · 12/15 min · paso 18 · (el recorrido va aparte)
export function partes(t: Tarea, ahora: number, est: number): [string, string, string, string] {
  const dur = ahora - t.inicio
  const fr = Math.min(0.95, dur / est)
  const mini = barra(fr, 10)
  const tiempo = `${t.aproximado ? '≥' : ''}${Math.floor(dur / 60_000)}/${Math.round(est / 60_000)} min`
  const aviso = dur > est ? ' ⚠️' : ''
  const min = quieto(t, ahora)
  const parado = min ? ` · ⏸️ sin actividad hace ${min} min` : ''
  const giro = min ? '⏸' : GIRO[Math.floor(ahora / 1000) % GIRO.length]!
  return [`${giro} ${icono(t)} ${t.descripcion} `, mini, ` ${Math.round(fr * 100)} %${aviso}`,
    ` · ${tiempo} · paso ${t.pasos}${parado} · `]
}

export function linea(t: Tarea, ahora: number, est: number): string {
  return partes(t, ahora, est).join('') + textoRecorrido(t)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'progreso', description: 'Abre el panel de progreso de los agentes' })
    // Redibuja cada segundo (reloj e indicador animado); solo si hay algo andando
    let vueltas = 0
    $.clock.every(1000, () => {
      void (async () => {
        if (++vueltas % 15 === 0) await conciliar($)
        const t = await read($, tareas)
        if (Object.values(t).some(x => x.estado === 'corriendo')) {
          await update($, tick, n => n + 1)
          await estado($)
        }
      })()
    })
    return next(e)
  })

  on('command.run', { command: 'progreso' }, async $ => {
    await $.ui.open({ id: PANEL, title: TITULO })
    return { text: 'Panel de progreso abierto.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.agentId) {
      const id = r.agentId
      const ahora = await $.clock.now()
      await update($, tareas, t => ({ ...t, [id]: nueva(id, e.description, ahora, false) }))
      void $.ui.open({ id: PANEL, title: TITULO })
      await estado($)
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id === undefined) return next(e)
    if (!(await asegurar($, id))) return next(e)
    const comando = e.tool === 'Bash' && typeof (e as { command?: unknown }).command === 'string'
      ? (e as { command: string }).command : ''
    const hitos = HITOS.filter(([, re]) => re.test(comando)).map(([h]) => h)
    const antes = await $.clock.now()
    await update($, tareas, t => {
      const x = t[id]
      if (!x) return t
      const h = { ...x.hitos }
      for (const k of hitos) h[k] = 'corriendo'
      return { ...t, [id]: { ...x, pasos: x.pasos + 1, ultima: accion(e as { tool: string }), hitos: h,
                             ultimaActividad: antes, enCurso: (x.enCurso ?? 0) + 1 } }
    })
    const r = await next(e)
    const fallo = 'deny' in r && r.deny !== undefined || ('isError' in r && r.isError === true)
    const despues = await $.clock.now()
    await update($, tareas, t => {
      const x = t[id]
      if (!x) return t
      const h = { ...x.hitos }
      for (const k of hitos) h[k] = fallo ? 'fallo' : 'ok'
      return { ...t, [id]: { ...x, hitos: h, ultimaActividad: despues, enCurso: Math.max(0, (x.enCurso ?? 1) - 1) } }
    })
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      const x = (await read($, tareas))[id]
      if (x && x.estado === 'corriendo') {
        const ahora = await $.clock.now()
        const ok = e.reason === 'answer'
        await update($, tareas, t => ({ ...t, [id]: { ...x, fin: ahora, estado: (ok ? 'listo' : 'fallo') as Tarea['estado'] } }))
        // Solo aprende de duraciones medidas desde el arranque
        if (ok && !x.aproximado) {
          const durs = ((await $.store.get('duraciones')) as number[] | undefined) ?? []
          await $.store.set('duraciones', [...durs, ahora - x.inicio].slice(-10))
        }
        // Aviso de la Mac y toast, para cuando no se está mirando la terminal
        const texto = `${ok ? '✅' : '❌'} ${x.descripcion} ${ok ? 'terminó' : 'falló'} en ${minutos(ahora - x.inicio)}`
        $.ui.toast(texto)
        void $.ui.notify(texto, { title: 'Agente en segundo plano' }).catch(() => undefined)
        // Sonido propio del mod: un ding si terminó bien, un tono grave si falló
        void $.audio.play({ asset: ok ? 'sounds/listo.wav' : 'sounds/fallo.wav' }).catch(() => undefined)
        await estado($)
      }
    }
    return next(e)
  })

  // Franja sobre el prompt: una línea por agente andando, con la barra del color de su estado
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await read($, tick)
    const activas = Object.values(await read($, tareas)).filter(t => t.estado === 'corriendo')
    if (!activas.length || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const ahora = await $.clock.now()
    const est = await estimado($)
    return (
      <Box flexDirection="column">
        {activas.map(t => {
          // El texto en celeste; la barra y su % verde, ámbar o coral según el tiempo
          const [antes, mini, pct, despues] = partes(t, ahora, est)
          const color = colorBarra(ahora - t.inicio, est)
          return (
            <Box flexDirection="row">
              <Text color={TEXTO}>{antes}</Text>
              <Text color={color}>{mini}</Text>
              <Text color={color}>{pct}</Text>
              <Text color={TEXTO}>{despues}</Text>
              {recorrido(t).flatMap((r, i) => [
                <Text color={TEXTO}>{i ? ' › ' : ''}{r.nombre} </Text>,
                <Text color={r.color}>{r.signo}</Text>,
              ])}
            </Box>
          )
        })}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANEL }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    await read($, tick)
    const ahora = await $.clock.now()
    const est = await estimado($)
    const lista = Object.values(await read($, tareas))
      .filter(t => t.estado === 'corriendo' || ahora - (t.fin ?? ahora) < OCULTAR_TERMINADAS_MS)
      .sort((a, b) => b.inicio - a.inicio)

    if (!lista.length) return <Text dimColor>No hay agentes trabajando.</Text>

    return (
      <Box flexDirection="column">
        {lista.map(t => {
          const dur = (t.fin ?? ahora) - t.inicio
          const corriendo = t.estado === 'corriendo'
          // La barra avanza con el tiempo, no con el trabajo: se frena en 95 % hasta que termina
          const fr = corriendo ? Math.min(0.95, dur / est) : 1
          const tarde = corriendo && dur > est
          const min = corriendo ? quieto(t, ahora) : 0
          const estadoIcono = corriendo ? GIRO[Math.floor(ahora / 1000) % GIRO.length] : t.estado === 'listo' ? '✅' : '❌'
          return (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold>{estadoIcono} {icono(t)} {t.descripcion}</Text>
              <Text>
                ⏱️ {t.aproximado ? '≥' : ''}{minutos(dur)}
                {corriendo ? ` (estimado ~${minutos(est)})` : ' en total'}
              </Text>
              <Text color={tarde ? 'yellow' : corriendo ? 'cyan' : 'green'}>
                {barra(fr)} {corriendo ? `${Math.round(fr * 100)} %` : 'listo'}
              </Text>
              {tarde && <Text color="yellow">⚠️ Va más lento de lo estimado</Text>}
              {min > 0 && <Text color="yellow">⏸️ Sin actividad hace {min} min (¿atascado?)</Text>}
              <Text dimColor>📍 Paso {t.pasos} · {t.ultima}</Text>
              <Box flexDirection="row">
                {recorrido(t).flatMap((r, i) => [
                  <Text>{i ? ' › ' : ''}{r.nombre} </Text>,
                  <Text color={r.color}>{r.signo}</Text>,
                ])}
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
