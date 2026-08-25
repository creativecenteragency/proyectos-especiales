-- El trigger de auditoria inserta en activity_log DESPUES de borrar una tarea (para
-- dejar registro de la baja), pero activity_log.task_id tenia una foreign key que
-- exige que esa tarea todavia exista — imposible para una fila que registra un
-- borrado. Eso hacia fallar (y por lo tanto revertir) CUALQUIER borrado de tarea,
-- y en cascada, cualquier borrado de grupo o lista que tuviera tareas adentro.
alter table public.activity_log drop constraint if exists activity_log_task_id_fkey;
