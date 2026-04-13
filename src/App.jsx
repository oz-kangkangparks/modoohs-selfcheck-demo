import { Routes, Route } from 'react-router-dom';
import { DiagnosisProvider } from './hooks/useDiagnosis';
import HomePage from './pages/HomePage';
import DiagnosisPage from './pages/DiagnosisPage';
import AnalyzingPage from './pages/AnalyzingPage';
import ResultPage from './pages/ResultPage';
import ExpertsPage from './pages/ExpertsPage';
import HistoryPage from './pages/HistoryPage';
import IntroPage from './pages/IntroPage';

export default function App() {
  return (
    <DiagnosisProvider>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/diagnosis" element={<DiagnosisPage />} />
          <Route path="/analyzing" element={<AnalyzingPage />} />
          <Route path="/result/:id" element={<ResultPage />} />
          <Route path="/experts" element={<ExpertsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/intro" element={<IntroPage />} />
        </Routes>
      </div>
    </DiagnosisProvider>
  );
}
