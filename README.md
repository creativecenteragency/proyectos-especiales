# Proyectos Especiales

Plataforma de planificación, ejecución y rendición de proyectos especiales con presupuesto asignado.
Frontend en React + Vite, datos en Supabase (Postgres + Auth con RLS). Proyecto separado del CRM Creative.

## Modelo

- **Cliente** (ej. Oxford) → **Proyecto especial** (ej. "Oxford Argentina 2026-2027") con un presupuesto
  anual total y N **ejes** (Contenido, UGC, Google Ads, Meta Ads, SEO...) que se reparten ese presupuesto.
- Cada proyecto se ejecuta como **Listas → Grupos → Tareas**. Cualquier tarea puede tener un eje asignado,
  un monto **proyectado** y un monto **ejecutado** — ambos se descuentan del presupuesto del eje.
- Roles por proyecto: **Owner/Administrador** (control total, es master a nivel cuenta), **Equipo** (crea y
  ejecuta, no toca presupuesto aprobado) y **Auditor/Cliente** (lectura + comentarios).
- Campos libres tipo Notion: cada tarea tiene `custom_fields` (jsonb) además de `tags` — hoy se usan para
  subtareas y entregable, pero se puede extender sin migrar el schema.

## Estado actual

Prototipo navegable, sembrado con los datos reales del plan de Oxford (1 cliente, 1 proyecto, 5 ejes,
1 lista con 3 grupos —Agosto/Septiembre/Octubre— y 7 tareas). Pendiente de definir con más uso real:
cuánta libertad de "tablas libres" hace falta más allá de los campos custom actuales.

## Puesta en marcha

### 1. Supabase

Ya está creado: proyecto `proyectos-especiales` en la organización Agencia Creative Center (mismo Supabase
que el CRM), región São Paulo. El schema vive en [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).

Para levantar el frontend local:

```bash
cp .env.example .env.local
```

Completar `.env.local` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`
(Project Settings → API Keys → Publishable key, en el dashboard de Supabase).

### 2. Primer usuario (Owner)

Ya se invitó a mkt.creativecenter@gmail.com como usuario y se lo marcó `is_master = true` en `profiles`.
Revisá el mail de invitación de Supabase para elegir tu contraseña.

### 3. Desarrollo local

```bash
npm install
npm run dev       # servidor de desarrollo
npm run build     # build de producción + type-check
```

## Próximos pasos sugeridos

- Ver el prototipo funcionando y decidir cuánta libertad de tablas hace falta (campos custom vs. tablas
  libres tipo Notion en blanco).
- Sumar comentarios de tareas (tabla `comments` ya existe en el schema, falta la UI).
- Deploy a GitHub Pages (mismo patrón que el CRM, ver su `.github/workflows/deploy.yml`).
