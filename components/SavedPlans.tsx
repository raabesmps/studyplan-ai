'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Trash2, Calendar, Clock } from 'lucide-react';
import { StudyPlan } from '@/types/study-plan';
import { getPlans, deletePlan } from '@/lib/storage';
import { format } from 'date-fns';
import StudyPlanDisplay from './StudyPlanDisplay';

export default function SavedPlans() {
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<StudyPlan | null>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = () => {
    setPlans(getPlans());
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este plano?')) {
      deletePlan(id);
      loadPlans();
      if (selectedPlan?.id === id) {
        setSelectedPlan(null);
      }
    }
  };

  if (plans.length === 0) {
    return null;
  }

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <BookOpen className="w-6 h-6 text-blue-400" />
        Planos Salvos
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {plans.map((plan) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ scale: 1.02 }}
              className="bg-slate-800/50 backdrop-blur-lg rounded-xl p-6 border border-slate-700 cursor-pointer hover:border-blue-500 transition-all"
              onClick={() => setSelectedPlan(plan)}
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-white line-clamp-1">
                  {plan.subject}
                </h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(plan.id);
                  }}
                  className="p-1 hover:bg-slate-700 rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>

              <div className="space-y-2 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {plan.hoursPerDay}h/dia
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {plan.days} dias
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  {format(new Date(plan.createdAt), "dd/MM/yyyy")}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedPlan(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <StudyPlanDisplay
                plan={selectedPlan.plan}
                subject={selectedPlan.subject}
                hoursPerDay={selectedPlan.hoursPerDay}
                days={selectedPlan.days}
                onClose={() => setSelectedPlan(null)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
