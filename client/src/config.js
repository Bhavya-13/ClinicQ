// In production, VITE_SERVER_URL is set in Vercel (e.g. https://clinicq-api.onrender.com).
// Locally, it falls back to this computer on port 3001.
const SERVER = (import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`).replace(/\/$/, '');

export default SERVER;