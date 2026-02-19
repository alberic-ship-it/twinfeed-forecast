import { useState, useRef } from 'react';
import { useStore } from '../../store';
import { PROFILES, BABY_COLORS } from '../../data/knowledge';
import type { BabyName } from '../../types';

export function SleepLog() {
  const logSleep = useStore((s) => s.logSleep);
  const [selectedBaby, setSelectedBaby] = useState<BabyName | null>(null);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(35);
  const [mode, setMode] = useState<'now' | 'custom'>('now');
  const [endHour, setEndHour] = useState(() => new Date().getHours());
  const [endMin, setEndMin] = useState(() => Math.round(new Date().getMinutes() / 5) * 5);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const showSaved = (msg: string) => {
    setSavedMsg(msg);
    setTimeout(() => setSavedMsg(null), 3000);
  };

  const handleBabyTap = (baby: BabyName) => {
    setSelectedBaby(selectedBaby === baby ? null : baby);
  };

  const handleSubmit = () => {
    if (!selectedBaby || submittingRef.current) return;
    const totalMin = hours * 60 + minutes;
    if (totalMin === 0) return;

    submittingRef.current = true;

    let endTime: Date | undefined;
    if (mode === 'custom') {
      endTime = new Date();
      endTime.setHours(endHour, endMin, 0, 0);
      // Si l'heure saisie est dans le futur, on considère que c'était hier
      if (endTime > new Date()) {
        endTime.setDate(endTime.getDate() - 1);
      }
    }

    const durationLabel = hours > 0 ? `${hours}h${String(minutes).padStart(2, '0')}` : `${minutes} min`;
    const msg = `${PROFILES[selectedBaby].name} · Sieste ${durationLabel} enregistrée`;

    logSleep(selectedBaby, totalMin, endTime);
    setSelectedBaby(null);
    setHours(0);
    setMinutes(35);
    setMode('now');
    submittingRef.current = false;
    showSaved(msg);
  };

  const handleCancel = () => {
    setSelectedBaby(null);
    setHours(0);
    setMinutes(35);
    setMode('now');
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 space-y-3">
      {savedMsg ? (
        <p className="text-xs font-medium text-green-600 flex items-center gap-1">
          <span>✓</span> {savedMsg}
        </p>
      ) : (
        <p className="text-xs text-gray-400 uppercase tracking-wide">Enregistrer un dodo</p>
      )}

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

      {/* Duration + end time input */}
      {selectedBaby && (
        <div className="space-y-3">
          {/* Duration */}
          <div className="flex items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => setHours(Math.min(14, hours + 1))}
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

          {/* Mode toggle: now vs custom end time */}
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            <button
              onClick={() => setMode('now')}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors min-h-[36px] ${
                mode === 'now'
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              Vient de se réveiller
            </button>
            <button
              onClick={() => {
                setMode('custom');
                const now = new Date();
                setEndHour(now.getHours());
                setEndMin(Math.round(now.getMinutes() / 5) * 5);
              }}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors min-h-[36px] ${
                mode === 'custom'
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              Réveil à...
            </button>
          </div>

          {/* Custom end time picker */}
          {mode === 'custom' && (
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs text-gray-500">Réveillé(e) à</span>
              <div className="flex items-center gap-1 bg-gray-50 rounded-lg px-2 py-1">
                <button
                  onClick={() => setEndHour((h) => (h + 23) % 24)}
                  className="w-8 h-8 rounded-full text-gray-500 font-bold hover:bg-gray-200 active:bg-gray-300 transition-colors text-xs"
                >
                  -
                </button>
                <span className="text-lg font-bold text-gray-800 tabular-nums w-8 text-center">
                  {String(endHour).padStart(2, '0')}
                </span>
                <button
                  onClick={() => setEndHour((h) => (h + 1) % 24)}
                  className="w-8 h-8 rounded-full text-gray-500 font-bold hover:bg-gray-200 active:bg-gray-300 transition-colors text-xs"
                >
                  +
                </button>
              </div>
              <span className="text-lg font-bold text-gray-400">:</span>
              <div className="flex items-center gap-1 bg-gray-50 rounded-lg px-2 py-1">
                <button
                  onClick={() => setEndMin((m) => (m + 55) % 60)}
                  className="w-8 h-8 rounded-full text-gray-500 font-bold hover:bg-gray-200 active:bg-gray-300 transition-colors text-xs"
                >
                  -
                </button>
                <span className="text-lg font-bold text-gray-800 tabular-nums w-8 text-center">
                  {String(endMin).padStart(2, '0')}
                </span>
                <button
                  onClick={() => setEndMin((m) => (m + 5) % 60)}
                  className="w-8 h-8 rounded-full text-gray-500 font-bold hover:bg-gray-200 active:bg-gray-300 transition-colors text-xs"
                >
                  +
                </button>
              </div>
            </div>
          )}

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
