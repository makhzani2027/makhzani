import { mediaUrl } from '@raqeem/shared';
import { Image } from 'expo-image';
import { useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { env } from '@/lib/env';
import { useTheme } from '@/lib/theme';
import { ProductImage } from './brand';
import { PressScale } from './motion';
import { Portal } from './portal';
import { IconButton } from './ui';

/** صورة قابلة للتكبير بإصبعين، وبلمستين، وتُسحب وهي مكبّرة */
function ZoomImage({ uri, size }: { uri: string; size: number }) {
  const scale = useSharedValue(1);
  const base = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = Math.max(1, Math.min(4, base.value * e.scale)); })
    .onEnd(() => {
      base.value = scale.value;
      if (scale.value <= 1.01) { tx.value = withTiming(0); ty.value = withTiming(0); }
    });
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => { sx.value = tx.value; sy.value = ty.value; })
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      const lim = (size * (scale.value - 1)) / 2;
      tx.value = Math.max(-lim, Math.min(lim, sx.value + e.translationX));
      ty.value = Math.max(-lim, Math.min(lim, sy.value + e.translationY));
    });
  const dbl = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    const to = scale.value > 1 ? 1 : 2.5;
    scale.value = withTiming(to);
    base.value = to;
    if (to === 1) { tx.value = withTiming(0); ty.value = withTiming(0); }
  });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));
  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, dbl)}>
      <Animated.View style={[{ width: size, height: size }, style]}>
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

/** معرض المنتج: سحب أفقي بنقاط، واللمس يفتح عارضاً بملء الشاشة مع التكبير */
export function Gallery({ keys, categoryId, width }: { keys: string[]; categoryId: string | null; width: number }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: win, height: winH } = useWindowDimensions();
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const list = keys.length ? keys : [null];
  const canZoom = !!env.mediaBase && keys.length > 0;

  return (
    <View style={{ gap: 10 }}>
      <FlatList
        horizontal
        pagingEnabled
        data={list}
        keyExtractor={(k, idx) => `${k}-${idx}`}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setI(Math.round(Math.abs(e.nativeEvent.contentOffset.x) / width))}
        renderItem={({ item }) => (
          <PressScale onPress={canZoom ? () => setOpen(true) : undefined} disabled={!canZoom} scaleTo={0.99} style={{ width, padding: 0 }} accessibilityLabel="صورة المنتج">
            <ProductImage imageKey={item} categoryId={categoryId} width={width} radiusPx={0} contentFit="contain" style={{ backgroundColor: c.card }} />
          </PressScale>
        )}
        style={{ width, flexGrow: 0 }}
      />
      {list.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {list.map((_, k) => <View key={k} style={{ height: 6, width: k === i ? 18 : 6, borderRadius: 3, backgroundColor: k === i ? c.accent : c.lineStrong }} />)}
        </View>
      ) : null}
      {open ? (
        <Portal>
          <Animated.View entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(120)} style={[StyleSheet.absoluteFill, { backgroundColor: '#0E100F' }]}>
            <FlatList
              horizontal
              pagingEnabled
              initialScrollIndex={i}
              getItemLayout={(_, idx) => ({ length: win, offset: win * idx, index: idx })}
              data={keys}
              keyExtractor={(k) => k}
              renderItem={({ item }) => (
                <View style={{ width: win, height: winH, alignItems: 'center', justifyContent: 'center' }}>
                  <ZoomImage uri={mediaUrl(item, 'lg', env.mediaBase) ?? ''} size={win} />
                </View>
              )}
            />
            <View style={{ position: 'absolute', top: insets.top + 8, start: 12 }}>
              <IconButton name="close" label="إغلاق" onPress={() => setOpen(false)} />
            </View>
          </Animated.View>
        </Portal>
      ) : null}
    </View>
  );
}
