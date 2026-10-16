import { useLocation } from 'react-router-dom';
import { EmptyState, PageHeader } from '../../ui';

/** صفحة مؤقتة حتى يبنيها الوكيل المسؤول (تُحذف عند اكتمال كل الصفحات) */
export default function UnderConstruction() {
  const { pathname } = useLocation();
  return (
    <>
      <PageHeader title="قيد البناء" description={`الصفحة ${pathname} يجري بناؤها الآن.`} />
      <div className="card"><EmptyState icon="settings" title="قريباً" text="هذه الصفحة جزء من خطة العمل في system/07-screens.md." /></div>
    </>
  );
}
