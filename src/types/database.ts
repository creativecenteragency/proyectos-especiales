// Tipos escritos a mano que reflejan supabase/migrations/0001_init.sql.
// No es un archivo generado; si el schema cambia, actualizar acá también.

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  is_master: boolean
  created_at: string
}

export interface Client {
  id: string
  name: string
  slug: string
  logo_url: string | null
  logo_url_negative: string | null
  brand_color: string | null
  created_at: string
}

export type ProjectStatus = 'propuesta' | 'activo' | 'pausado' | 'cerrado'

export interface Project {
  id: string
  client_id: string
  name: string
  slug: string
  description: string | null
  total_budget: number
  currency: string
  start_date: string | null
  end_date: string | null
  status: ProjectStatus
  proposal_summary: string | null
  proposal_objectives: string | null
  created_at: string
}

export interface RoadmapItem {
  id: string
  project_id: string
  quarter_label: string
  title: string
  period_label: string | null
  bullets: string[]
  sort_order: number
  created_at: string
}

export type ProjectRole = 'team' | 'auditor'

export interface ProjectMember {
  project_id: string
  user_id: string
  role: ProjectRole
  created_at: string
}

export interface Axis {
  id: string
  project_id: string
  name: string
  color: string
  budget_amount: number
  sort_order: number
  created_at: string
}

export interface List {
  id: string
  project_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface Group {
  id: string
  list_id: string
  name: string
  sort_order: number
  created_at: string
}

export type TaskStatus = 'preparacion' | 'planificado' | 'en_curso' | 'hecho' | 'bloqueado'

export interface Task {
  id: string
  group_id: string
  parent_task_id: string | null
  axis_id: string | null
  provider_id: string | null
  campaign_ref: string | null
  title: string
  description: string | null
  status: TaskStatus
  tags: string[]
  custom_fields: Record<string, unknown>
  planned_amount: number
  actual_amount: number
  assignee_id: string | null
  due_date: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Provider {
  id: string
  name: string
  cuit: string | null
  created_at: string
}

export type Aggregator = 'windsor' | 'mastermetrics' | 'metricool'

export interface ApiCredential {
  id: string
  aggregator: Aggregator
  api_key: string
  updated_at: string
  updated_by: string | null
}

export type IntegrationProvider ='facebook' | 'google_ads' | 'instagram' | 'google_analytics' | 'tiendanube' | 'metricool_organic'

export interface Integration {
  id: string
  project_id: string
  provider: IntegrationProvider
  account_ref: string
  label: string
  created_at: string
}

export interface AxisChangeLog {
  id: string
  project_id: string
  axis_id: string | null
  action: 'created' | 'updated' | 'deleted'
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  reason: string | null
  user_id: string | null
  created_at: string
}

export interface Comment {
  id: string
  task_id: string
  author_id: string
  body: string
  created_at: string
}

export interface AxisBudgetSummary {
  axis_id: string
  project_id: string
  name: string
  color: string
  budget_amount: number
  planned_total: number
  actual_total: number
  balance: number
}

// Suficiente para que supabase-js tipe .from('tabla') sin generar el schema completo.
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> }
      clients: { Row: Client; Insert: Partial<Client>; Update: Partial<Client> }
      projects: { Row: Project; Insert: Partial<Project>; Update: Partial<Project> }
      project_members: { Row: ProjectMember; Insert: Partial<ProjectMember>; Update: Partial<ProjectMember> }
      axes: { Row: Axis; Insert: Partial<Axis>; Update: Partial<Axis> }
      lists: { Row: List; Insert: Partial<List>; Update: Partial<List> }
      groups: { Row: Group; Insert: Partial<Group>; Update: Partial<Group> }
      tasks: { Row: Task; Insert: Partial<Task>; Update: Partial<Task> }
      comments: { Row: Comment; Insert: Partial<Comment>; Update: Partial<Comment> }
      providers: { Row: Provider; Insert: Partial<Provider>; Update: Partial<Provider> }
      axis_change_log: { Row: AxisChangeLog; Insert: Partial<AxisChangeLog>; Update: Partial<AxisChangeLog> }
    }
    Views: {
      axis_budget_summary: { Row: AxisBudgetSummary }
    }
  }
}
