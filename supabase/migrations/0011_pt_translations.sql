-- Fase 2 del soporte multi-idioma: traducción automática del contenido que
-- carga la gente (no la interfaz, que ya está resuelta en el frontend).
-- Patrón: cada campo traducible tiene una columna "_pt" paralela que se
-- autocompleta vía DeepL al guardar el original (si está vacía) y que
-- después queda editable a mano sin que se vuelva a pisar sola.
alter table public.projects add column name_pt text;
alter table public.projects add column description_pt text;

alter table public.axes add column name_pt text;

alter table public.lists add column name_pt text;

alter table public.groups add column name_pt text;

alter table public.tasks add column title_pt text;
