import './AppAnnouncementDialog.css';

export type AppAnnouncement = {
  id: number;
  title: string;
  body: string;
  created_at: string;
};

export default function AppAnnouncementDialog({
  announcement,
  onDismiss,
}: {
  announcement: AppAnnouncement;
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="qz-app-notice-overlay" role="presentation">
      <section className="qz-app-notice-card" role="dialog" aria-modal="true" aria-labelledby="qz-app-notice-title">
        <div className="qz-app-notice-kicker"><span /> 软件公告</div>
        <h2 id="qz-app-notice-title">{announcement.title}</h2>
        <div className="qz-app-notice-body">{announcement.body}</div>
        <div className="qz-app-notice-time">{new Date(announcement.created_at).toLocaleString()}</div>
        <button type="button" className="qz-app-notice-confirm" onClick={() => onDismiss(announcement.id)}>我知道了</button>
      </section>
    </div>
  );
}
