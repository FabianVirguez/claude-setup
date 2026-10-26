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
  // Última vez que el agente usó una herramienta, y cuántas llamadas tiene en curso
  ultimaActividad?: number
  enCurso?: number
  ultima: string
  estado: 'corriendo' | 'listo' | 'fallo'
  hitos: { tests: Hito; commit: Hito; push: Hito; deploy: Hito }
}

declare module 'claude-code' {
  interface PluginState {
    'progreso-agentes': { tareas: Record<string, Tarea>; tick: number }
  }
}
