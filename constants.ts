import { VoiceOption } from './types';

export const VOICES: VoiceOption[] = [
  // Original Voices
  { id: 'mx-male-1', name: 'Carlos (Profesional)', gender: 'male', geminiName: 'Fenrir' },
  { id: 'mx-female-1', name: 'Sofia (Entusiasta)', gender: 'female', geminiName: 'Kore' },
  { id: 'mx-male-2', name: 'Mateo (Cálido)', gender: 'male', geminiName: 'Puck' },
  { id: 'mx-female-2', name: 'Valentina (Dinámica)', gender: 'female', geminiName: 'Aoede' },
  { id: 'mx-male-3', name: 'Raúl (Muy Optimista)', gender: 'male', geminiName: 'Zephyr' },

  // New Enthusiastic Male Voices
  { id: 'mx-male-4', name: 'Javier (¡Euforia Total!)', gender: 'male', geminiName: 'Fenrir' },
  { id: 'mx-male-5', name: 'Luis (Promo Acción)', gender: 'male', geminiName: 'Zephyr' },
  { id: 'mx-male-6', name: 'Miguel (Vendedor Nato)', gender: 'male', geminiName: 'Puck' },
  { id: 'mx-male-7', name: 'Fernando (Impacto Radio)', gender: 'male', geminiName: 'Charon' },
  { id: 'mx-male-8', name: 'Roberto (Animador)', gender: 'male', geminiName: 'Zephyr' },

  // New Enthusiastic Female Voices
  { id: 'mx-female-3', name: 'Lucía (Súper Alegre)', gender: 'female', geminiName: 'Kore' },
  { id: 'mx-female-4', name: 'Mariana (Noticia Bomba)', gender: 'female', geminiName: 'Aoede' },
  { id: 'mx-female-5', name: 'Gabriela (Fiesta Total)', gender: 'female', geminiName: 'Kore' },
  { id: 'mx-female-6', name: 'Fernanda (Influencer)', gender: 'female', geminiName: 'Aoede' },
  { id: 'mx-female-7', name: 'Camila (Voz Activa)', gender: 'female', geminiName: 'Kore' },
];

export const INTENSITIES = [
  { id: 'low', name: 'Suave (Fondo)', volume: 0.1 },
  { id: 'medium', name: 'Normal (Equilibrado)', volume: 0.25 },
  { id: 'high', name: 'Alto (Energético)', volume: 0.5 },
];

export const INITIAL_SCRIPT_PLACEHOLDER = "Sube una imagen para generar un guion automáticamente...";