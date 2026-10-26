# Prácticas de datos (formulario de la tienda)

Respuestas exactas para la sección "Data usage" de la pestaña de privacidad del Developer
Dashboard (FR-045). Deben coincidir con [`privacy-policy.md`](privacy-policy.md).

## ¿Qué datos de usuario recoge o recogerá el elemento?

Ninguna categoría marcada:

| Categoría | Respuesta |
|---|---|
| Personally identifiable information | No |
| Health information | No |
| Financial and payment information | No |
| Authentication information | No |
| Personal communications | No |
| Location | No |
| Web history | No |
| User activity | No |
| Website content | No |

**Por qué "Authentication information" y "Website content" van en "No"** aunque Nahual muestre
headers y bodies: esos datos solo se muestran al propio usuario dentro de su navegador, viven en
memoria del panel y nunca salen de su equipo ni llegan al desarrollador de la extensión. La
política de la tienda define "recoger" como transmitir fuera del dispositivo del usuario.

## Certificaciones

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single
  purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

## URL de la política de privacidad

`https://github.com/<owner>/nahual/blob/main/docs/store/privacy-policy.md` (sustituir `<owner>`
al crear el repositorio público).
