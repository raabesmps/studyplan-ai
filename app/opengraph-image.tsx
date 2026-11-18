import { ImageResponse } from 'next/og';

export const alt = 'StudyPlan AI: planos de estudo que você pode marcar como feitos';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const DAYS = ['Fundamentos', 'Prática guiada', 'Revisão espaçada', 'Mini projeto'];

// Static card for link previews, drawn with the app's own palette (paper, ink, "pen" blue).
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f2f4f7',
          color: '#11141c',
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 34, fontWeight: 700 }}>
          <div style={{ width: 20, height: 20, borderRadius: 10, background: '#2748e8' }} />
          StudyPlan AI
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 940 }}>
            Planos de estudo que você pode marcar como feitos
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            {DAYS.map((label, index) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 20px',
                  borderRadius: 14,
                  background: '#ffffff',
                  border: '2px solid #d5dae3',
                  fontSize: 26,
                  color: '#566074',
                }}
              >
                <span style={{ color: '#2748e8', fontWeight: 800 }}>{index + 1}</span>
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size
  );
}
