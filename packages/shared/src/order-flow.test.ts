import { describe, expect, it } from 'vitest';
import { canTransition, customerCanCancel, customerTimeline, nextStatuses, primaryNext } from './order-flow';

describe('دورة الطلب', () => {
  it('التوصيل يمر بالمندوب', () => {
    expect(nextStatuses('ready', 'delivery')).toEqual(['out_for_delivery', 'cancelled']);
    expect(canTransition('ready', 'delivered', 'delivery')).toBe(false);
  });
  it('الاستلام من المكتب يذهب للتسليم مباشرة', () => {
    expect(nextStatuses('ready', 'pickup')).toEqual(['delivered', 'cancelled']);
  });
  it('لا رجوع من الحالات النهائية', () => {
    expect(nextStatuses('cancelled', 'delivery')).toEqual([]);
    expect(nextStatuses('delivered', 'delivery')).toEqual(['returned']);
  });
  it('الزر الرئيسي', () => {
    expect(primaryNext('pending', 'delivery')).toBe('confirmed');
    expect(primaryNext('out_for_delivery', 'delivery')).toBe('delivered');
    expect(primaryNext('delivered', 'delivery')).toBeNull();
  });
  it('الزبون يلغي قبل التجهيز فقط', () => {
    expect(customerCanCancel('pending')).toBe(true);
    expect(customerCanCancel('preparing')).toBe(false);
  });
  it('الخط الزمني للزبون', () => {
    const t = customerTimeline('out_for_delivery', 'delivery');
    expect(t.map((s) => s.state)).toEqual(['done', 'done', 'done', 'current', 'todo']);
    expect(customerTimeline('delivered', 'pickup').every((s) => s.state === 'done')).toBe(true);
    expect(customerTimeline('cancelled', 'delivery').every((s) => s.state === 'todo')).toBe(true);
  });
});
