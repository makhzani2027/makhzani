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

/** مسار موجود لكن الموظف لا يملك صلاحيته (بدلها يقع /products/new مثلاً في /products/:id بمعرّف «new») */
export function NoAccess() {
  const navigate = useNavigate();
  return (
    <div className="card">
      <EmptyState icon="lock" title="ليست لديك صلاحية لهذه الصفحة" text="اطلب من صاحب المتجر إضافة الصلاحية لدورك." action={<Button icon="home" onClick={() => navigate('/')}>الرئيسية</Button>} />
    </div>
  );
}
