import { useState, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { useStore } from '../../store';
import { parseCsv } from '../../data/parser';
import type { BabyName } from '../../types';

export function ImportScreen() {
  const [coletteFile, setColetteFile] = useState<string | null>(null);
  const [isaureFile, setIsaureFile] = useState<string | null>(null);
  const [coletteName, setColetteName] = useState('');
  const [isaureName, setIsaureName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const addFeeds = useStore((s) => s.addFeeds);
  const setScreen = useStore((s) => s.setScreen);

  const handleFile = useCallback(
    (baby: BabyName, file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (baby === 'colette') {
          setColetteFile(text);
          setColetteName(file.name);
        } else {
          setIsaureFile(text);
          setIsaureName(file.name);
        }
      };
      reader.readAsText(file);
    },
    [],
  );

  const handleImport = useCallback(() => {
    setError(null);
    try {
      const coletteData = coletteFile ? parseCsv(coletteFile, 'colette') : { feeds: [], sleeps: [] };
      const isaureData = isaureFile ? parseCsv(isaureFile, 'isaure') : { feeds: [], sleeps: [] };

      const allFeeds = [...coletteData.feeds, ...isaureData.feeds].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      );
      const allSleeps = [...coletteData.sleeps, ...isaureData.sleeps].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime(),
      );

      if (allFeeds.length === 0) {
        setError('Aucune donnée de repas trouvée dans les fichiers CSV.');
        return;
      }

      addFeeds(allFeeds, allSleeps);
      setScreen('dashboard');
    } catch {
      setError('Erreur lors du parsing des fichiers CSV. Vérifiez le format.');
    }
  }, [coletteFile, isaureFile, addFeeds, setScreen]);

  const hasFiles = coletteFile || isaureFile;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">TwinFeed Forecast</h1>
          <p className="text-gray-500 mt-2">Importez des données supplémentaires de suivi</p>
        </div>

        <div className="space-y-4">
          {/* Colette upload */}
          <DropZone
            label="Colette"
            color="pink"
            fileName={coletteName}
            onFile={(f) => handleFile('colette', f)}
          />

          {/* Isaure upload */}
          <DropZone
            label="Isaure"
            color="teal"
            fileName={isaureName}
            onFile={(f) => handleFile('isaure', f)}
          />
        </div>

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}

        <button
          onClick={handleImport}
          disabled={!hasFiles}
          className={`w-full py-3 rounded-xl font-medium text-white transition-all min-h-[48px] ${
            hasFiles
              ? 'bg-gray-800 hover:bg-gray-700 cursor-pointer'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          Analyser les données
        </button>

        <button
          onClick={() => setScreen('dashboard')}
          className="w-full py-3 text-sm text-gray-400 hover:text-gray-600 active:text-gray-800 transition-colors min-h-[44px]"
        >
          Passer
        </button>
      </div>
    </div>
  );
}

function DropZone({
  label,
  color,
  fileName,
  onFile,
}: {
  label: string;
  color: 'pink' | 'teal';
  fileName: string;
  onFile: (f: File) => void;
}) {
  const borderColor = color === 'pink' ? 'border-pink-300' : 'border-teal-300';
  const textColor = color === 'pink' ? 'text-pink-600' : 'text-teal-600';
  const bgColor = color === 'pink' ? 'bg-pink-50' : 'bg-teal-50';

  return (
    <label
      className={`block border-2 border-dashed rounded-xl p-4 sm:p-6 text-center cursor-pointer transition-all hover:${bgColor} ${
        fileName ? `${bgColor} ${borderColor}` : 'border-gray-200'
      }`}
    >
      <input
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <Upload className={`mx-auto mb-2 ${fileName ? textColor : 'text-gray-400'}`} size={24} />
      <p className={`font-medium ${fileName ? textColor : 'text-gray-600'}`}>{label}</p>
      <p className="text-xs text-gray-400 mt-1">
        {fileName || 'Glissez un CSV ou cliquez pour sélectionner'}
      </p>
    </label>
  );
}
