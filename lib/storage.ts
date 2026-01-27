import { StudyPlan } from '@/types/study-plan';

const STORAGE_KEY = 'studyplan-ai-plans';

export function savePlan(plan: StudyPlan): void {
  const plans = getPlans();
  plans.unshift(plan); // Adiciona no início
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
}

export function getPlans(): StudyPlan[] {
  if (typeof window === 'undefined') return [];
  
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function getPlan(id: string): StudyPlan | null {
  const plans = getPlans();
  return plans.find(p => p.id === id) || null;
}

export function deletePlan(id: string): void {
  const plans = getPlans();
  const filtered = plans.filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function clearPlans(): void {
  localStorage.removeItem(STORAGE_KEY);
}
