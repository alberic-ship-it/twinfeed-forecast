import { useState, useRef, useEffect } from 'react';
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

/** Returns true if the entered time is in the future (more than 1 min ahead). */
function isFutureTime(timeStr: string): boolean {
  if (!timeStr) return false;
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime() > Date.now() + 60_000;
}

export function QuickLog() {
  const logFeed = useStore((s) => s.logFeed);
  const [selectedBaby, setSelectedBaby] = useState<BabyName | null>(null);
  const [showBottle, setShowBottle] = useState(false);
  const [showBreast, setShowBreast] = useState(false);
  const [showSolid, setShowSolid] = useState(false);
  const [mlValue, setMlValue] = useState(130);
  const [portionValue, setPortionValue] = useState<'petite' | 'normale' | 'grande'>('normale');
  const [customTimeStr, setCustomTimeStr] = useState('');
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  // Ref-based guard: prevents double-submission from rapid taps
  const submittingRef = useRef(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); };
  }, []);

  const handleBabyTap = (baby: BabyName) => {
    if (selectedBaby === baby) {
      setSelectedBaby(null);
      setShowBottle(false);
      setShowBreast(false);
      setShowSolid(false);
    } else {
      setSelectedBaby(baby);
      setShowBottle(false);
      setShowBreast(false);
      setShowSolid(false);
    }
  };

  const handleBottle = () => {
    setCustomTimeStr(getCurrentTimeStr());
    setShowBottle(true);
    setShowSolid(false);
  };

  const handleBreast = () => {
    setCustomTimeStr(getCurrentTimeStr());
    setShowBreast(true);
    setShowSolid(false);
  };

  const handleSolid = () => {
    setCustomTimeStr(getCurrentTimeStr());
    setPortionValue('normale');
    setShowSolid(true);
    setShowBottle(false);
    setShowBreast(false);
  };

  const showSaved = (msg: string) => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setSavedMsg(msg);
    savedTimerRef.current = setTimeout(() => setSavedMsg(null), 3000);
  };

  const handleSubmitBottle = () => {
    if (!selectedBaby || submittingRef.current || isFutureTime(customTimeStr)) return;
    submittingRef.current = true;
    const saved = logFeed(selectedBaby, 'bottle', mlValue, buildTimestamp(customTimeStr));
    const msg = saved
      ? `${PROFILES[selectedBaby].name} · ${mlValue} ml enregistré`
      : `${PROFILES[selectedBaby].name} · Déjà enregistré`;
    setSelectedBaby(null);
    setShowBottle(false);
    setMlValue(130);
    setCustomTimeStr('');
    submittingRef.current = false;
    showSaved(msg);
  };

  const handleSubmitBreast = () => {
    if (!selectedBaby || submittingRef.current || isFutureTime(customTimeStr)) return;
    submittingRef.current = true;
    const saved = logFeed(selectedBaby, 'breast', undefined, buildTimestamp(customTimeStr));
    const msg = saved
      ? `${PROFILES[selectedBaby].name} · Tétée enregistrée`
      : `${PROFILES[selectedBaby].name} · Déjà enregistrée`;
    setSelectedBaby(null);
    setShowBreast(false);
    setCustomTimeStr('');
    submittingRef.current = false;
    showSaved(msg);
  };

  const handleSubmitSolid = () => {
    if (!selectedBaby || submittingRef.current || isFutureTime(customTimeStr)) return;
    submittingRef.current = true;
    const saved = logFeed(selectedBaby, 'solid', undefined, buildTimestamp(customTimeStr), portionValue);
    const msg = saved
      ? `${PROFILES[selectedBaby].name} · Solide enregistré (${portionValue})`
      : `${PROFILES[selectedBaby].name} · Déjà enregistré`;
    setSelectedBaby(null);
    setShowSolid(false);
    setPortionValue('normale');
    setCustomTimeStr('');
    submittingRef.current = false;
    showSaved(msg);
  };

  const handleCancel = () => {
    setSelectedBaby(null);
    setShowBottle(false);
    setShowBreast(false);
    setShowSolid(false);
    setPortionValue('normale');
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
      {selectedBaby && !showBottle && !showBreast && !showSolid && (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleBottle}
            className="py-2.5 px-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px]"
          >
            Biberon
          </button>
          <button
            onClick={handleBreast}
            className="py-2.5 px-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px]"
          >
            Tétée
          </button>
          <button
            onClick={handleSolid}
            className="py-2.5 px-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px]"
          >
            Solide
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
          <div className="border-t border-gray-100">
            <div className="flex items-center justify-between px-1 py-1">
              <span className="text-xs text-gray-400">Heure</span>
              <input
                type="time"
                value={customTimeStr}
                onChange={(e) => setCustomTimeStr(e.target.value)}
                className="text-sm text-gray-600 bg-transparent border-0 outline-none tabular-nums"
              />
            </div>
            {isFutureTime(customTimeStr) && (
              <p className="text-[11px] text-red-500 px-1 pb-1">
                Heure dans le futur — corrige l'heure
              </p>
            )}
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
              disabled={isFutureTime(customTimeStr)}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90 active:opacity-80 min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
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
          <div className="border-t border-b border-gray-100">
            <div className="flex items-center justify-between px-1 py-1">
              <span className="text-xs text-gray-400">Heure</span>
              <input
                type="time"
                value={customTimeStr}
                onChange={(e) => setCustomTimeStr(e.target.value)}
                className="text-sm text-gray-600 bg-transparent border-0 outline-none tabular-nums"
              />
            </div>
            {isFutureTime(customTimeStr) && (
              <p className="text-[11px] text-red-500 px-1 pb-1">
                Heure dans le futur — corrige l'heure
              </p>
            )}
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
              disabled={isFutureTime(customTimeStr)}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90 active:opacity-80 min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: BABY_COLORS[selectedBaby] }}
            >
              Valider
            </button>
          </div>
        </div>
      )}

      {/* Solid meal panel */}
      {showSolid && selectedBaby && (
        <div className="space-y-3">
          <p className="text-sm text-center text-gray-500">
            Solide — {PROFILES[selectedBaby].name}
          </p>

          {/* Portion buttons */}
          <div className="flex gap-2">
            {(['petite', 'normale', 'grande'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPortionValue(p)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors min-h-[44px] capitalize ${
                  portionValue === p
                    ? 'text-white border-transparent'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                style={portionValue === p ? { backgroundColor: BABY_COLORS[selectedBaby] } : undefined}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Time row */}
          <div className="border-t border-b border-gray-100">
            <div className="flex items-center justify-between px-1 py-1">
              <span className="text-xs text-gray-400">Heure</span>
              <input
                type="time"
                value={customTimeStr}
                onChange={(e) => setCustomTimeStr(e.target.value)}
                className="text-sm text-gray-600 bg-transparent border-0 outline-none tabular-nums"
              />
            </div>
            {isFutureTime(customTimeStr) && (
              <p className="text-[11px] text-red-500 px-1 pb-1">
                Heure dans le futur — corrige l'heure
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="flex-1 py-2.5 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px]"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmitSolid}
              disabled={isFutureTime(customTimeStr)}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90 active:opacity-80 min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
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
