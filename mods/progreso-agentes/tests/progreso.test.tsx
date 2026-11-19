import { expect, test } from 'claude-code/testing'

const PANEL = {
  plugin: 'progreso-agentes', component: 'Pane', requestId: 'progreso-agentes',
  props: { title: 'Progreso de agentes', isFocused: false, bodyColumns: 50, placement: 'dock',
           scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('muestra el agente, su paso y los hitos', async ($, on) => {
  on('command.register', () => ({ value: { command: 'progreso' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'opus', agentId: 'ag1' }))
  on('agent.list', () => ({ value: [{ id: 'ag1', description: 'Panel bajista', type: 'general-purpose', status: 'running' }] }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))
  on('clock.now', () => ({ value: 1_000_000 }))
  on('clock.every', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'x', description: 'Panel bajista' } as Parameters<typeof $.agent.spawn>[0])
  await $.tool.call({ tool: 'Bash', command: '.venv/bin/pytest -q', description: 'corre los tests', agentId: 'ag1' })

  const ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Panel bajista/ }))?.text).toContain('📊')
  expect((await ui.find({ type: 'Text', text: /Paso 1/ }))?.text).toContain('corre los tests')
  expect((await ui.find({ type: 'Text', text: /^tests $/ }))?.text).toBe('tests ')
  expect((await ui.findAll({ type: 'Text', text: /^[✓…]$/ })).map(x => x.text)).toEqual(['✓', '…', '…', '…'])
  await ui.unmount()
})

import { linea } from '../hooks/register'

test('la línea de estado lleva barra, tiempo, paso e hitos', () => {
  const t = {
    id: 'a', descripcion: 'Panel bajista', inicio: 0, aproximado: false, pasos: 18, ultima: '', ultimaActividad: 11 * 60_000,
    estado: 'corriendo' as const,
    hitos: { tests: 'ok' as const, commit: 'pendiente' as const, push: 'pendiente' as const, deploy: 'pendiente' as const },
  }
  const ref = { ms: 15 * 60_000, pasos: 22 }
  expect(linea(t, 12 * 60_000, ref)).toBe('⠋ 📊 Panel bajista ████████▏░ 82 % · 12/~15 min · paso 18/~22 · tests ✓ › commit … › push … › deploy …')
  // La barra sigue a los pasos, no al reloj: pasado el tiempo solo aparece el ⚠️
  expect(linea(t, 20 * 60_000, ref)).toContain('82 % ⚠️')
  expect(linea({ ...t, pasos: 40 }, 12 * 60_000, ref)).toContain('95 %')
})

import { avance, indeterminada } from '../hooks/register'

test('sin historial del tipo la barra va y viene, sin % ni pasos de referencia', () => {
  const t = {
    id: 'a', descripcion: 'Panel bajista', inicio: 0, aproximado: false, pasos: 5, ultima: '', ultimaActividad: 60_000,
    estado: 'corriendo' as const, tipo: 'infra-context',
    hitos: { tests: 'pendiente' as const, commit: 'pendiente' as const, push: 'pendiente' as const, deploy: 'pendiente' as const },
  }
  expect(avance(t, { ms: 12 * 60_000 })).toBeUndefined()
  const l = linea(t, 2 * 60_000, { ms: 12 * 60_000 })
  expect(l).not.toContain('%')
  expect(l).toContain('paso 5 ·')
  expect(indeterminada(0, 10)).toBe('███░░░░░░░')
  expect(indeterminada(3000, 10)).toBe('░░░███░░░░')
  expect(indeterminada(10_000, 10)).toBe('░░░░███░░░')
})

test('aprende pasos y tiempo por tipo de agente y los usa para el siguiente', async ($, on) => {
  const store = new Map<string, unknown>()
  let ahora = 0
  on('command.register', () => ({ value: { command: 'progreso' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: { isSent: true as const, channel: 'terminal_bell' as const } }))
  on('audio.play', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let n = 0
  on('agent.spawn', () => ({ model: 'opus', agentId: `ag${++n}` }))
  on('agent.list', () => ({ value: [] }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))
  on('clock.now', () => ({ value: ahora }))
  on('clock.every', () => ({ value: undefined }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => { store.set(e.key, e.value); return { value: undefined } })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'x', description: 'Memoria', subagentType: 'infra-context' } as Parameters<typeof $.agent.spawn>[0])
  for (let i = 0; i < 10; i++) await $.tool.call({ tool: 'Read', file_path: '/a', agentId: 'ag1' } as Parameters<typeof $.tool.call>[0])
  ahora = 2 * 60_000
  await $.turn.complete({ agentId: 'ag1', reason: 'answer' } as Parameters<typeof $.turn.complete>[0])
  expect(store.get('tipo:infra-context')).toEqual([{ ms: 2 * 60_000, pasos: 10 }])

  await $.agent.spawn({ prompt: 'x', description: 'Memoria 2', subagentType: 'infra-context' } as Parameters<typeof $.agent.spawn>[0])
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Read', file_path: '/a', agentId: 'ag2' } as Parameters<typeof $.tool.call>[0])
  ahora = 3 * 60_000
  const ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /50 %/ }))?.text).toContain('█')
  expect((await ui.find({ type: 'Text', text: /Paso 5 de ~10/ }))).toBeTruthy()
  await ui.unmount()
})

import { colorBarra } from '../hooks/register'

test('la barra es verde a tiempo, ámbar cerca del estimado y coral pasada', () => {
  expect(colorBarra(5, 10)).toBe('#2E8B57')
  expect(colorBarra(8, 10)).toBe('#FFA500')
  expect(colorBarra(12, 10)).toBe('#FF6F61')
})

import { barra, quieto } from '../hooks/register'

test('la barra avanza por octavos de bloque', () => {
  expect(barra(0.5, 10)).toBe('█████░░░░░')
  expect(barra(0.55, 10)).toBe('█████▌░░░░')
  expect(barra(1, 4)).toBe('████')
})

test('marca sin actividad tras 3 min quieto, salvo con una herramienta en curso', () => {
  const t = {
    id: 'a', descripcion: 'x', inicio: 0, aproximado: false, pasos: 1, ultima: '', estado: 'corriendo' as const,
    hitos: { tests: 'pendiente' as const, commit: 'pendiente' as const, push: 'pendiente' as const, deploy: 'pendiente' as const },
    ultimaActividad: 0,
  }
  expect(quieto(t, 2 * 60_000)).toBe(0)
  expect(quieto(t, 4 * 60_000)).toBe(4)
  expect(quieto({ ...t, enCurso: 1 }, 10 * 60_000)).toBe(0)
  expect(linea(t, 4 * 60_000, { ms: 15 * 60_000 })).toContain('⏸️ sin actividad hace 4 min')
})

import { icono } from '../hooks/register'

test('cada agente lleva un ícono según su tema, o un animal fijo por su id', () => {
  expect(icono({ id: 'x', descripcion: 'Rotar clave Alpaca en Railway' })).toBe('🚀')
  expect(icono({ id: 'x', descripcion: 'Mejorar instrucción del juez A' })).toBe('⚖️')
  expect(icono({ id: 'x', descripcion: 'Build docker image' })).toBe('📦')
  expect(icono({ id: 'x', descripcion: 'Ajustar capital inicial' })).not.toBe('🔌')
  const a = icono({ id: 'abc', descripcion: 'Algo sin tema' })
  expect(a).toBe(icono({ id: 'abc', descripcion: 'Algo sin tema' }))
})

test('reconoce tests y despliegues de otras herramientas', async ($, on) => {
  on('command.register', () => ({ value: { command: 'progreso' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'opus', agentId: 'ag2' }))
  on('agent.list', () => ({ value: [{ id: 'ag2', description: 'Deploy API', type: 'general-purpose', status: 'running' }] }))
  on('tool.call', () => ({ result: {} }))
  on('clock.now', () => ({ value: 1_000_000 }))
  on('clock.every', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'x', description: 'Deploy API' } as Parameters<typeof $.agent.spawn>[0])
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'ag2' })
  await $.tool.call({ tool: 'Bash', command: 'kubectl apply -f k8s/', agentId: 'ag2' })

  const ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Text', text: /^[✓…]$/ })).map(x => x.text)).toEqual(['✓', '…', '…', '✓'])
  await ui.unmount()
})

import { clasificar } from '../hooks/register'

test('clasifica el encargo: corto, normal o largo', () => {
  expect(clasificar('Revisa si el archivo X existe y dime qué contiene.')).toBe('corta')
  expect(clasificar('Cambia el texto, corre los tests y despliega. ' + 'detalle '.repeat(300))).toBe('normal')
  expect(clasificar('Haz un audit del juez y una prueba real. ' + 'detalle '.repeat(300))).toBe('larga')
  expect(clasificar('detalle '.repeat(700))).toBe('larga')
})

import { ajustar } from '../hooks/register'

test('amplía el estimado según los hitos que faltan, y lo muestra', () => {
  const base = {
    id: 'a', descripcion: 'x', inicio: 0, aproximado: false, pasos: 1, ultima: '', estado: 'corriendo' as const,
    ultimaActividad: 13 * 60_000,
    hitos: { tests: 'ok' as const, commit: 'pendiente' as const, push: 'pendiente' as const, deploy: 'pendiente' as const },
  }
  const doce = 12 * 60_000
  expect(ajustar(base, doce)).toBe(18 * 60_000)
  expect(ajustar({ ...base, hitos: { ...base.hitos, commit: 'ok', push: 'ok' } }, doce)).toBe(15 * 60_000)
  expect(ajustar({ ...base, hitos: { ...base.hitos, deploy: 'corriendo' } }, doce)).toBe(15 * 60_000)
  expect(ajustar({ ...base, hitos: { ...base.hitos, deploy: 'ok' } }, doce)).toBe(doce)
  expect(linea({ ...base, estAjustado: 18 * 60_000 }, 14 * 60_000, { ms: doce })).toContain('14/~12→18 min')
})
