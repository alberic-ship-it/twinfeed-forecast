import { useState } from 'react';
import { useStore } from '../../store';
import { PROFILES, BABY_COLORS } from '../../data/knowledge';
import type { BabyName } from '../../types';

export function SleepLog() {
  const logSleep = useStore((s) => s.logSleep);
  const [selectedBaby, setSelectedBaby] = useState<BabyName | null>(null);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(35);

  const handleBabyTap = (baby: BabyName) => {
    setSelectedBaby(selectedBaby === baby ? null : baby);
  };

  const handleSubmit = () => {
    if (!selectedBaby) return;
    const totalMin = hours * 60 + minutes;
    if (totalMin === 0) return;
    logSleep(selectedBaby, totalMin);
    setSelectedBaby(null);
    setHours(0);
    setMinutes(35);
  };

  const handleCancel = () => {
    setSelectedBaby(null);
    setHours(0);
    setMinutes(35);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 space-y-3">
      <p className="text-xs text-gray-400 uppercase tracking-wide">Enregistrer un dodo</p>

      {/* Baby buttons */}
      <div className="grid grid-cols-2 gap-2">
        {(['colette', 'isaure'] as BabyName[]).map((baby) => {
          const profile = PROFILES[baby];
          const color = BABY_COLORS[baby];
          const isSelected = selectedBaby === baby;

          return (
            <button
              key={baby}
              onClick={() => handleBabyTap(baby)}
              className={`py-3 px-3 rounded-lg font-medium text-sm transition-all min-h-[44px] ${
                isSelected
                  ? 'text-white scale-105 shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={isSelected ? { backgroundColor: color } : undefined}
            >
              {profile.name}
            </button>
          );
        })}
      </div>

      {/* Duration input */}
      {selectedBaby && (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-4">
            {/* Hours */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => setHours(Math.min(3, hours + 1))}
                className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                +
              </button>
              <span className="text-2xl font-bold text-gray-800 tabular-nums">{hours}h</span>
              <button
                onClick={() => setHours(Math.max(0, hours - 1))}
                className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                -
              </button>
            </div>

            {/* Minutes */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => setMinutes(Math.min(55, minutes + 5))}
                className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                +
              </button>
              <span className="text-2xl font-bold text-gray-800 tabular-nums">
                {String(minutes).padStart(2, '0')}min
              </span>
              <button
                onClick={() => setMinutes(Math.max(0, minutes - 5))}
                className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                -
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="flex-1 py-2.5 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px]"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90 active:opacity-80 min-h-[44px]"
              style={{ backgroundColor: BABY_COLORS[selectedBaby] }}
            >
              Valider
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
