import { useStore } from './store';
import { useInitApp } from './hooks/usePredictions';
import { ImportScreen } from './components/Import/ImportScreen';
import { DashboardScreen } from './components/Dashboard/DashboardScreen';
import { InsightsScreen } from './components/Insights/InsightsScreen';

function App() {
  useInitApp();
  const screen = useStore((s) => s.screen);

  switch (screen) {
    case 'import':
      return <ImportScreen />;
    case 'dashboard':
      return <DashboardScreen />;
    case 'insights':
      return <InsightsScreen />;
    default:
      return <DashboardScreen />;
  }
}

export default App;
