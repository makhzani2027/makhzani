import { describe, expect, it } from 'vitest';
import { computeTotals, couponDiscount, discountRatio, lineTotal, tender, weightedAvgCost } from './pricing';

describe('حساب السلة', () => {
  it('مجموع بسيط مع توصيل', () => {
    const t = computeTotals({ lines: [{ unit_price: 45000, qty: 1 }, { unit_price: 9000, qty: 2 }], deliveryFee: 5000 });
    expect(t).toMatchObject({ subtotal: 63000, discount: 0, deliveryFee: 5000, total: 68000, itemsCount: 3 });
  });
  it('خصم البند لا يتجاوز قيمته', () => {
    expect(lineTotal({ unit_price: 1000, qty: 2, discount: 5000 })).toBe(0);
    expect(lineTotal({ unit_price: 1000, qty: 2, discount: 500 })).toBe(1500);
  });
  it('كوبون نسبة مع حد أقصى', () => {
    const c = { code: 'X', kind: 'percent' as const, value: 10, min_subtotal: 25000, max_discount: 20000 };
    expect(couponDiscount(c, 100000).amount).toBe(10000);
    expect(couponDiscount(c, 500000).amount).toBe(20000);
    expect(couponDiscount(c, 10000).error).not.toBeNull();
  });
  it('كوبون توصيل مجاني', () => {
    const t = computeTotals({
      lines: [{ unit_price: 60000, qty: 1 }],
      coupon: { code: 'F', kind: 'free_delivery', value: 0, min_subtotal: 50000, max_discount: null },
      deliveryFee: 5000,
    });
    expect(t.deliveryFee).toBe(0);
    expect(t.total).toBe(60000);
  });
  it('توصيل مجاني فوق حد معين (بعد الخصم)', () => {
    const t = computeTotals({ lines: [{ unit_price: 150000, qty: 1 }], deliveryFee: 5000, freeDeliveryOver: 150000 });
    expect(t.deliveryFee).toBe(0);
    const t2 = computeTotals({ lines: [{ unit_price: 150000, qty: 1 }], invoiceDiscount: 1000, deliveryFee: 5000, freeDeliveryOver: 150000 });
    expect(t2.deliveryFee).toBe(5000);
  });
  it('كوبون مبلغ ثابت لا يجعل الإجمالي سالباً', () => {
    const t = computeTotals({ lines: [{ unit_price: 3000, qty: 1 }], coupon: { code: 'B', kind: 'fixed', value: 10000, min_subtotal: 0, max_discount: null } });
    expect(t.total).toBe(0);
  });
  it('نسبة الخصم المعروضة', () => {
    expect(discountRatio(24000, 30000)).toBeCloseTo(0.2);
    expect(discountRatio(30000, 24000)).toBe(0);
    expect(discountRatio(30000, null)).toBe(0);
  });
});

describe('نقطة البيع', () => {
  it('الفكة من النقد فقط', () => {
    expect(tender(68000, [{ method: 'cash', amount: 70000 }])).toEqual({ paid: 70000, remaining: 0, change: 2000, applied: 68000 });
    expect(tender(68000, [{ method: 'card', amount: 60000 }, { method: 'cash', amount: 10000 }])).toEqual({ paid: 70000, remaining: 0, change: 2000, applied: 68000 });
  });
  it('دفع جزئي = دين', () => {
    expect(tender(68000, [{ method: 'cash', amount: 50000 }])).toEqual({ paid: 50000, remaining: 18000, change: 0, applied: 50000 });
  });
  it('متوسط التكلفة المرجّح', () => {
    expect(weightedAvgCost(10, 1000, 10, 2000)).toBe(1500);
    expect(weightedAvgCost(-3, 1000, 5, 2000)).toBe(2000);
    expect(weightedAvgCost(0, 0, 4, 2500)).toBe(2500);
  });
});
