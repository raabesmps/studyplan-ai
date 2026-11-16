'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Check, Clock, Calendar, Copy, GraduationCap, X } from 'lucide-react';
import DayCard from './DayCard';
import ProgressBar from './ProgressBar';
import { planToMarkdown } from '@/lib/export';
import {
  countCompletedDays,
  isDayComplete,
  toggleDay,
  toggleExercise,
} from '@/lib/progress';
import { updateProgress, type SavedPlan } from '@/lib/plans-store';
import type { Day, Level } from '@/lib/schema';

const LEVEL_LABELS: Record<Level, string> = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
};

interface StudyPlanDisplayProps {
  saved: SavedPlan;
  onClose?: () => void;
}

export default function StudyPlanDisplay({ saved, onClose }: StudyPlanDisplayProps) {
  const [copied, setCopied] = useState(false);
  const { plan, completed } = saved;
  const doneDays = countCompletedDays(plan, completed);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(planToMarkdown(plan, saved.language));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; nothing else to do.
    }
  };

  const onToggleExercise = (day: Day, index: number) =>
    updateProgress(saved.id, toggleExercise(completed, day, index));
  const onToggleDay = (day: Day) => updateProgress(saved.id, toggleDay(completed, day));

  return (
    <motion.section
      aria-labelledby="plan-title"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 rounded-2xl border border-slate-700 bg-slate-800/50 p-4 sm:p-8 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="plan-title" className="flex items-start gap-2 text-2xl font-bold text-white break-words">
            <BookOpen className="mt-1 h-6 w-6 shrink-0 text-blue-400" aria-hidden="true" />
            <span>Plano de Estudos: {plan.subject}</span>
          </h2>
          <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-300">
            <li className="flex items-center gap-1">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {saved.hoursPerDay}h/dia
            </li>
            <li className="flex items-center gap-1">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              {plan.days.length} dias
            </li>
            <li className="flex items-center gap-1">
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
              {LEVEL_LABELS[plan.level]}
            </li>
          </ul>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar plano"
            className="rounded-lg p-2 text-slate-300 hover:bg-slate-700"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="mt-5">
        <ProgressBar done={doneDays} total={plan.days.length} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-white transition-colors hover:bg-slate-600"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copiar como Markdown
            </>
          )}
        </button>
        <p className="text-sm text-slate-300">Salvo automaticamente neste navegador.</p>
      </div>

      <div className="mt-6 space-y-4">
        {plan.days.map((day) => (
          <DayCard
            key={day.day}
            day={day}
            done={completed[String(day.day)] ?? []}
            complete={isDayComplete(completed, day)}
            onToggleExercise={(index) => onToggleExercise(day, index)}
            onToggleDay={() => onToggleDay(day)}
          />
        ))}
      </div>
    </motion.section>
  );
}
