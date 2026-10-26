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
  expect(linea(t, 12 * 60_000, 15 * 60_000)).toBe('⠋ 📊 Panel bajista ████████░░ 80 % · 12/15 min · paso 18 · tests ✓ › commit … › push … › deploy …')
  expect(linea(t, 20 * 60_000, 15 * 60_000)).toContain('95 % ⚠️')
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
  expect(linea(t, 4 * 60_000, 15 * 60_000)).toContain('⏸️ sin actividad hace 4 min')
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
  expect(linea({ ...base, estAjustado: 18 * 60_000 }, 14 * 60_000, doce)).toContain('14/12→18 min')
})
