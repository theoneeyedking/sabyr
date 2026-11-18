import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '../theme';

export type IconName =
  | 'arrowRight' | 'arrowUp' | 'arrowUpRight' | 'arrowDownLeft' | 'chevronRight' | 'chevronLeft'
  | 'clock' | 'shieldCheck' | 'users' | 'phone' | 'screen' | 'check' | 'link' | 'logout'
  | 'info' | 'spark' | 'close' | 'pause' | 'lock';

/** Собственный набор линейных иконок: одна сетка 24×24 и одна толщина линии. */
export function Icon({
  name, size = 24, color = colors.ink, stroke = 2,
}: {
  name: IconName; size?: number; color?: string; stroke?: number;
}) {
  const p = {
    stroke: color, strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'arrowRight' && <Path d="M5 12h14M13 6l6 6-6 6" {...p} />}
      {name === 'arrowUp' && <Path d="M12 19V5M6 11l6-6 6 6" {...p} />}
      {name === 'arrowUpRight' && <Path d="M7 17 17 7M8 7h9v9" {...p} />}
      {name === 'arrowDownLeft' && <Path d="M17 7 7 17M16 17H7V8" {...p} />}
      {name === 'chevronRight' && <Path d="m9 6 6 6-6 6" {...p} />}
      {name === 'chevronLeft' && <Path d="m15 6-6 6 6 6" {...p} />}
      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="9" {...p} />
          <Path d="M12 7v5l3.2 2" {...p} />
        </>
      )}
      {name === 'shieldCheck' && (
        <>
          <Path d="M12 3 19 6v5.5c0 4.3-2.9 8-7 9.5-4.1-1.500-7-5.200-7-9.500V6l7-3Z" {...p} />
          <Path d="m9 12 2.200 2.200L15.200 10" {...p} />
        </>
      )}
      {name === 'users' && (
        <>
          <Circle cx="9" cy="8" r="3.2" {...p} />
          <Path d="M3 19c0-3.300 2.700-5.500 6-5.500s6 2.200 6 5.500M16 5.200a3.200 3.200 0 0 1 0 5.600M17.500 13.900c2.100.6 3.500 2.400 3.500 5.100" {...p} />
        </>
      )}
      {name === 'phone' && (
        <Path
          d="M6.500 3.500h2.700l1.400 4-1.900 1.400a11 11 0 0 0 6.400 6.400l1.400-1.900 4 1.400v2.700a2 2 0 0 1-2.200 2A16.500 16.500 0 0 1 4.500 5.700a2 2 0 0 1 2-2.200Z"
          {...p}
        />
      )}
      {name === 'screen' && (
        <>
          <Rect x="3" y="4" width="18" height="12" rx="2.500" {...p} />
          <Path d="M8 20h8M12 16v4" {...p} />
        </>
      )}
      {name === 'check' && <Path d="m5 12.500 4.500 4.500L19 7.500" {...p} />}
      {name === 'link' && (
        <Path
          d="M10 14a4 4 0 0 0 5.700 0l3-3A4 4 0 0 0 13 5.300l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"
          {...p}
        />
      )}
      {name === 'logout' && <Path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" {...p} />}
      {name === 'info' && (
        <>
          <Circle cx="12" cy="12" r="9" {...p} />
          <Path d="M12 11v5M12 7.800v.1" {...p} />
        </>
      )}
      {name === 'spark' && <Path d="m12 3 1.900 5.100L19 10l-5.100 1.900L12 17l-1.900-5.100L5 10l5.100-1.900L12 3Z" {...p} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6 6 18" {...p} />}
      {name === 'pause' && <Path d="M9 6v12M15 6v12" {...p} strokeWidth={stroke + 1.2} />}
      {name === 'lock' && (
        <>
          <Rect x="5" y="11" width="14" height="9" rx="2.500" {...p} />
          <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...p} />
        </>
      )}
    </Svg>
  );
}
