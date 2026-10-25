// Ayudas en lenguaje sencillo para los indicadores de salud. Solo explican lo que ya calcula
// src/lib/health.ts (los números salen de sus constantes): no cambian fórmulas ni políticas.

import { formatNumber } from './format';
import { ACTIVITY_FACTORS, GOAL_POLICY, HEALTH_AGE_POLICY } from './health';

export type HealthHelp = { id: string; title: string; body: string; source: string };

const factors = Object.values(ACTIVITY_FACTORS);

export const HEALTH_HELP = {
  bmi: {
    id: 'bmi',
    title: '¿Qué es el IMC?',
    body:
      'El índice de masa corporal relaciona tu peso con tu estatura: peso en kilos dividido entre la estatura en metros al cuadrado. ' +
      `Las categorías (bajo peso, peso saludable, sobrepeso y obesidad) son las de adultos y TYRA las muestra desde los ${HEALTH_AGE_POLICY.bmiCategories.minAge} años. ` +
      'Es una referencia general: no distingue músculo de grasa ni sustituye una valoración profesional.',
    source: 'Organización Mundial de la Salud (OMS), clasificación del IMC en adultos.',
  },
  bmr: {
    id: 'bmr',
    title: '¿Qué es el gasto basal?',
    body:
      'Es una estimación de la energía que tu cuerpo usa en reposo para funciones básicas, como respirar y mantener la temperatura. ' +
      'Se calcula con tu sexo biológico, edad, estatura y peso.',
    source: 'Fórmula de Mifflin-St Jeor (Mifflin y col., American Journal of Clinical Nutrition, 1990).',
  },
  tdee: {
    id: 'tdee',
    title: '¿Qué es el gasto diario estimado?',
    body:
      `Es tu gasto basal multiplicado por un factor según tu nivel de actividad (de ${formatNumber(Math.min(...factors), 3)} si eres sedentario a ${formatNumber(Math.max(...factors), 3)} si eres muy activo). ` +
      'Describe cuánta energía usarías en un día típico; no es una recomendación.',
    source:
      'Factores de actividad de uso común; el concepto de nivel de actividad física se describe en FAO/OMS/UNU, «Human energy requirements» (2004).',
  },
  target: {
    id: 'target',
    title: '¿Cómo se calcula la meta?',
    body:
      'Parte de tu gasto diario estimado. ' +
      `Para bajar de peso resta ${formatNumber(Math.abs(GOAL_POLICY.lose.adjustmentKcal))} kcal y solo se ofrece con un IMC de 25 o más; ` +
      `para subir suma ${formatNumber(GOAL_POLICY.gain.adjustmentKcal)} kcal y solo con un IMC menor de 25; para mantener es igual a tu gasto diario. ` +
      'Si la meta quedara por debajo de tu gasto basal, no se calcula. Es una regla orientativa de TYRA, no un plan de alimentación.',
    source: 'Regla de TYRA basada en las estimaciones anteriores. Para un plan individual, consulta a un profesional de la salud.',
  },
  monthlyChange: {
    id: 'monthlyChange',
    title: '¿Qué significa la variación del mes?',
    body:
      'Es la diferencia entre la primera y la última medición del mes. Con una sola medición no se calcula. ' +
      'Depende de los días en que te pesaste, así que por sí sola no indica una tendencia. Las mediciones corregidas cuentan con su valor actual y las eliminadas no cuentan.',
    source: 'Cálculo de TYRA con tus mediciones vigentes.',
  },
} as const satisfies Record<string, HealthHelp>;
