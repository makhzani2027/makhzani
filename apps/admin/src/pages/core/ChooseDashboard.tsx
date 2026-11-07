/** حساب صاحب رقيم المدير أيضاً في متجر: يختار بعد الدخول — متجره أو لوحة إدارة المتاجر */
import { Button, Icon, Mark } from '../../ui';
import { imgUrl } from '../../lib/media';
import './login.css';

export type DashMode = 'platform' | 'store';

export default function ChooseDashboard({ storeName, storeLogo, onPick, onSignOut }: {
  storeName: string; storeLogo: string | null; onPick: (m: DashMode) => void; onSignOut: () => void;
}) {
  const logo = imgUrl(storeLogo, 'sm');
  const card = { display: 'flex', alignItems: 'center', gap: 14, padding: 16, textAlign: 'start' as const, cursor: 'pointer', font: 'inherit', color: 'inherit', width: '100%' };
  return (
    <div className="login-page">
      <main className="login-form" style={{ gridColumn: '1 / -1' }}>
        <div className="col" style={{ gap: 16, width: 'min(460px, 100%)' }}>
          <Mark size={56} />
          <div>
            <h2 style={{ fontSize: 28 }}>إلى أين تريد الدخول؟</h2>
            <p className="dim">حسابك يدير منصة رقيم، وهو أيضاً مدير في متجر.</p>
          </div>
          <button type="button" className="card" style={card} onClick={() => onPick('platform')}>
            <span style={{ width: 48, height: 48, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-soft-ink)' }}><Icon name="store" size={24} /></span>
            <span className="grow"><b style={{ fontSize: 17 }}>لوحة إدارة رقيم</b><div className="small dim">المتاجر المشتركة، طلبات المشتركين الجدد، موقع رقيم</div></span>
            <Icon name="chevronLeft" size={18} />
          </button>
          <button type="button" className="card" style={card} onClick={() => onPick('store')}>
            {logo ? <img src={logo} alt="" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 12, background: '#fff' }} />
              : <span style={{ width: 48, height: 48, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--sunken)', fontWeight: 900, fontSize: 20 }}>{storeName.slice(0, 1)}</span>}
            <span className="grow"><b style={{ fontSize: 17 }}>{storeName}</b><div className="small dim">المتجر الذي تديره: المنتجات والمخزون والبيع</div></span>
            <Icon name="chevronLeft" size={18} />
          </button>
          <Button variant="ghost" block onClick={onSignOut}>تسجيل الخروج</Button>
        </div>
      </main>
    </div>
  );
}
