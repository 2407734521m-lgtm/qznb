import { Navigate } from 'react-router-dom';

/** Legacy route: keep old notification links working, but open the unified message center. */
export default function MeNotifications() {
  return <Navigate to="/friends?tab=notifications" replace />;
}
