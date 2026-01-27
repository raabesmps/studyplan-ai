'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, Copy, Check, Calendar, Clock, BookOpen, X } from 'lucide-react';
import { StudyPlan } from '@/types/study-plan';
import { savePlan } from '@/lib/storage';

interface StudyPlanDisplayProps {
  plan: string;
  subject: string;
  hoursPerDay: number;
  days: number;
  onClose?: () => void;
}

export default function StudyPlanDisplay({
  plan,
  subject,
  hoursPerDay,
  days,
  onClose,
}: StudyPlanDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(plan);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    const studyPlan: StudyPlan = {
      id: Date.now().toString(),
      subject,
      hoursPerDay,
      days,
      plan,
      createdAt: new Date().toISOString(),
    };

    savePlan(studyPlan);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-8 border border-slate-700 shadow-2xl mt-8"
    >
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-400" />
            Plano de Estudos: {subject}
          </h3>
          <div className="flex items-center gap-4 text-slate-400 text-sm">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {hoursPerDay}h/dia
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {days} dias
            </span>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        )}
      </div>

      <div className="flex gap-3 mb-6">
        <motion.button
          onClick={handleCopy}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copiar
            </>
          )}
        </motion.button>

        <motion.button
          onClick={handleSave}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg transition-all"
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" />
              Salvo!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Salvar
            </>
          )}
        </motion.button>
      </div>

      <div className="prose prose-invert max-w-none">
        <div
          className="bg-slate-900/50 rounded-lg p-6 text-slate-200 leading-relaxed whitespace-pre-wrap"
          dangerouslySetInnerHTML={{
            __html: plan
              .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
              .replace(/\*(.*?)\*/g, '<em class="text-slate-300">$1</em>')
              .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold text-white mt-6 mb-3">$1</h3>')
              .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold text-white mt-8 mb-4">$1</h2>')
              .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold text-white mt-8 mb-4">$1</h1>')
              .replace(/^- (.*$)/gim, '<li class="ml-4 mb-2">$1</li>')
              .replace(/\n/g, '<br>'),
          }}
        />
      </div>
    </motion.div>
  );
}
