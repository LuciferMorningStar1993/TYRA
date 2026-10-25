# TYRA
TYRA | SuperApp de gestión personal que integra salud, fitness, nutrición y finanzas en una sola plataforma. Diseñada para optimizar hábitos, monitorear el progreso y facilitar decisiones inteligentes para una vida más equilibrada.

## Arranque rápido

```bash
npm install
cp .env.example .env.local   # pon la URL y la publishable key de Supabase
npx expo start               # escanea el QR con Expo Go
```

- `npm test` · `npm run typecheck` · `npm run lint`
- Migraciones: `supabase db push --linked`
- Stack: Expo SDK 58 + Expo Router + TypeScript + Supabase. Detalles en `CLAUDE.md`.
