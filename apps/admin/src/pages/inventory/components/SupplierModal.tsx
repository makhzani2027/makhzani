import { useState } from 'react';
import type { Supplier } from '@raqeem/shared';
import { Button, Field, Input, Modal, Textarea } from '../../../ui';
import { useAction } from '../../../lib/hooks';
import { saveSupplier, type SupplierDraft } from '../api';

export const emptySupplier = (name = ''): SupplierDraft => ({ name, company: null, phone: null, phone2: null, address: null, notes: null });

/** إضافة/تعديل مورد (يُستعمل أيضاً للإضافة السريعة من فاتورة الشراء) */
export function SupplierModal({ draft, onClose, onSaved }: { draft: SupplierDraft; onClose: () => void; onSaved: (s: Supplier) => void }) {
  const [s, setS] = useState(draft);
  const [tried, setTried] = useState(false);
  const save = useAction(saveSupplier, { success: draft.id ? 'حُفظ المورد' : 'أُضيف المورد' });
  const submit = async () => {
    setTried(true);
    if (!s.name.trim()) return;
    const r = await save.run(s);
    if (r) { onSaved(r); onClose(); }
  };
  return (
    <Modal open onClose={onClose} title={draft.id ? 'تعديل المورد' : 'مورد جديد'} width={540}
      footer={<><Button variant="primary" loading={save.busy} onClick={submit}>{draft.id ? 'حفظ المورد' : 'إضافة المورد'}</Button><Button onClick={onClose}>إلغاء</Button></>}>
      <div className="grid-2">
        <Field label="الاسم" required error={tried && !s.name.trim() ? 'اسم المورد إلزامي' : null}><Input value={s.name} autoFocus onChange={(e) => setS({ ...s, name: e.target.value })} /></Field>
        <Field label="الشركة"><Input value={s.company ?? ''} onChange={(e) => setS({ ...s, company: e.target.value || null })} /></Field>
        <Field label="الهاتف"><Input value={s.phone ?? ''} dir="ltr" inputMode="tel" onChange={(e) => setS({ ...s, phone: e.target.value || null })} placeholder="07XX XXX XXXX" /></Field>
        <Field label="هاتف آخر"><Input value={s.phone2 ?? ''} dir="ltr" inputMode="tel" onChange={(e) => setS({ ...s, phone2: e.target.value || null })} /></Field>
      </div>
      <Field label="العنوان"><Input value={s.address ?? ''} onChange={(e) => setS({ ...s, address: e.target.value || null })} placeholder="بغداد — شارع الصناعة" /></Field>
      <Field label="ملاحظات"><Textarea rows={2} value={s.notes ?? ''} onChange={(e) => setS({ ...s, notes: e.target.value || null })} /></Field>
    </Modal>
  );
}
