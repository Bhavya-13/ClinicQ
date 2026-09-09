import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Register from './pages/Register.jsx';
import Token from './pages/Token.jsx';
import Admin from './pages/Admin.jsx';
import DisplayBoard from './pages/DisplayBoard.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/register" />} />
        <Route path="/register" element={<Register />} />
        <Route path="/token/:id" element={<Token />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/display" element={<DisplayBoard />} />
      </Routes>
    </BrowserRouter>
  );
}