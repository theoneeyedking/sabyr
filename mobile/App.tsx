import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from './src/components/ui';
import type { RootStackParamList } from './src/navigation';
import { ConfirmScreen } from './src/screens/ConfirmScreen';
import { DemoMenuScreen } from './src/screens/DemoMenuScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { SabyrScreen } from './src/screens/SabyrScreen';
import { TransferScreen } from './src/screens/TransferScreen';
import { TrustedScreen } from './src/screens/TrustedScreen';
import { AppProvider, useApp } from './src/state/AppContext';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary, text: colors.ink },
};

function Root() {
  const { ready, token, client } = useApp();
  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <Loading />
      </View>
    );
  }
  const signedIn = !!token && !!client;
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {signedIn ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Transfer" component={TransferScreen} />
            <Stack.Screen name="Confirm" component={ConfirmScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="Sabyr" component={SabyrScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="Trusted" component={TrustedScreen} />
            <Stack.Screen name="History" component={HistoryScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
        <Stack.Screen name="DemoMenu" component={DemoMenuScreen} options={{ presentation: 'modal' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}
