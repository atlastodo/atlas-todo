/** Atlas Todo's entity models (moved from `@atlastodo/client-core`). Timestamps are Unix ms. */

export type Priority = 1 | 2 | 3 | 4;

export type ProjectKind = "project" | "folder";
/** How a project opens when the URL does not say: its task list or its board. */
export type ProjectView = "list" | "board";

export interface Task {
  id: string;
  project_id: string | null;
  section_id: string | null;
  parent_id: string | null;
  title: string;
  notes: string;
  priority: Priority;
  start_at: number | null;
  due_at: number | null;
  is_completed: boolean;
  completed_at: number | null;
  archived_at: number | null;
  deleted_at: number | null;
  recurrence: string | null;
  assignee_id: string | null;
  estimate_min: number | null;
  label_ids: string[];
  sort_order: number;
  created_at: number;
  updated_at: number;
  /** Some field is undecryptable ciphertext; typed fields hold placeholders, so don't edit a locked task. */
  locked?: boolean;
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  is_favorite: boolean;
  parent_id: string | null;
  kind: ProjectKind;
  default_view: ProjectView;
  archived_at: number | null;
  deleted_at: number | null;
}

export interface Section {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  deleted_at: number | null;
  archived_at: number | null;
}

export interface Label {
  id: string;
  owner_id: string;
  name: string;
  color: string;
}

export interface CreateTaskInput {
  title: string;
  notes?: string;
  priority?: Priority;
  project_id?: string | null;
  section_id?: string | null;
  parent_id?: string | null;
  start_at?: number | null;
  due_at?: number | null;
  recurrence?: string | null;
  assignee_id?: string | null;
  estimate_min?: number | null;
  label_ids?: string[];
  sort_order?: number;
}
