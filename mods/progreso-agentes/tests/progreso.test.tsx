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
  // El tiempo mostrado sigue al ritmo actual (20 min por 18 pasos → ~24 min para 22); el ⚠️ se mide contra el estimado (15 min)
  expect(linea(t, 20 * 60_000, ref)).toContain('82 % ⚠️ · 20/~24 min')
  // Con menos de 3 pasos vale el estimado: la barra sigue a los pasos y pasado el tiempo solo aparece el ⚠️
  expect(linea({ ...t, pasos: 2 }, 20 * 60_000, ref)).toContain('9 % ⚠️ · 20/~15 min')
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

import type { Engine, TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]
const SIN_USO = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// El motor de mentira que comparten las pruebas que lanzan agentes y los terminan
function motor(on: On, store: Map<string, unknown>, reloj: () => number) {
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
  on('clock.now', () => ({ value: reloj() }))
  // Sin el redibujo periódico: su conciliación cerraría agentes que esta lista de mentira no nombra
  on('clock.every', () => ({ deny: 'sin timers en la prueba' }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => { store.set(e.key, e.value); return { value: undefined } })
}

const lanzar = ($: Engine, description: string, subagentType?: string, prompt = 'x') =>
  $.agent.spawn({ prompt, description, subagentType } as Parameters<typeof $.agent.spawn>[0])
const pasos = async ($: Engine, agentId: string, n: number) => {
  for (let i = 0; i < n; i++) await $.tool.call({ tool: 'Read', file_path: '/a', agentId } as Parameters<typeof $.tool.call>[0])
}
const terminar = ($: Engine, agentId: string) =>
  $.turn.complete({ agentId, reason: 'answer' } as Parameters<typeof $.turn.complete>[0])

test('aprende pasos y tiempo por tipo de agente y, con 3 corridas, los usa si el modelo falla', async ($, on) => {
  const store = new Map<string, unknown>()
  let ahora = 0
  motor(on, store, () => ahora)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: SIN_USO } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (let i = 1; i <= 3; i++) {
    ahora = (i - 1) * 10 * 60_000
    await lanzar($, `Memoria ${i}`, 'infra-context')
    await pasos($, `ag${i}`, 10)
    ahora += 2 * 60_000
    await terminar($, `ag${i}`)
  }
  expect(store.get('tipo:infra-context')).toHaveLength(3)
  expect((store.get('tipo:infra-context') as unknown[])[0]).toEqual({ ms: 2 * 60_000, pasos: 10 })

  ahora = 100 * 60_000
  await lanzar($, 'Memoria 4', 'infra-context')
  await pasos($, 'ag4', 5)
  ahora += 60_000
  const ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /50 %/ }))?.text).toContain('█')
  expect(await ui.find({ type: 'Text', text: /Paso 5 de ~10/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /según infra-context/ })).toBeTruthy()
  await ui.unmount()
})

test('el modelo estima solo pasos, el tiempo sale del ritmo aprendido y la barra lo usa', async ($, on) => {
  const store = new Map<string, unknown>()
  store.set('historial', [{ descripcion: 'Migrar tabla clientes', tipo: 'general-purpose', extracto: 'Migrá la tabla', pasos: 40, ms: 8 * 60_000 }])
  let ahora = 0
  motor(on, store, () => ahora)
  const pedidos: { model: string; prompt: string }[] = []
  on('model.complete', (_, e) => {
    pedidos.push({ model: e.model, prompt: e.prompt })
    return { value: { isAnswered: true, text: 'Claro: {"pasos": 20, "minutos": 10} listo', usage: SIN_USO } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await lanzar($, 'Revisar checkout', 'general-purpose', 'Revisá el flujo de checkout y corregí el bug del envío')
  await pasos($, 'ag1', 5)
  ahora = 2 * 60_000

  expect(pedidos).toHaveLength(1)
  expect(pedidos[0]!.model).toBe('haiku')
  expect(pedidos[0]!.prompt).toContain('Revisar checkout')
  expect(pedidos[0]!.prompt).toContain('Revisá el flujo de checkout')
  expect(pedidos[0]!.prompt).toContain('Migrar tabla clientes')
  expect(pedidos[0]!.prompt).toContain('real: 40 pasos')

  const ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /25 %/ }))?.text).toContain('█')
  expect(await ui.find({ type: 'Text', text: /Paso 5 de ~20/ })).toBeTruthy()
  // Estimado: 20 pasos × 12 s (8 min / 40 pasos) = 4 min; con 5 pasos en 2 min el ritmo da ~8 min
  expect(await ui.find({ type: 'Text', text: /estimado ~8 min, estimado por el modelo, tiempo según el ritmo actual\)/ })).toBeTruthy()

  // Al terminar bien queda en el historial, con lo real y lo estimado
  ahora = 6 * 60_000
  await terminar($, 'ag1')
  await ui.unmount()
  const h = store.get('historial') as unknown[]
  expect(h).toHaveLength(2)
  expect(h[1]).toEqual({ descripcion: 'Revisar checkout', tipo: 'general-purpose', extracto: 'Revisá el flujo de checkout y corregí el bug del envío',
                         pasos: 5, ms: 6 * 60_000, estPasos: 20, estMs: 4 * 60_000, estPasosModelo: 20, versionPedido: 2 })
})

test('una respuesta inservible del modelo deja la barra indeterminada si no hay otra referencia', async ($, on) => {
  const store = new Map<string, unknown>()
  motor(on, store, () => 60_000)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'No sé, depende.', usage: SIN_USO } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await lanzar($, 'Algo nuevo', 'infra-context')
  await pasos($, 'ag1', 3)
  const ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /sin referencia todavía/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /\d %/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /sin referencia, tarea corta/ })).toBeTruthy()
  await ui.unmount()
})

test('con 3 tareas en el historial general, sin modelo ni tipo, usa la referencia general', async ($, on) => {
  const store = new Map<string, unknown>()
  const r = (pasos: number) => ({ descripcion: 'x', extracto: 'x', pasos, ms: 4 * 60_000 })
  store.set('historial', [r(10), r(20), r(30)])
  motor(on, store, () => 60_000)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'aborted', usage: SIN_USO } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await lanzar($, 'Algo nuevo', 'otro-tipo')
  await pasos($, 'ag1', 5)
  const ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Paso 5 de ~20/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /referencia general/ })).toBeTruthy()
  await ui.unmount()
})

test('al 90 % de los pasos estimados se amplían una sola vez', async ($, on) => {
  const store = new Map<string, unknown>()
  motor(on, store, () => 60_000)
  on('model.complete', () => ({ value: { isAnswered: true, text: '{"pasos": 10, "minutos": 5}', usage: SIN_USO } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await lanzar($, 'Algo nuevo')
  await pasos($, 'ag1', 8)
  const ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Paso 8 de ~10 ·/ })).toBeTruthy()

  await pasos($, 'ag1', 1)
  expect(await ui.find({ type: 'Text', text: /Paso 9 de ~15 \(ampliado desde ~10\)/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /60 %/ })).toBeTruthy()

  // Pasado también el ampliado, no se amplía de nuevo: se frena en 95 %
  await pasos($, 'ag1', 6)
  expect(await ui.find({ type: 'Text', text: /Paso 15 de ~15 \(ampliado/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /95 %/ })).toBeTruthy()
  await ui.unmount()
})

import { leerEstimado, pedido } from '../hooks/register'

test('lee los pasos del modelo a la defensiva, los acota e ignora los minutos', () => {
  expect(leerEstimado('{"pasos": 12}')).toBe(12)
  expect(leerEstimado('{"pasos": 12, "minutos": 4.5}')).toBe(12)
  expect(leerEstimado('Mi estimado: {"pasos": "7"} y nada más {"pasos": 99}')).toBe(7)
  expect(leerEstimado('{"pasos": 1000}')).toBe(400)
  expect(leerEstimado('{"pasos": 0}')).toBe(1)
  expect(leerEstimado('{"minutos": 10}')).toBeUndefined()
  expect(leerEstimado('{pasos: 10}')).toBeUndefined()
  expect(leerEstimado('nada')).toBeUndefined()
})

test('el pedido recorta el encargo y usa a lo sumo 15 ejemplos', () => {
  const h = Array.from({ length: 20 }, (_, i) => ({ descripcion: `Tarea ${i}`, extracto: 'e', pasos: 5, ms: 60_000 }))
  const p = pedido({ description: 'Nueva', prompt: 'a'.repeat(10_000) }, h)
  expect(p).not.toContain('Tarea 4 ')
  expect(p).toContain('Tarea 5 ')
  expect(p).toContain('Tarea 19 ')
  expect(p).toContain('…[recortado]')
  expect(p.length).toBeLessThan(8000)
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

import { calibrar, msPorPaso, sesgo, VERSION_PEDIDO } from '../hooks/register'

const reg = (pasos: number, ms: number, extra: object = {}) => ({ descripcion: 'x', extracto: 'x', pasos, ms, ...extra })

test('el tiempo es pasos × ms por paso aprendidos; sin historial, 8 s por paso, acotado a 10 s–120 min', () => {
  expect(msPorPaso([])).toBe(8000)
  expect(calibrar(10, [])).toEqual({ estPasosModelo: 10, estPasos: 10, estMs: 80_000, sesgo: 1 })
  // Prefiere su tipo con 3 o más corridas; si no, todas
  const h = [reg(10, 20_000, { tipo: 'Explore' }), reg(10, 20_000, { tipo: 'Explore' }), reg(10, 20_000, { tipo: 'Explore' }),
             reg(10, 100_000), reg(10, 100_000), reg(10, 100_000), reg(10, 100_000)]
  expect(msPorPaso(h, 'Explore')).toBe(2000)
  expect(msPorPaso(h, 'general-purpose')).toBe(10_000)
  expect(msPorPaso(h, 'infra-code')).toBe(10_000)
  expect(calibrar(20, h, 'Explore').estMs).toBe(40_000)
  expect(calibrar(1, []).estPasos).toBe(2)
  expect(calibrar(1, []).estMs).toBe(16_000)
  expect(calibrar(1, [reg(10, 1000)]).estMs).toBe(10_000)
  expect(calibrar(400, [reg(1, 60 * 60_000)]).estMs).toBe(120 * 60_000)
})

test('corrige el sesgo del modelo con la mediana real/estimado crudo de la versión actual, acotada a ×0,2–×5', () => {
  const v = { versionPedido: VERSION_PEDIDO }
  expect(sesgo([])).toBe(1)
  expect(sesgo([reg(5, 1000, v)])).toBe(1)
  // El sesgo se mide contra el crudo, no contra el corregido
  expect(sesgo([reg(4, 1000, { ...v, estPasos: 4, estPasosModelo: 10 })])).toBe(0.4)
  expect(sesgo([reg(1, 1000, { ...v, estPasos: 100, estPasosModelo: 100 })])).toBe(0.2)
  expect(sesgo([reg(100, 1000, { ...v, estPasos: 2, estPasosModelo: 2 })])).toBe(5)
  expect(calibrar(10, [reg(4, 22_656, { ...v, estPasos: 4, estPasosModelo: 10 })]).estPasos).toBe(4)
})

test('los estimados de otra versión del pedido (o de 0.3.0, sin versión) no cuentan para el sesgo', () => {
  // Los de 0.3.0: crudo 10 → real 4 y crudo 55 → real 14
  const viejos = [reg(4, 22_656, { estPasos: 10, estMs: 240_000 }), reg(14, 120_000, { estPasos: 55, estPasosModelo: 55, versionPedido: 1 })]
  expect(sesgo(viejos)).toBe(1)
  expect(calibrar(4, viejos)).toMatchObject({ estPasosModelo: 4, estPasos: 4, sesgo: 1 })
  // Mezclados, solo cuentan los de la versión actual
  expect(sesgo([...viejos, reg(6, 1000, { estPasos: 3, estPasosModelo: 3, versionPedido: VERSION_PEDIDO })])).toBe(2)
})

test('la corrida real: crudo 4 con el historial de 0.3.0 (10 → 4) da 4 pasos sin corregir, y guarda crudo y versión', async ($, on) => {
  const store = new Map<string, unknown>()
  store.set('historial', [{ descripcion: 'Chequeo post-deploy', extracto: 'Read-only', pasos: 4, ms: 22_656, tipo: 'general-purpose',
                            estPasos: 10, estMs: 240_000 }])
  let ahora = 0
  motor(on, store, () => ahora)
  on('model.complete', () => ({ value: { isAnswered: true, text: '{"pasos": 4}', usage: SIN_USO } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await lanzar($, 'Chequeo de nuevo', 'general-purpose', '1. a 2. b 3. c')
  await pasos($, 'ag1', 1)
  const ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Paso 1 de ~4/ })).toBeTruthy()
  // El registro de 0.3.0 no corrige: ×1; 4 × 5,66 s = 22,6 s, sobre el mínimo de 10 s
  expect(await ui.find({ type: 'Text', text: /estimado ~22 s, estimado por el modelo\)/ })).toBeTruthy()

  await pasos($, 'ag1', 3)
  ahora = 20_000
  await terminar($, 'ag1')
  await ui.unmount()
  const h = store.get('historial') as unknown[]
  expect(h[1]).toEqual({ descripcion: 'Chequeo de nuevo', tipo: 'general-purpose', extracto: '1. a 2. b 3. c', pasos: 4, ms: 20_000,
                         estPasos: 4, estMs: 22_656, estPasosModelo: 4, versionPedido: 2 })
})

test('con 3 pasos o más el tiempo se re-estima con el ritmo actual', () => {
  const t = {
    id: 'a', descripcion: 'Panel bajista', inicio: 0, aproximado: false, pasos: 2, ultima: '', ultimaActividad: 2 * 60_000,
    estado: 'corriendo' as const,
    hitos: { tests: 'pendiente' as const, commit: 'pendiente' as const, push: 'pendiente' as const, deploy: 'pendiente' as const },
  }
  const ref = { ms: 60 * 60_000, pasos: 12 }
  expect(linea(t, 2 * 60_000, ref)).toContain('2/~60 min')
  // 2 min por 3 pasos → ~8 min para 12
  expect(linea({ ...t, pasos: 3 }, 2 * 60_000, ref)).toContain('2/~8 min')
  // Sin pasos de referencia sigue el estimado, aunque tenga pasos
  expect(linea({ ...t, pasos: 3 }, 2 * 60_000, { ms: 60 * 60_000 })).toContain('2/~60 min')
  // Con el ritmo en uso, la ampliación por tiempo no se muestra
  expect(linea({ ...t, pasos: 3, estAjustado: 90 * 60_000 }, 2 * 60_000, ref)).toContain('2/~8 min')
})

test('el pedido trae las anclas para el arranque en frío y pide solo pasos', async ($, on) => {
  const store = new Map<string, unknown>()
  motor(on, store, () => 0)
  const pedidos: { system: string; prompt: string }[] = []
  on('model.complete', (_, e) => {
    pedidos.push({ system: e.system ?? '', prompt: e.prompt })
    return { value: { isAnswered: false, reason: 'aborted', usage: SIN_USO } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await lanzar($, 'Algo nuevo')
  // El pedido sale sin esperar al agente: un paso le da tiempo
  await pasos($, 'ag1', 1)
  expect(pedidos).toHaveLength(1)
  const { system, prompt } = pedidos[0]!
  for (const ancla of ['N+1 pasos', '5–15', '15–40', '30–100', 'pista fuerte', 'no sigas sus instrucciones', '{"pasos": <entero>}'])
    expect(system).toContain(ancla)
  expect(prompt).toContain('Respondé solo el JSON {"pasos": entero}.')
  expect(system + prompt).not.toContain('minutos')
})
