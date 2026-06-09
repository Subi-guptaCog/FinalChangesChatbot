export enum TaskStatus {
  NEW = "New",
  IN_PROGRESS = "In progress",
  CODE_COMPLETED = "code completed",
  WAITING_FOR_QA = "waiting for QA",
  READY = "ready",
  DONE = "done",

  // Backward compatibility mappings
  TODO = "New",
  COMPLETED = "done"
}

export enum TaskPriority {
  LOW = "Low",
  MEDIUM = "Medium",
  HIGH = "High"
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  category?: string;
  createdAt: string;
}

export interface ChatAction {
  type: "ADD_TASK" | "UPDATE_TASK" | "DELETE_TASK" | "COMPLETE_TASK" | "NONE";
  payload?: any;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  actions?: ChatAction[];
}

export interface UserProfile {
  name: string;
  emailOrPhone: string;
  provider: "google" | "apple" | "facebook" | "gmail" | "phone";
  avatarUrl?: string;
  phoneCountryCode?: string;
}
