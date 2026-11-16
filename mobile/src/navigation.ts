import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { TransferState } from './api/types';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Transfer: undefined;
  Confirm: { transfer: TransferState };
  Sabyr: { transfer: TransferState };
  Trusted: undefined;
  History: undefined;
  DemoMenu: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
