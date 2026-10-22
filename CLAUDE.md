# Nahual — guía para el agente

Extensión de Chrome MV3 (`chrome.debugger` + CDP) para devs frontend. Desarrollo guiado por
especificaciones con GitHub Spec Kit.

- **Constitución:** `.specify/memory/constitution.md`. Prevalece sobre todo; léela antes de
  planear o implementar.
- **Entradas por feature:** `docs/speckit-inputs/0X-*.md`. Cada archivo trae los prompts de
  `/speckit-specify`, `/speckit-plan` y `/speckit-tasks`, y preguntas para `/speckit-clarify`.
  Carga solo el archivo de la feature en curso.
- **Orden:** 001 → 002 → 003; 004 y 005 tras 002 en cualquier orden; 006 al final.
- **Flujo:** specify → clarify → plan → tasks → analyze → implement. Un PR de especificación y
  otro de implementación por feature.
- Nunca agregues permisos del manifest ni dependencias sin justificarlos en `plan.md`.
