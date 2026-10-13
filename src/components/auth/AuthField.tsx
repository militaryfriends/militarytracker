/**
 * 로그인 · 회원가입 입력칸 — 칸 안의 이름표가 포커스되거나 값이 있으면 위로 작게 올라간다.
 * 포커스: 테두리가 밝아진다. error: 빨간 테두리. secure: 비밀번호 보기/숨기기 버튼.
 */
import { forwardRef, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { D, FIELD } from './palette';

type Props = Omit<TextInputProps, 'style' | 'placeholder' | 'secureTextEntry'> & {
  label: string;
  error?: boolean;
  secure?: boolean;
};

export const AuthField = forwardRef<TextInput, Props>(function AuthField(
  { label, value, error = false, secure = false, onFocus, onBlur, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  const f = useSharedValue(0);
  const up = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    f.value = withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused, f]);
  useEffect(() => {
    up.value = withTiming(focused || !!value ? 1 : 0, { duration: 180, easing: Easing.bezier(0.2, 0.7, 0.2, 1) });
  }, [focused, value, up]);

  const boxStyle = useAnimatedStyle(() => ({
    borderColor: error ? FIELD.errorLine : interpolateColor(f.value, [0, 1], [D.line, FIELD.focusLine]),
    backgroundColor: interpolateColor(f.value, [0, 1], [D.panel, FIELD.focusBg]),
  }), [error]);
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(f.value, [0, 1], [D.muted, D.ink]),
    transform: [{ translateY: -10 * up.value }, { scale: 1 - 0.2667 * up.value }],
  }));

  return (
    <Animated.View style={[styles.box, boxStyle]}>
      <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>{label}</Animated.Text>
      <TextInput
        ref={ref}
        {...rest}
        value={value}
        secureTextEntry={secure && !shown}
        accessibilityLabel={label}
        selectionColor={D.ink}
        cursorColor={D.ink}
        keyboardAppearance="dark"
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[styles.input, secure && { paddingRight: 52 }]}
      />
      {secure ? (
        <Pressable
          onPress={() => setShown((v) => !v)}
          hitSlop={4}
          style={styles.eye}
          accessibilityRole="button"
          accessibilityLabel={shown ? '비밀번호 숨기기' : '비밀번호 보기'}
        >
          <Ionicons name={shown ? 'eye-outline' : 'eye-off-outline'} size={20} color={D.muted} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  box: { height: 56, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  label: {
    position: 'absolute', left: 16, top: 18, fontSize: 15, lineHeight: 20,
    transformOrigin: 'left center',
  },
  input: {
    position: 'absolute', left: 0, top: 0, right: 0, bottom: 0,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 20 : 22,
    paddingBottom: Platform.OS === 'android' ? 2 : 6,
    fontSize: 15,
    color: D.ink,
    includeFontPadding: false,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  eye: { position: 'absolute', right: 4, top: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
