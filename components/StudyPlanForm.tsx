'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Clock, Calendar, Sparkles } from 'lucide-react';

interface StudyPlanFormProps {
  onGenerate: (subject: string, hoursPerDay: number, days: number) => void;
  loading: boolean;
}

export default function StudyPlanForm({ onGenerate, loading }: StudyPlanFormProps) {
  const [subject, setSubject] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState(1);
  const [days, setDays] = useState(7);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim() && hoursPerDay > 0) {
      onGenerate(subject.trim(), hoursPerDay, days);
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      onSubmit={handleSubmit}
      className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-8 border border-slate-700 shadow-2xl"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white">Criar Plano de Estudos</h2>
      </div>

      <div className="space-y-6">
        <div>
          <label htmlFor="subject" className="flex items-center gap-2 text-slate-300 mb-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            <span className="font-semibold">O que você quer aprender?</span>
          </label>
          <input
            id="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ex: NestJS, React, Python, Machine Learning..."
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            required
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="hours" className="flex items-center gap-2 text-slate-300 mb-2">
              <Clock className="w-5 h-5 text-green-400" />
              <span className="font-semibold">Horas por dia</span>
            </label>
            <input
              id="hours"
              type="number"
              min="1"
              max="24"
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(Number(e.target.value))}
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="days" className="flex items-center gap-2 text-slate-300 mb-2">
              <Calendar className="w-5 h-5 text-purple-400" />
              <span className="font-semibold">Duração (dias)</span>
            </label>
            <input
              id="days"
              type="number"
              min="1"
              max="30"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
              required
              disabled={loading}
            />
          </div>
        </div>

        <motion.button
          type="submit"
          disabled={loading || !subject.trim()}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg shadow-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              />
              Gerando plano...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Gerar Plano de Estudos
            </>
          )}
        </motion.button>
      </div>
    </motion.form>
  );
}
