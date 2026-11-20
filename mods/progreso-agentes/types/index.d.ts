export type Clase = 'corta' | 'normal' | 'larga'

export type Hito = 'pendiente' | 'corriendo' | 'ok' | 'fallo'

export type Tarea = {
  id: string
  descripcion: string
  inicio: number
  fin?: number
  // true cuando el mod vio al agente ya andando (no su arranque): el tiempo cuenta desde ahí
  aproximado: boolean
  pasos: number
  // Tamaño esperado de la tarea, deducido del encargo al lanzarla
  clase?: Clase
  // Tipo de agente (general-purpose, Explore, infra-code…): la barra aprende de los de su tipo
  tipo?: string
  // Estimado ampliado una sola vez al llegar al 85 %, según los hitos que faltan
  estAjustado?: number
  // Estimado de la tarea al lanzarla: pasos del modelo corregidos por su sesgo, y ms = pasos × ritmo aprendido;
  // sin respuesta del modelo, ausentes
  estPasos?: number
  estMs?: number
  // Pasos tal como los dijo el modelo (sin corregir) y el factor de sesgo aplicado
  estPasosModelo?: number
  sesgo?: number
  // Pasos de referencia ampliados una sola vez al llegar al 90 %
  pasosAjustados?: number
  // Comienzo del encargo, para calibrar estimados futuros con esta tarea
  extracto?: string
  // Última vez que el agente usó una herramienta, y cuántas llamadas tiene en curso
  ultimaActividad?: number
  enCurso?: number
  ultima: string
  estado: 'corriendo' | 'listo' | 'fallo'
  hitos: { tests: Hito; commit: Hito; push: Hito; deploy: Hito }
}

// Lo que se aprende de un agente del mismo tipo que terminó bien
export type Corrida = { ms: number; pasos: number }

// Una tarea terminada bien, con lo real y lo estimado: calibra al modelo y da la referencia general
export type Registro = {
  descripcion: string
  tipo?: string
  extracto: string
  pasos: number
  ms: number
  // estPasos y estMs: lo usado (corregido); estPasosModelo: lo que dijo el modelo. Sin estPasosModelo
  // (registros de 0.3.0), estPasos es el crudo
  estPasos?: number
  estMs?: number
  estPasosModelo?: number
}

// De dónde sale la referencia: el modelo, el historial de su tipo, el historial general, o nada
export type Fuente = 'modelo' | 'tipo' | 'general' | 'ninguna'

// Contra qué se mide un agente: tiempo (siempre) y pasos (solo con alguna referencia)
export type Referencia = { ms: number; pasos?: number; fuente?: Fuente }

declare module 'claude-code' {
  interface PluginState {
    'progreso-agentes': { tareas: Record<string, Tarea>; tick: number }
  }
}
