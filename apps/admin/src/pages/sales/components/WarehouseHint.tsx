/**
 * تنبيه «المخزن المختار فارغ»: الكميات قد تكون في مخزن آخر (المخزون يعرض مجموع كل المخازن،
 * بينما البيع والعروض تقرأ من مخزن واحد). يظهر فقط إن كان المخزن المختار بلا أي كمية وغيره فيه كمية،
 * مع زر للانتقال لمخزن المتوفر.
 */
import { Alert, Button } from '../../../ui';
import { useLoad } from '../../../lib/hooks';
import { sellableUnitsByWarehouse } from '../api';

export function WarehouseHint({ warehouses, current, onSwitch, disabled }: {
  warehouses: { id: string; name: string; is_sellable?: boolean }[];
  current: string | undefined;
  onSwitch: (id: string) => void;
  disabled?: boolean;
}) {
  const units = useLoad(sellableUnitsByWarehouse, [current]);
  if (!current || !units.data || warehouses.length < 2) return null;
  const here = units.data[current] ?? 0;
  if (here > 0) return null;
  const best = warehouses
    .filter((w) => w.id !== current && w.is_sellable !== false)
    .map((w) => ({ ...w, units: units.data![w.id] ?? 0 }))
    .sort((a, b) => b.units - a.units)[0];
  if (!best || best.units <= 0) return null;
  const name = warehouses.find((w) => w.id === current)?.name ?? 'المخزن المختار';
  return (
    <Alert tone="warning">
      <span className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="grow">«{name}» المختار ليس فيه أي كمية، لذلك تظهر المنتجات «غير متوفرة». الكميات موجودة في «<b>{best.name}</b>».</span>
        <Button size="sm" variant="primary" disabled={disabled} onClick={() => onSwitch(best.id)}>اعمل من {best.name}</Button>
      </span>
    </Alert>
  );
}
