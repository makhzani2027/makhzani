import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { tap, easeEmph } from './motion';

export type ViewRef = ComponentRef<typeof View>;
import { Portal } from './portal';

/**
 * «يطير إلى السلة»: صورة المنتج تنتقل بخط منحنٍ إلى أيقونة السلة (في شريط التبويبات أو رأس الصفحة)،
 * والعدّاد ينبض مرة عند الوصول. مع «تقليل الحركة» لا طيران: نبضة العدّاد فقط.
 */
interface Rect { x: number; y: number; w: number; h: number }
interface Flight { id: number; from: Rect; to: Rect; node: ReactNode }

interface FlyValue {
  fly: (from: RefObject<ViewRef | null>, node: ReactNode) => void;
  register: (ref: RefObject<ViewRef | null>) => () => void;
  landed: number;
}

const Ctx = createContext<FlyValue | null>(null);

export type Measurable = { measureInWindow(cb: (x: number, y: number, w: number, h: number) => void): void };

const measure = (ref: RefObject<ViewRef | null>) => new Promise<Rect | null>((resolve) => {
  const v = ref.current;
  if (!v) return resolve(null);
  (v as unknown as Measurable).measureInWindow((x, y, w, h) => resolve(w > 0 ? { x, y, w, h } : null));
});

export function FlyProvider({ children }: { children: ReactNode }) {
  const targets = useRef<RefObject<ViewRef | null>[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [landed, setLanded] = useState(0);
  const reduced = useReducedMotion();
  const seq = useRef(0);

  const register = useCallback((ref: RefObject<ViewRef | null>) => {
    targets.current = [...targets.current.filter((r) => r !== ref), ref];
    return () => { targets.current = targets.current.filter((r) => r !== ref); };
  }, []);

  const fly = useCallback(async (fromRef: RefObject<ViewRef | null>, node: ReactNode) => {
    tap('medium');
    const target = targets.current[targets.current.length - 1];
    const [from, to] = await Promise.all([measure(fromRef), target ? measure(target) : Promise.resolve(null)]);
    if (reduced || !from || !to) {
      setLanded((n) => n + 1);
      return;
    }
    const id = ++seq.current;
    setFlights((f) => [...f, { id, from, to, node }]);
  }, [reduced]);

  const done = useCallback((id: number) => {
    setFlights((f) => f.filter((x) => x.id !== id));
    setLanded((n) => n + 1);
    tap('light');
  }, []);

  const value = useMemo(() => ({ fly, register, landed }), [fly, register, landed]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {flights.length ? (
        <Portal>
          {flights.map((f) => <FlightView key={f.id} flight={f} onDone={done} />)}
        </Portal>
      ) : null}
    </Ctx.Provider>
  );
}

function FlightView({ flight, onDone }: { flight: Flight; onDone: (id: number) => void }) {
  const t = useSharedValue(0);
  const { from, to } = flight;
  const size = Math.min(from.w, from.h, 180);
  useEffect(() => {
    t.value = withTiming(1, { duration: 620, easing: easeEmph }, (fin) => {
      if (fin) scheduleOnRN(onDone, flight.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => {
    const x0 = from.x + from.w / 2;
    const y0 = from.y + from.h / 2;
    const x1 = to.x + to.w / 2;
    const y1 = to.y + to.h / 2;
    // نقطة تحكم فوق الخط الواصل: منحنى قوسي هادئ
    const cx = (x0 + x1) / 2;
    const cy = Math.min(y0, y1) - 120;
    const p = t.value;
    const q = 1 - p;
    const x = q * q * x0 + 2 * q * p * cx + p * p * x1;
    const y = q * q * y0 + 2 * q * p * cy + p * p * y1;
    const s = 1 - 0.84 * p;
    return {
      position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size,
      opacity: p > 0.92 ? (1 - p) / 0.08 : 1,
      transform: [{ scale: s }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ borderRadius: 18, overflow: 'hidden' }, style]}>
      {flight.node}
    </Animated.View>
  );
}

export function useFly() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFly outside provider');
  return v;
}

/** أيقونة سلة تستقبل الطيران؛ focus = تُسجَّل فقط والشاشة ظاهرة (رأس صفحة المنتج) */
export function useCartTarget(kind: 'always' | 'focus' = 'always') {
  const ref = useRef<ViewRef>(null);
  const { register } = useFly();
  useEffect(() => (kind === 'always' ? register(ref) : undefined), [kind, register]);
  useFocusEffect(useCallback(() => (kind === 'focus' ? register(ref) : undefined), [kind, register]));
  return ref;
}
