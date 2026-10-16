import { useNavigate } from 'react-router-dom';
import { Button, EmptyState } from '../../ui';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="card">
      <EmptyState icon="map" title="الصفحة غير موجودة" text="ربما تغيّر الرابط، أو ليست لديك صلاحية لهذه الصفحة." action={<Button icon="home" onClick={() => navigate('/')}>الرئيسية</Button>} />
    </div>
  );
}
