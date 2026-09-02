// A small hand-rolled icon set — 20 icons beat a 900-icon dependency, and
// every glyph here is tuned to 1.5px strokes on a 16px grid.

import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconGauge = (p: Props) => (
  <Icon {...p}>
    <path d="M2.5 12a5.5 5.5 0 1 1 11 0" />
    <path d="M8 12 10.6 7.6" />
  </Icon>
);

export const IconBoard = (p: Props) => (
  <Icon {...p}>
    <rect x="2" y="2.5" width="3.6" height="11" rx="1" />
    <rect x="6.6" y="2.5" width="3.6" height="7.5" rx="1" />
    <rect x="11.2" y="2.5" width="2.8" height="5" rx="1" />
  </Icon>
);

export const IconTable = (p: Props) => (
  <Icon {...p}>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="M2 6.4h12M6.5 6.4V13" />
  </Icon>
);

export const IconBell = (p: Props) => (
  <Icon {...p}>
    <path d="M4 6.8a4 4 0 0 1 8 0c0 2.2.6 3.3 1.1 3.9.3.3.1.8-.3.8H3.2c-.4 0-.6-.5-.3-.8.5-.6 1.1-1.7 1.1-3.9Z" />
    <path d="M6.4 13.2a1.8 1.8 0 0 0 3.2 0" />
  </Icon>
);

export const IconCalendar = (p: Props) => (
  <Icon {...p}>
    <rect x="2" y="3.2" width="12" height="10.6" rx="1.5" />
    <path d="M2 6.4h12M5.4 2v2.4M10.6 2v2.4" />
  </Icon>
);

export const IconTimeline = (p: Props) => (
  <Icon {...p}>
    <path d="M2 4h7M2 8h11M2 12h5" />
    <circle cx="11.2" cy="4" r="1.3" />
    <circle cx="7.4" cy="12" r="1.3" />
  </Icon>
);

export const IconBuilding = (p: Props) => (
  <Icon {...p}>
    <path d="M2.6 13.5V4.2a1 1 0 0 1 .7-1l4-1.1a1 1 0 0 1 1.3 1v10.4" />
    <path d="M8.6 6.2h4a1 1 0 0 1 1 1v6.3M1.5 13.5h13" />
    <path d="M5 5.6v.01M5 8.2v.01M5 10.8v.01M10.8 8.8v.01M10.8 11.2v.01" />
  </Icon>
);

export const IconChart = (p: Props) => (
  <Icon {...p}>
    <path d="M2 13.5h12" />
    <path d="M4.2 13.5V9M7.4 13.5V4.5M10.6 13.5V7M13.8 13.5v-2" />
  </Icon>
);

export const IconPlus = (p: Props) => (
  <Icon {...p}>
    <path d="M8 3.2v9.6M3.2 8h9.6" />
  </Icon>
);

export const IconSearch = (p: Props) => (
  <Icon {...p}>
    <circle cx="7.2" cy="7.2" r="4.2" />
    <path d="m10.4 10.4 3 3" />
  </Icon>
);

export const IconChevronDown = (p: Props) => (
  <Icon {...p}>
    <path d="m4 6 4 4 4-4" />
  </Icon>
);

export const IconChevronRight = (p: Props) => (
  <Icon {...p}>
    <path d="m6 3.5 4.5 4.5L6 12.5" />
  </Icon>
);

export const IconChevronLeft = (p: Props) => (
  <Icon {...p}>
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </Icon>
);

export const IconX = (p: Props) => (
  <Icon {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);

export const IconExternal = (p: Props) => (
  <Icon {...p}>
    <path d="M6.4 3.2H3.6a1 1 0 0 0-1 1v8.2a1 1 0 0 0 1 1h8.2a1 1 0 0 0 1-1V9.6" />
    <path d="M9.4 2.6h4v4M13.4 2.6 7.6 8.4" />
  </Icon>
);

export const IconCheck = (p: Props) => (
  <Icon {...p}>
    <path d="m3 8.4 3.2 3.2L13 4.8" />
  </Icon>
);

export const IconClock = (p: Props) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="5.8" />
    <path d="M8 4.6V8l2.2 1.6" />
  </Icon>
);

export const IconAlert = (p: Props) => (
  <Icon {...p}>
    <path d="M7.1 2.7 1.9 11.6a1 1 0 0 0 .9 1.5h10.4a1 1 0 0 0 .9-1.5L8.9 2.7a1 1 0 0 0-1.8 0Z" />
    <path d="M8 6.4v2.8M8 11.2v.01" />
  </Icon>
);

export const IconArrowUp = (p: Props) => (
  <Icon {...p}>
    <path d="M8 12.5v-9M4.4 7 8 3.4 11.6 7" />
  </Icon>
);

export const IconArrowDown = (p: Props) => (
  <Icon {...p}>
    <path d="M8 3.5v9M4.4 9l3.6 3.6L11.6 9" />
  </Icon>
);

export const IconArrowRight = (p: Props) => (
  <Icon {...p}>
    <path d="M3 8h10M9.2 4.2 13 8l-3.8 3.8" />
  </Icon>
);

export const IconFilter = (p: Props) => (
  <Icon {...p}>
    <path d="M2.4 3.6h11.2L9.4 8.5v4.3l-2.8 1.2V8.5L2.4 3.6Z" />
  </Icon>
);

export const IconDownload = (p: Props) => (
  <Icon {...p}>
    <path d="M8 2.4v7.4M5 7l3 3 3-3M2.8 12.8h10.4" />
  </Icon>
);

export const IconDots = (p: Props) => (
  <Icon {...p}>
    <path d="M3.4 8h.01M8 8h.01M12.6 8h.01" strokeWidth={2.2} />
  </Icon>
);

export const IconPhone = (p: Props) => (
  <Icon {...p}>
    <path d="M5.6 2.6 3.2 3.4c-.6.2-1 .8-.9 1.4.5 4 3.9 7.4 7.9 7.9.6.1 1.2-.3 1.4-.9l.8-2.4-2.8-1.2-1.1 1.4a8.6 8.6 0 0 1-3.4-3.4L6.5 5 5.6 2.6Z" />
  </Icon>
);

export const IconMail = (p: Props) => (
  <Icon {...p}>
    <rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.4" />
    <path d="m2.4 4.6 5.6 4 5.6-4" />
  </Icon>
);

export const IconChat = (p: Props) => (
  <Icon {...p}>
    <path d="M13.6 8.6c0 2.4-2.5 4.4-5.6 4.4-.7 0-1.4-.1-2-.3l-3.2 1.1 1-2.6c-.8-.7-1.4-1.6-1.4-2.6C2.4 6.2 4.9 4.2 8 4.2s5.6 2 5.6 4.4Z" />
  </Icon>
);

export const IconUsers = (p: Props) => (
  <Icon {...p}>
    <circle cx="6" cy="5.6" r="2.4" />
    <path d="M1.8 13.2a4.4 4.4 0 0 1 8.4 0" />
    <path d="M10.6 3.6a2.4 2.4 0 0 1 0 4.6M11.6 9.6a4.4 4.4 0 0 1 2.6 3.6" />
  </Icon>
);

export const IconEdit = (p: Props) => (
  <Icon {...p}>
    <path d="M10.6 2.8 13.2 5.4 6 12.6l-3.2.6.6-3.2 7.2-7.2Z" />
  </Icon>
);

export const IconTrash = (p: Props) => (
  <Icon {...p}>
    <path d="M2.8 4.4h10.4M6 4.4V3a.8.8 0 0 1 .8-.8h2.4A.8.8 0 0 1 10 3v1.4" />
    <path d="M4.2 4.4 4.8 13a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-8.6" />
  </Icon>
);

export const IconSort = (p: Props) => (
  <Icon {...p}>
    <path d="M4.6 3v10M2.4 10.8l2.2 2.2 2.2-2.2M11.4 13V3M9.2 5.2 11.4 3l2.2 2.2" />
  </Icon>
);

export const IconMenu = (p: Props) => (
  <Icon {...p}>
    <path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" />
  </Icon>
);

export const IconTrello = (p: Props) => (
  <Icon {...p}>
    <rect x="2" y="2" width="12" height="12" rx="2.2" />
    <rect x="4.4" y="4.4" width="3" height="6.4" rx="0.7" />
    <rect x="8.8" y="4.4" width="3" height="4" rx="0.7" />
  </Icon>
);

export const IconLayers = (p: Props) => (
  <Icon {...p}>
    <path d="M8 1.8 14.2 5 8 8.2 1.8 5 8 1.8Z" />
    <path d="m2.4 8 5.6 2.9L13.6 8M2.4 11l5.6 2.9L13.6 11" />
  </Icon>
);

export const IconTarget = (p: Props) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="5.8" />
    <circle cx="8" cy="8" r="2.4" />
  </Icon>
);

export const IconSpark = (p: Props) => (
  <Icon {...p}>
    <path d="M8 1.8 9.4 6l4.2 1.4-4.2 1.4L8 13l-1.4-4.2L2.4 7.4 6.6 6 8 1.8Z" />
  </Icon>
);
