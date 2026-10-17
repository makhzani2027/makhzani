import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/lib/theme';
import { MARK_HOLE, MARK_PATH } from './brand';
import { ease, easeEmph } from './motion';
import { T } from './ui';

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);

/** رأس الإسفين وحده (الختم الأول) */
const WEDGE = 'M56 17H98L82.5 37.7H71.5Z';
const TAIL_LEN = 300;

/**
 * المقدمة (≈١٫٦ ث مرة عند الفتح): الإسفين يُختم، الذيل يُرسم فيصير «ر»، يُثقب الرأس، ثم تظهر الكلمة.
 * تُتخطى باللمس، وتختفي فوراً مع «تقليل الحركة».
 */
export function Intro({ onDone }: { onDone: () => void }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const stamp = useSharedValue(0);
  const draw = useSharedValue(0);
  const fill = useSharedValue(0);
  const hole = useSharedValue(0);
  const word = useSharedValue(0);
  const out = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      const t = setTimeout(onDone, 50);
      return () => clearTimeout(t);
    }
    stamp.value = withTiming(1, { duration: 320, easing: easeEmph });
    draw.value = withDelay(260, withTiming(1, { duration: 620, easing: Easing.inOut(Easing.cubic) }));
    fill.value = withDelay(760, withTiming(1, { duration: 260, easing: ease }));
    hole.value = withDelay(980, withTiming(1, { duration: 200, easing: easeEmph }));
    word.value = withDelay(1060, withTiming(1, { duration: 300, easing: ease }));
    out.value = withDelay(1450, withTiming(0, { duration: 180, easing: ease }, (fin) => { if (fin) scheduleOnRN(onDone); }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const wedgeStyle = useAnimatedStyle(() => ({
    opacity: stamp.value * (1 - fill.value),
    transform: [{ scale: 1.5 - 0.5 * stamp.value }],
  }));
  const tailProps = useAnimatedProps(() => ({ strokeDashoffset: TAIL_LEN * (1 - draw.value), fillOpacity: fill.value }));
  const holeProps = useAnimatedProps(() => ({ r: MARK_HOLE.r * hole.value }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.value, transform: [{ translateY: 8 * (1 - word.value) }] }));
  const rootStyle = useAnimatedStyle(() => ({ opacity: out.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, zIndex: 900, elevation: 900 }, rootStyle]}>
      <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }} onPress={onDone} accessibilityLabel="تخطي المقدمة">
        <View style={{ width: 132, height: 132 }}>
          <Svg width={132} height={132} viewBox="0 0 120 120" style={StyleSheet.absoluteFill}>
            <APath d={MARK_PATH} fill={c.ink} stroke={c.ink} strokeWidth={3} strokeLinejoin="round" strokeDasharray={TAIL_LEN} animatedProps={tailProps} />
            <ACircle cx={MARK_HOLE.cx} cy={MARK_HOLE.cy} fill={c.accent} animatedProps={holeProps} />
          </Svg>
          <Animated.View style={[StyleSheet.absoluteFill, wedgeStyle]}>
            <Svg width={132} height={132} viewBox="0 0 120 120">
              <Path d={WEDGE} fill={c.ink} stroke={c.ink} strokeWidth={3} strokeLinejoin="round" />
            </Svg>
          </Animated.View>
        </View>
        <Animated.View style={wordStyle}>
          <T family="display" weight="black" size={40} center>رَقيم</T>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
