import { useState } from 'react';
import { useStore } from '../../store';
import { PROFILES, BABY_COLORS } from '../../data/knowledge';
import type { BabyName } from '../../types';

export function QuickLog() {
  const logFeed = useStore((s) => s.logFeed);
  const [selectedBaby, setSelectedBaby] = useState<BabyName | null>(null);
  const [showBottle, setShowBottle] = useState(false);
  const [mlValue, setMlValue] = useState(130);

  const handleBabyTap = (baby: BabyName) => {
    if (selectedBaby === baby) {
      setSelectedBaby(null);
      setShowBottle(false);
    } else {
      setSelectedBaby(baby);
      setShowBottle(false);
    }
  };

  const handleBottle = () => {
    setShowBottle(true);
  };

  const handleBreast = () => {
    if (!selectedBaby) return;
    logFeed(selectedBaby, 'breast');
    setSelectedBaby(null);
    setShowBottle(false);
  };

  const handleSubmitBottle = () => {
    if (!selectedBaby) return;
    logFeed(selectedBaby, 'bottle', mlValue);
    setSelectedBaby(null);
    setShowBottle(false);
    setMlValue(130);
  };

  const handleCancel = () => {
    setSelectedBaby(null);
    setShowBottle(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 space-y-3">
      <p className="text-xs text-gray-400 uppercase tracking-wide">Enregistrer un repas</p>

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

      {/* Feed type buttons */}
      {selectedBaby && !showBottle && (
        <div className="flex gap-2">
          <button
            onClick={handleBottle}
            className="flex-1 py-2.5 px-3 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px]"
          >
            Biberon
          </button>
          <button
            onClick={handleBreast}
            className="flex-1 py-2.5 px-3 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px]"
          >
            Tétée
          </button>
        </div>
      )}

      {/* Bottle ml input */}
      {showBottle && selectedBaby && (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setMlValue(Math.max(30, mlValue - 10))}
              className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 active:bg-gray-300 transition-colors"
            >
              -
            </button>
            <span className="text-3xl font-bold text-gray-800 w-20 text-center tabular-nums">
              {mlValue}
            </span>
            <button
              onClick={() => setMlValue(Math.min(300, mlValue + 10))}
              className="w-11 h-11 rounded-full bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 active:bg-gray-300 transition-colors"
            >
              +
            </button>
          </div>

          <input
            type="range"
            min={30}
            max={300}
            step={5}
            value={mlValue}
            onChange={(e) => setMlValue(Number(e.target.value))}
            className="w-full accent-gray-600"
          />
          <p className="text-xs text-gray-400 text-center">ml</p>

          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="flex-1 py-2.5 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px]"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmitBottle}
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
