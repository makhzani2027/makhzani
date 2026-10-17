import AsyncStorage from '@react-native-async-storage/async-storage';

/** تخزين محلي بصيغة JSON لا يرمي أبداً (الذاكرة الممتلئة أو المتصفح الخاص لا يوقفان التطبيق) */
export const storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw == null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // التخزين تحسين فقط
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // لا شيء
    }
  },
};
