'use client';

import { useState } from 'react';
import { RotateCw, Sparkles } from 'lucide-react';
import { LANGUAGES, LEVELS, SUBJECT_MAX_LENGTH, type Language, type Level, type PlanRequest } from '@/lib/schema';
import { useT } from '@/lib/use-locale';

interface StudyPlanFormProps {
  onGenerate: (input: PlanRequest) => void;
  loading: boolean;
}

export default function StudyPlanForm({ onGenerate, loading }: StudyPlanFormProps) {
  const { t, locale } = useT();
  const [subject, setSubject] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState(1);
  const [days, setDays] = useState(7);
  const [level, setLevel] = useState<Level>('beginner');
  // Until the learner picks one, the plan follows the interface language.
  const [languageChoice, setLanguageChoice] = useState<Language | null>(null);
  const language = languageChoice ?? locale;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim() && hoursPerDay > 0) {
      onGenerate({ subject: subject.trim(), hoursPerDay, days, level, language });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-xl font-extrabold tracking-tight">{t.form.title}</h2>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="subject" className="mb-1.5 block font-semibold">
            {t.form.subject}
          </label>
          <input
            id="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={SUBJECT_MAX_LENGTH}
            placeholder={t.form.subjectPlaceholder}
            className="field text-lg"
            required
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="hours" className="mb-1.5 block font-semibold">
              {t.form.hours}
            </label>
            <input
              id="hours"
              type="number"
              min="1"
              max="24"
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(Number(e.target.value))}
              className="field"
              required
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="days" className="mb-1.5 block font-semibold">
              {t.form.days}
            </label>
            <input
              id="days"
              type="number"
              min="1"
              max="30"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="field"
              required
              disabled={loading}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="level" className="mb-1.5 block font-semibold">
              {t.form.level}
            </label>
            <select
              id="level"
              value={level}
              onChange={(e) => setLevel(e.target.value as Level)}
              className="field"
              disabled={loading}
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t.levels[l]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="language" className="mb-1.5 block font-semibold">
              {t.form.planLanguage}
            </label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguageChoice(e.target.value as Language)}
              className="field"
              disabled={loading}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {t.languages[l]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button type="submit" disabled={loading || !subject.trim()} className="btn btn-primary w-full text-base">
          {loading ? (
            <>
              <RotateCw className="h-5 w-5 animate-spin" aria-hidden="true" />
              {t.form.submitting}
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              {t.form.submit}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
