-- La descripción de la tarea (tasks.description, que ya existía) pasa a editarse desde la
-- pantalla, reemplazando el viejo campo "Subtareas" (custom_fields.subtasks, sin datos).
-- Como el resto del contenido, guarda su traducción a PT-BR.
alter table public.tasks add column description_pt text;
