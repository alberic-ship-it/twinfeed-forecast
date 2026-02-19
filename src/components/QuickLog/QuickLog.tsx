import { useState, useRef } from 'react';
import { useStore } from '../../store';
import { PROFILES, BABY_COLORS } from '../../data/knowledge';
import type { BabyName } from '../../types';

function getCurrentTimeStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function buildTimestamp(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  // If more than 1 min in the future, assume it refers to yesterday (e.g. 23:30 logged at 08:00)
  if (d.getTime() > Date.now() + 60_000) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

export function QuickLog() {
  const logFeed = useStore((s) => s.logFeed);
  const [selectedBaby, setSelectedBaby] = useState<BabyName | null>(null);
  const [showBottle, setShowBottle] = useState(false);
  const [showBreast, setShowBreast] = useState(false);
  const [mlValue, setMlValue] = useState(130);
  const [customTimeStr, setCustomTimeStr] = useState('');
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  // Ref-based guard: prevents double-submission from rapid taps
  const submittingRef = useRef(false);

  const handleBabyTap = (baby: BabyName) => {
    if (selectedBaby === baby) {
      setSelectedBaby(null);
      setShowBottle(false);
      setShowBreast(false);
    } else {
      setSelectedBaby(baby);
      setShowBottle(false);
      setShowBreast(false);
    }
  };

  const handleBottle = () => {
    setCustomTimeStr(getCurrentTimeStr());
    setShowBottle(true);
  };

  const handleBreast = () => {
    setCustomTimeStr(getCurrentTimeStr());
    setShowBreast(true);
  };

  const showSaved = (msg: string) => {
    setSavedMsg(msg);
    setTimeout(() => setSavedMsg(null), 3000);
  };

  const handleSubmitBottle = () => {
    if (!selectedBaby || submittingRef.current) return;
    submittingRef.current = true;
    logFeed(selectedBaby, 'bottle', mlValue, buildTimestamp(customTimeStr));
    const msg = `${PROFILES[selectedBaby].name} · ${mlValue} ml enregistré`;
    setSelectedBaby(null);
    setShowBottle(false);
    setMlValue(130);
    setCustomTimeStr('');
    submittingRef.current = false;
    showSaved(msg);
  };

  const handleSubmitBreast = () => {
    if (!selectedBaby || submittingRef.current) return;
    submittingRef.current = true;
    logFeed(selectedBaby, 'breast', undefined, buildTimestamp(customTimeStr));
    const msg = `${PROFILES[selectedBaby].name} · Tétée enregistrée`;
    setSelectedBaby(null);
    setShowBreast(false);
    setCustomTimeStr('');
    submittingRef.current = false;
    showSaved(msg);
  };

  const handleCancel = () => {
    setSelectedBaby(null);
    setShowBottle(false);
    setShowBreast(false);
    setCustomTimeStr('');
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 space-y-3">
      {savedMsg ? (
        <p className="text-xs font-medium text-green-600 flex items-center gap-1">
          <span>✓</span> {savedMsg}
        </p>
      ) : (
        <p className="text-xs text-gray-400 uppercase tracking-wide">Enregistrer un repas</p>
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

      {/* Feed type buttons */}
      {selectedBaby && !showBottle && !showBreast && (
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

          {/* Time row */}
          <div className="flex items-center justify-between px-1 py-1 border-t border-gray-100">
            <span className="text-xs text-gray-400">Heure</span>
            <input
              type="time"
              value={customTimeStr}
              onChange={(e) => setCustomTimeStr(e.target.value)}
              className="text-sm text-gray-600 bg-transparent border-0 outline-none tabular-nums"
            />
          </div>

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

      {/* Breast confirm panel */}
      {showBreast && selectedBaby && (
        <div className="space-y-3">
          <p className="text-sm text-center text-gray-500">
            Tétée — {PROFILES[selectedBaby].name}
          </p>

          {/* Time row */}
          <div className="flex items-center justify-between px-1 py-1 border-t border-b border-gray-100">
            <span className="text-xs text-gray-400">Heure</span>
            <input
              type="time"
              value={customTimeStr}
              onChange={(e) => setCustomTimeStr(e.target.value)}
              className="text-sm text-gray-600 bg-transparent border-0 outline-none tabular-nums"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="flex-1 py-2.5 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px]"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmitBreast}
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
