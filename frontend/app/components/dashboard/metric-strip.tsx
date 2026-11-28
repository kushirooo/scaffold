'use client';

import { formatCurrency } from '@/lib/projects';
import type { DashboardMetricCard } from '@/lib/dashboard';

const toneClass: Record<NonNullable<DashboardMetricCard['tone']>, string> = {
  default: 'text-slate-900',
  danger: 'text-red-700',
  warning: 'text-amber-700',
  success: 'text-emerald-700',
};

export default function MetricStrip({ cards }: { cards: DashboardMetricCard[] }) {
  if (cards.length === 0) return null;

  return (
    <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl bg-slate-50 p-3.5">
          <p className="text-[11px] font-mono uppercase text-slate-500">{card.label}</p>
          <p className={`mt-1 text-2xl font-semibold ${toneClass[card.tone ?? 'default']}`}>
            {card.format === 'currency' ? formatCurrency(Number(card.value)) : card.value}
          </p>
          {card.hint && <p className="mt-0.5 text-[11px] text-slate-500">{card.hint}</p>}
        </div>
      ))}
    </div>
  );
}
