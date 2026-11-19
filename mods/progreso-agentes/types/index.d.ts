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
  // Última vez que el agente usó una herramienta, y cuántas llamadas tiene en curso
  ultimaActividad?: number
  enCurso?: number
  ultima: string
  estado: 'corriendo' | 'listo' | 'fallo'
  hitos: { tests: Hito; commit: Hito; push: Hito; deploy: Hito }
}

// Lo que se aprende de un agente del mismo tipo que terminó bien
export type Corrida = { ms: number; pasos: number }

// Contra qué se mide un agente: tiempo típico (siempre) y pasos típicos de su tipo (solo con historial)
export type Referencia = { ms: number; pasos?: number }

declare module 'claude-code' {
  interface PluginState {
    'progreso-agentes': { tareas: Record<string, Tarea>; tick: number }
  }
}
