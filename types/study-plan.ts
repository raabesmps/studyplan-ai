export interface StudyPlan {
  id: string;
  subject: string;
  hoursPerDay: number;
  days: number;
  plan: string;
  createdAt: string;
}

export interface StudyDay {
  day: number;
  title: string;
  objective: string;
  content: string[];
  links: string[];
  exercises: string[];
}
